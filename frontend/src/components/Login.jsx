import React, { useEffect } from 'react';
import { initKeycloak } from '../services/auth';

const Login = () => {
  useEffect(() => {
    // Keycloak will handle the redirect automatically
    initKeycloak().catch((error) => {
      console.error('Login failed:', error);
    });
  }, []);

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
      <p>Redirecting to login...</p>
    </div>
  );
};

export default Login;

