import { useState, useEffect } from 'react';
import { getBatches, getBatch, deleteBatch, getOpenAIStats } from '../api';

function Batches() {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openAIStats, setOpenAIStats] = useState(null);

  useEffect(() => {
    loadBatches();
    const interval = setInterval(loadBatches, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  async function loadBatches() {
    try {
      const data = await getBatches();
      setBatches(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleViewBatch(batchId) {
    try {
      const data = await getBatch(batchId);
      setSelectedBatch(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleExportBatch(batchId) {
    try {
      const data = await getBatch(batchId);
      exportToCSV(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteBatch(batchId) {
    if (!confirm('Are you sure you want to delete this batch?')) return;

    try {
      await deleteBatch(batchId);
      setBatches(batches.filter(b => b.id !== batchId));
      if (selectedBatch?.id === batchId) {
        setSelectedBatch(null);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function getStatusBadge(status) {
    const classMap = {
      pending: 'badge-warning',
      processing: 'badge-info',
      completed: 'badge-success',
      failed: 'badge-error',
    };
    return <span className={`badge ${classMap[status] || ''}`}>{status}</span>;
  }

  function exportToCSV(batch) {
    if (!batch.websites || batch.websites.length === 0) {
      alert('No data to export');
      return;
    }

    // Create CSV headers
    const headers = [
      'URL',
      'Status',
      'Is MCA Lender/Broker',
      'Business Model',
      'Confidence',
      'Primary Services',
      'Evidence',
      'Exclusion Reason',
      'Error Message',
      'Processed At'
    ];

    // Create CSV rows
    const rows = batch.websites.map(website => {
      const result = website.classification_results?.[0];
      return [
        website.url,
        website.status,
        result?.is_mca_lender_broker !== undefined ? result.is_mca_lender_broker : '',
        result?.business_model || '',
        result?.confidence || '',
        result?.primary_services?.join('; ') || '',
        result?.evidence?.join('; ') || '',
        result?.exclusion_reason || '',
        website.error_message || '',
        website.processed_at ? new Date(website.processed_at).toLocaleString() : ''
      ];
    });

    // Convert to CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${batch.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (loading) return <div className="loading">Loading batches...</div>;

  return (
    <div>
      <h2>Batches</h2>

      {error && <div className="error">{error}</div>}

      {selectedBatch ? (
        <div>
          <div className="flex" style={{ gap: '1rem', marginBottom: '1rem' }}>
            <button className="secondary" onClick={() => setSelectedBatch(null)}>
              ← Back to Batches
            </button>
            <button onClick={() => exportToCSV(selectedBatch)}>
              Export to CSV
            </button>
          </div>

          <div className="card">
            <div className="flex-between">
              <h2>{selectedBatch.name}</h2>
              {getStatusBadge(selectedBatch.status)}
            </div>

            <div className="small-text" style={{ marginTop: '0.5rem' }}>
              Created: {new Date(selectedBatch.created_at).toLocaleString()}
            </div>

            <div style={{ marginTop: '1rem' }}>
              <strong>Progress:</strong> {selectedBatch.completed_count || 0} / {selectedBatch.total_count}
              {selectedBatch.failed_count > 0 && (
                <span className="badge-error" style={{ marginLeft: '0.5rem' }}>
                  {selectedBatch.failed_count} failed
                </span>
              )}
            </div>

            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${(selectedBatch.completed_count / selectedBatch.total_count) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Websites</h3>
            <table>
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Status</th>
                  <th>Classification</th>
                  <th>Confidence</th>
                  <th>Business Model</th>
                </tr>
              </thead>
              <tbody>
                {selectedBatch.websites?.map(website => (
                  <tr key={website.id}>
                    <td>{website.url}</td>
                    <td>{getStatusBadge(website.status)}</td>
                    <td>
                      {website.classification_results?.[0]?.is_mca_lender_broker !== undefined
                        ? website.classification_results[0].is_mca_lender_broker
                          ? '✓ Yes'
                          : '✗ No'
                        : '-'}
                    </td>
                    <td>
                      {website.classification_results?.[0]?.confidence
                        ? `${(website.classification_results[0].confidence * 100).toFixed(0)}%`
                        : '-'}
                    </td>
                    <td>{website.classification_results?.[0]?.business_model || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Classification Stats</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map(batch => {
                const yesCount = batch.classification_yes || 0;
                const noCount = batch.classification_no || 0;
                const totalClassified = yesCount + noCount;
                const yesPercentage = totalClassified > 0
                  ? ((yesCount / totalClassified) * 100).toFixed(0)
                  : 0;

                return (
                  <tr key={batch.id}>
                    <td>{batch.name}</td>
                    <td>{getStatusBadge(batch.status)}</td>
                    <td>
                      {batch.completed_count || 0} / {batch.total_count}
                      {batch.failed_count > 0 && (
                        <span className="small-text" style={{ marginLeft: '0.5rem', color: '#dc2626' }}>
                          ({batch.failed_count} failed)
                        </span>
                      )}
                    </td>
                    <td>
                      {totalClassified > 0 ? (
                        <div style={{ fontSize: '0.875rem' }}>
                          <div style={{ color: '#059669' }}>✓ Yes: {yesCount} ({yesPercentage}%)</div>
                          <div style={{ color: '#6b7280' }}>✗ No: {noCount}</div>
                        </div>
                      ) : (
                        <span className="small-text" style={{ color: '#6b7280' }}>-</span>
                      )}
                    </td>
                    <td>
                      <div className="flex">
                        <button onClick={() => handleViewBatch(batch.id)}>View</button>
                        <button onClick={() => handleExportBatch(batch.id)}>Export CSV</button>
                        <button className="danger" onClick={() => handleDeleteBatch(batch.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {batches.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              No batches yet. Create one to get started!
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Batches;
