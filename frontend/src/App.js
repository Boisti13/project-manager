import React from 'react';
import TaskList from './components/TaskList';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>📋 Project Manager</h1>
        <p className="App-subtitle">Organize your tasks hierarchically</p>
      </header>
      <main>
        <TaskList />
      </main>
      <footer className="App-footer">
        <p>© 2026 Project Manager | FastAPI + React</p>
      </footer>
    </div>
  );
}

export default App;
