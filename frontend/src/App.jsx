import { useState } from 'react';
import Batches from './components/Batches';
import Prompts from './components/Prompts';
import NewBatch from './components/NewBatch';

function App() {
  const [activeTab, setActiveTab] = useState('batches');

  return (
    <div>
      <h1>LLM Website Classifier</h1>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'batches' ? 'active' : ''}`}
          onClick={() => setActiveTab('batches')}
        >
          Batches
        </button>
        <button
          className={`tab ${activeTab === 'new-batch' ? 'active' : ''}`}
          onClick={() => setActiveTab('new-batch')}
        >
          New Batch
        </button>
        <button
          className={`tab ${activeTab === 'prompts' ? 'active' : ''}`}
          onClick={() => setActiveTab('prompts')}
        >
          Prompts
        </button>
      </div>

      {activeTab === 'batches' && <Batches />}
      {activeTab === 'new-batch' && <NewBatch />}
      {activeTab === 'prompts' && <Prompts />}
    </div>
  );
}

export default App;
