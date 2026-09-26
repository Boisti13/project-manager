import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Nav from './components/Nav';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import TaskList from './components/TaskList';
import ProjectList from './components/ProjectList';
import Settings from './components/Settings';
import MyDay, { START_KEY } from './components/MyDay';
import { detectLanguage, getLanguage, setLanguage, t } from './i18n';
import './App.css';

const REPO_URL = 'https://github.com/Boisti13/project-manager';

// "Open My day when I start the app": once per browser session, only when
// the app is opened plainly (not from a link to a task or a filter).
function StartPage({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    try {
      const first = !sessionStorage.getItem('pm.started');
      sessionStorage.setItem('pm.started', '1');
      if (first && !location.search && localStorage.getItem(START_KEY) === '1') navigate('/today', { replace: true });
    } catch {
      // storage unavailable: just show the tasks
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return children;
}

// Sets the interface language (the user's choice, else the browser's) and
// re-renders everything when it changes.
function LanguageGate({ children }) {
  const { currentUser } = useAuth();
  const lang = detectLanguage(currentUser?.language);
  if (getLanguage() !== lang) setLanguage(lang);
  return <React.Fragment key={lang}>{children}</React.Fragment>;
}

function AppShell() {
  const { currentUser } = useAuth();

  return (
    <div className="App">
      <header className="App-header">
        <h1>📋 Project Manager</h1>
        <p className="App-subtitle">{t('Organize your tasks hierarchically')}</p>
      </header>
      {currentUser && <Nav />}
      <main>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <StartPage>
                  <TaskList />
                </StartPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="/today"
            element={
              <ProtectedRoute>
                <MyDay />
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
            {t('Source on GitHub')}
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
          <LanguageGate>
            <AppShell />
          </LanguageGate>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
