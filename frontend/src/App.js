import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Nav from './components/Nav';
import TaskList from './components/TaskList';
import ProjectList from './components/ProjectList';
import Settings from './components/Settings';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="App">
        <header className="App-header">
          <h1>📋 Project Manager</h1>
          <p className="App-subtitle">Organize your tasks hierarchically</p>
        </header>
        <Nav />
        <main>
          <Routes>
            <Route path="/" element={<TaskList />} />
            <Route path="/projects" element={<ProjectList />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <footer className="App-footer">
          <p>© 2026 Project Manager | FastAPI + React</p>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
