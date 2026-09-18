import React, { useState } from 'react';
import TaskList from './components/TaskList';
import ProjectList from './components/ProjectList';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('tasks');

  return (
    <div className="App">
      <header className="App-header">
        <h1>📋 Project Manager</h1>
        <p className="App-subtitle">Organize your tasks hierarchically</p>
        <nav className="App-nav">
          <button
            className={`nav-tab ${activeTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            Tasks
          </button>
          <button
            className={`nav-tab ${activeTab === 'projects' ? 'active' : ''}`}
            onClick={() => setActiveTab('projects')}
          >
            Projects
          </button>
        </nav>
      </header>
      <main>
        {activeTab === 'tasks' ? <TaskList /> : <ProjectList />}
      </main>
      <footer className="App-footer">
        <p>© 2026 Project Manager | FastAPI + React</p>
      </footer>
    </div>
  );
}

export default App;
