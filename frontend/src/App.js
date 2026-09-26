import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Nav from './components/Nav';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import TaskList from './components/TaskList';
import ProjectList from './components/ProjectList';
import Settings from './components/Settings';
import './App.css';

const REPO_URL = 'https://github.com/Boisti13/project-manager';

function AppShell() {
  const { currentUser } = useAuth();

  return (
    <div className="App">
      <header className="App-header">
        <h1>📋 Project Manager</h1>
        <p className="App-subtitle">Organize your tasks hierarchically</p>
      </header>
      {currentUser && <Nav />}
      <main>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <TaskList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <ProjectList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
      <footer className="App-footer">
        <p>
          © 2026 Project Manager | FastAPI + React |{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Source on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
