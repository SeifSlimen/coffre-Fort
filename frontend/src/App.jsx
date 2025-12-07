import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { handleCallback, isAuthenticated, getUserInfo, logout } from './services/auth';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import DocumentView from './components/DocumentView';
import AdminPanel from './components/AdminPanel';
import './App.css';

function App() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loginFailed, setLoginFailed] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      // Check if we're returning from Keycloak (OAuth callback)
      const urlParams = new URLSearchParams(window.location.search);
      const hasAuthCode = urlParams.has('code');

      if (hasAuthCode) {
        // Handle OAuth callback
        try {
          console.log('Handling OAuth callback...');
          await handleCallback();

          // Give a brief moment for tokens to be fully set
          await new Promise(resolve => setTimeout(resolve, 100));

          const user = getUserInfo();
          console.log('User info retrieved:', user);

          setAuthenticated(true);
          setUser(user);
          setLoginFailed(false);
        } catch (error) {
          console.error('OAuth callback failed:', error);
          setLoginFailed(true);
        }
        setLoading(false);
      } else {
        // No callback, just check if already authenticated
        if (isAuthenticated()) {
          setAuthenticated(true);
          setUser(getUserInfo());
        }
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px'
      }}>
        Loading...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <Router>
        <Routes>
          <Route path="*" element={<Login loginFailed={loginFailed} />} />
        </Routes>
      </Router>
    );
  }

  const userRoles = user?.roles || [];
  const isAdmin = userRoles.includes('admin');

  return (
    <Router>
      <div className="App">
        <nav style={{
          backgroundColor: '#2c3e50',
          color: 'white',
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Coffre-Fort Documentaire</h1>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span>{user?.email || user?.username}</span>
            {isAdmin && <span style={{
              backgroundColor: '#e74c3c',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}>Admin</span>}
            <button
              onClick={() => logout()}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Logout
            </button>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/document/:id" element={<DocumentView />} />
          {isAdmin && <Route path="/admin" element={<AdminPanel />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
