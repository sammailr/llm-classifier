const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function fetchAPI(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'API request failed');
  }

  return response.json();
}

// Batches
export const getBatches = () => fetchAPI('/batches');
export const getBatch = (id) => fetchAPI(`/batches/${id}`);
export const createBatch = (data) => fetchAPI('/batches', {
  method: 'POST',
  body: JSON.stringify(data),
});
export const createBatchWithFile = (formData) =>
  fetch(`${API_BASE_URL}/batches`, {
    method: 'POST',
    body: formData,
  }).then(r => r.json());
export const cancelBatch = (id) => fetchAPI(`/batches/${id}/cancel`, { method: 'POST' });
export const deleteBatch = (id) => fetchAPI(`/batches/${id}`, { method: 'DELETE' });

// Prompts
export const getPrompts = () => fetchAPI('/prompts');
export const getPrompt = (id) => fetchAPI(`/prompts/${id}`);
export const createPrompt = (data) => fetchAPI('/prompts', {
  method: 'POST',
  body: JSON.stringify(data),
});
export const updatePrompt = (id, data) => fetchAPI(`/prompts/${id}`, {
  method: 'PUT',
  body: JSON.stringify(data),
});
export const deletePrompt = (id) => fetchAPI(`/prompts/${id}`, { method: 'DELETE' });

// Jobs
export const getJobStats = () => fetchAPI('/jobs/stats');

// Stats
export const getOpenAIStats = () => fetchAPI('/stats/openai');
