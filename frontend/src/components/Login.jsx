import React, { useState, useEffect } from 'react';
import { directLogin } from '../services/auth';

const Login = ({ loginFailed, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(loginFailed ? 'Authentication failed. Please try again.' : '');
  const [loading, setLoading] = useState(false);
  
  // Check if we're returning from logout and should show login
  useEffect(() => {
    const logoutRedirect = sessionStorage.getItem('logout_redirect');
    if (logoutRedirect) {
      sessionStorage.removeItem('logout_redirect');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await directLogin(username, password);
      // Trigger app to re-check authentication
      if (onLoginSuccess) {
        onLoginSuccess();
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '2rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        padding: '3rem',
        width: '100%',
        maxWidth: '420px',
        textAlign: 'center'
      }}>
        {/* Logo/Icon */}
        <div style={{
          width: '80px',
          height: '80px',
          backgroundColor: '#0f3460',
          borderRadius: '20px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          margin: '0 auto 1.5rem',
          boxShadow: '0 10px 25px rgba(15, 52, 96, 0.3)'
        }}>
          <span style={{ fontSize: '2.5rem' }}>🔐</span>
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: '700',
          color: '#1a1a2e',
          marginBottom: '0.5rem'
        }}>
          Coffre-Fort Documentaire
        </h1>

        <p style={{
          color: '#666',
          fontSize: '0.95rem',
          marginBottom: '2rem'
        }}>
          Secure Document Management System
        </p>

        {/* Error Message */}
        {error && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#dc2626'
          }}>
            <p style={{ margin: 0, fontWeight: '500' }}>⚠️ {error}</p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              color: '#374151', 
              fontWeight: '500',
              fontSize: '0.9rem'
            }}>
              Email or Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin@test.com"
              required
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                border: '2px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '1rem',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#0f3460';
                e.target.style.boxShadow = '0 0 0 3px rgba(15, 52, 96, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e5e7eb';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              color: '#374151', 
              fontWeight: '500',
              fontSize: '0.9rem'
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                border: '2px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '1rem',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#0f3460';
                e.target.style.boxShadow = '0 0 0 3px rgba(15, 52, 96, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e5e7eb';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '1rem 1.5rem',
              cursor: loading ? 'wait' : 'pointer',
              background: loading 
                ? '#9ca3af' 
                : 'linear-gradient(135deg, #0f3460 0%, #1a1a2e 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              transition: 'transform 0.2s, box-shadow 0.2s',
              boxShadow: '0 4px 15px rgba(15, 52, 96, 0.4)'
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(15, 52, 96, 0.5)';
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(15, 52, 96, 0.4)';
            }}
          >
            {loading ? (
              <>
                <span style={{ 
                  width: '20px', 
                  height: '20px', 
                  border: '2px solid transparent',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Signing in...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Features */}
        <div style={{
          backgroundColor: '#f8fafc',
          borderRadius: '12px',
          padding: '1.25rem',
          marginTop: '2rem',
          textAlign: 'left'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>📄</span>
            <span style={{ color: '#374151', fontSize: '0.9rem' }}>Secure document storage & OCR</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🤖</span>
            <span style={{ color: '#374151', fontSize: '0.9rem' }}>AI-powered summaries & keywords</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⏱️</span>
            <span style={{ color: '#374151', fontSize: '0.9rem' }}>Time-limited access control</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '2rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid #e5e7eb'
        }}>
          <p style={{
            color: '#9ca3af',
            fontSize: '0.8rem',
            margin: 0
          }}>
            Enterprise Authentication
          </p>
          <p style={{
            color: '#d1d5db',
            fontSize: '0.75rem',
            margin: '0.5rem 0 0'
          }}>
            © 2025 Coffre-Fort Challenge
          </p>
        </div>
      </div>

      {/* CSS Animation for spinner */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Login;
