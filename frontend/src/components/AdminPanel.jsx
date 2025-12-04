import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUsers, grantAccess } from '../services/api';
import '../App.css';

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [grantForm, setGrantForm] = useState({
    userId: '',
    documentId: '',
    expiresAt: ''
  });
  
  const navigate = useNavigate();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await getUsers();
      setUsers(response.data.users || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleGrantAccess = async (e) => {
    e.preventDefault();
    try {
      setError(null);
      setSuccess(null);
      await grantAccess(grantForm.userId, grantForm.documentId, grantForm.expiresAt);
      setSuccess('Access granted successfully');
      setShowGrantForm(false);
      setGrantForm({ userId: '', documentId: '', expiresAt: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to grant access');
    }
  };

  // Set default expiry to 7 days from now
  const getDefaultExpiry = () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 16);
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '1rem' }}>
        <button className="button button-secondary" onClick={() => navigate('/')}>
          ← Back to Dashboard
        </button>
      </div>

      <h2>Admin Panel</h2>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>User Management</h3>
          <button 
            className="button button-primary"
            onClick={() => setShowGrantForm(!showGrantForm)}
          >
            {showGrantForm ? 'Cancel' : 'Grant Document Access'}
          </button>
        </div>

        {showGrantForm && (
          <form onSubmit={handleGrantAccess} style={{ marginTop: '1rem' }}>
            <label className="label">User ID</label>
            <input
              type="text"
              value={grantForm.userId}
              onChange={(e) => setGrantForm({ ...grantForm, userId: e.target.value })}
              className="input"
              placeholder="User ID from Keycloak"
              required
            />
            <label className="label">Document ID</label>
            <input
              type="number"
              value={grantForm.documentId}
              onChange={(e) => setGrantForm({ ...grantForm, documentId: e.target.value })}
              className="input"
              placeholder="Document ID"
              required
            />
            <label className="label">Expires At</label>
            <input
              type="datetime-local"
              value={grantForm.expiresAt || getDefaultExpiry()}
              onChange={(e) => setGrantForm({ ...grantForm, expiresAt: e.target.value })}
              className="input"
              required
            />
            <button type="submit" className="button button-primary">
              Grant Access
            </button>
          </form>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading users...</div>
      ) : (
        <div className="card">
          <h3>Users</h3>
          {users.length === 0 ? (
            <p>No users found.</p>
          ) : (
            <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Email</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Roles</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.75rem' }}>{user.email}</td>
                    <td style={{ padding: '0.75rem' }}>
                      {user.roles.map((role, index) => (
                        <span
                          key={index}
                          style={{
                            backgroundColor: role === 'admin' ? '#e74c3c' : '#3498db',
                            color: 'white',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            marginRight: '0.5rem',
                            fontSize: '0.875rem'
                          }}
                        >
                          {role}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: '2rem' }}>
        <h3>System Information</h3>
        <p><strong>Note:</strong> Full user management requires Keycloak Admin API integration.</p>
        <p>For the hackathon demo, user management is simplified. In production, you would:</p>
        <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
          <li>Integrate with Keycloak Admin REST API</li>
          <li>Implement user creation, role assignment, and management</li>
          <li>Add audit logging for admin actions</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminPanel;

