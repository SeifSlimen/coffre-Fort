import React from 'react';
import { login } from '../services/auth';

const Login = ({ loginFailed }) => {
  const handleLogin = () => {
    login();
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      <h1>Coffre-Fort Documentaire</h1>

      {loginFailed && (
        <p style={{ color: 'red' }}>
          Authentication failed. Please try again.
        </p>
      )}

      {!loginFailed && (
        <p>Please log in to continue.</p>
      )}

      <button
        onClick={handleLogin}
        style={{
          padding: '0.75rem 1.5rem',
          cursor: 'pointer',
          backgroundColor: '#2c3e50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '1rem',
          fontWeight: 'bold'
        }}
      >
        Login with Keycloak
      </button>

      {loginFailed && (
        <button
          onClick={() => window.location.href = window.location.origin}
          style={{
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            backgroundColor: '#95a5a6',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
};

export default Login;
