import { useState, useEffect } from 'react';
import { getPrompts, createPrompt, updatePrompt, deletePrompt } from '../api';

function Prompts() {
  const [prompts, setPrompts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    system_prompt: '',
    model: 'gpt-3.5-turbo',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPrompts();
  }, []);

  async function loadPrompts() {
    try {
      const data = await getPrompts();
      setPrompts(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (editing) {
        const updated = await updatePrompt(editing.id, formData);
        setPrompts(prompts.map(p => (p.id === editing.id ? updated : p)));
      } else {
        const created = await createPrompt(formData);
        setPrompts([created, ...prompts]);
      }

      setFormData({ name: '', system_prompt: '', model: 'gpt-3.5-turbo' });
      setEditing(null);
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this prompt?')) return;

    try {
      await deletePrompt(id);
      setPrompts(prompts.filter(p => p.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  function handleEdit(prompt) {
    setEditing(prompt);
    setFormData({
      name: prompt.name,
      system_prompt: prompt.system_prompt,
      model: prompt.model,
    });
    setShowForm(true);
  }

  function handleCancel() {
    setEditing(null);
    setFormData({ name: '', system_prompt: '', model: 'gpt-3.5-turbo' });
    setShowForm(false);
  }

  if (loading && prompts.length === 0) {
    return <div className="loading">Loading prompts...</div>;
  }

  return (
    <div>
      <div className="flex-between">
        <h2>Prompts</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)}>+ New Prompt</button>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {showForm && (
        <div className="card">
          <h3>{editing ? 'Edit Prompt' : 'New Prompt'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., MCA Classifier v2"
                required
              />
            </div>

            <div className="form-group">
              <label>Model</label>
              <select
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              >
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
              </select>
            </div>

            <div className="form-group">
              <label>System Prompt</label>
              <textarea
                value={formData.system_prompt}
                onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                placeholder="Enter your classification prompt..."
                required
                rows={15}
              />
            </div>

            <div className="flex">
              <button type="submit" disabled={loading}>
                {editing ? 'Update' : 'Create'} Prompt
              </button>
              <button type="button" className="secondary" onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {prompts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            No custom prompts yet. The default MCA classifier will be used.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Model</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map(prompt => (
                <tr key={prompt.id}>
                  <td>{prompt.name}</td>
                  <td>{prompt.model}</td>
                  <td className="small-text">{new Date(prompt.created_at).toLocaleString()}</td>
                  <td>
                    <div className="flex">
                      <button onClick={() => handleEdit(prompt)}>Edit</button>
                      <button className="danger" onClick={() => handleDelete(prompt.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Prompts;
