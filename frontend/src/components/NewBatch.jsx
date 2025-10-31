import { useState, useEffect } from 'react';
import { createBatch, createBatchWithFile, getPrompts } from '../api';

function NewBatch() {
  const [name, setName] = useState('');
  const [urls, setUrls] = useState('');
  const [file, setFile] = useState(null);
  const [promptId, setPromptId] = useState('');
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [inputMethod, setInputMethod] = useState('text'); // 'text' or 'file'

  useEffect(() => {
    loadPrompts();
  }, []);

  async function loadPrompts() {
    try {
      const data = await getPrompts();
      setPrompts(data);
    } catch (err) {
      console.error('Failed to load prompts:', err);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (inputMethod === 'file' && file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);
        if (promptId) formData.append('prompt_id', promptId);

        await createBatchWithFile(formData);
      } else {
        await createBatch({
          name,
          urls: urls.split('\n').map(u => u.trim()).filter(Boolean),
          prompt_id: promptId || null,
        });
      }

      setSuccess('Batch created successfully! Jobs are being processed.');
      setName('');
      setUrls('');
      setFile(null);
      setPromptId('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Create New Batch</h2>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Batch Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., MCA Lenders Batch 1"
              required
            />
          </div>

          <div className="form-group">
            <label>Select Prompt</label>
            <select value={promptId} onChange={(e) => setPromptId(e.target.value)}>
              <option value="">Default MCA Classifier</option>
              {prompts.map(prompt => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Input Method</label>
            <div className="flex">
              <button
                type="button"
                className={inputMethod === 'text' ? '' : 'secondary'}
                onClick={() => setInputMethod('text')}
              >
                Paste URLs
              </button>
              <button
                type="button"
                className={inputMethod === 'file' ? '' : 'secondary'}
                onClick={() => setInputMethod('file')}
              >
                Upload CSV
              </button>
            </div>
          </div>

          {inputMethod === 'text' ? (
            <div className="form-group">
              <label>URLs (one per line)</label>
              <textarea
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder="https://example.com&#10;https://another-example.com"
                required
                rows={10}
              />
            </div>
          ) : (
            <div className="form-group">
              <label>CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files[0])}
                required
              />
              <div className="small-text" style={{ marginTop: '0.5rem' }}>
                CSV should have a column named "url", "website", or "URL"
              </div>
            </div>
          )}

          <button type="submit" disabled={loading}>
            {loading ? 'Creating Batch...' : 'Create Batch'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default NewBatch;
