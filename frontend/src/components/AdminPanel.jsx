import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUsers, grantAccess, revokeAccess, getAccessGrants, getDocuments, getPermissionTypes, createUser, deleteUser } from '../services/api';
import '../App.css';

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [grants, setGrants] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [permissionTypes, setPermissionTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [grantForm, setGrantForm] = useState({
    userId: '',
    documentId: '',
    expiresAt: '',
    permissions: ['view'] // Default to view only
  });
  const [userForm, setUserForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'user'
  });
  
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadUsers(), loadGrants(), loadDocuments(), loadPermissionTypes()]);
    setLoading(false);
  };

  const loadUsers = async () => {
    try {
      const response = await getUsers();
      setUsers(response.data.users || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const loadGrants = async () => {
    try {
      const response = await getAccessGrants();
      setGrants(response.data.grants || []);
    } catch (err) {
      console.error('Failed to load grants:', err);
    }
  };

  const loadDocuments = async () => {
    try {
      const response = await getDocuments(1, 100);
      setDocuments(response.data.documents || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  };

  const loadPermissionTypes = async () => {
    try {
      const response = await getPermissionTypes();
      setPermissionTypes(response.data.permissions || []);
    } catch (err) {
      console.error('Failed to load permission types:', err);
      // Fallback defaults
      setPermissionTypes([
        { id: 'view', name: 'View Document', description: 'Can view document details' },
        { id: 'download', name: 'Download', description: 'Can download the document file' },
        { id: 'ocr', name: 'OCR Text', description: 'Can view extracted OCR text' },
        { id: 'ai_summary', name: 'AI Summary', description: 'Can request AI-generated summary' }
      ]);
    }
  };

  const handleGrantAccess = async (e) => {
    e.preventDefault();
    
    if (grantForm.permissions.length === 0) {
      setError('Please select at least one permission');
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      await grantAccess(
        grantForm.userId, 
        grantForm.documentId, 
        grantForm.expiresAt,
        grantForm.permissions
      );
      setSuccess('Access granted successfully!');
      setShowGrantForm(false);
      setGrantForm({ userId: '', documentId: '', expiresAt: '', permissions: ['view'] });
      loadGrants();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to grant access');
    }
  };

  const handleRevokeAccess = async (userId, documentId) => {
    if (!window.confirm('Are you sure you want to revoke this access?')) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      await revokeAccess(userId, documentId);
      setSuccess('Access revoked successfully!');
      loadGrants();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to revoke access');
    }
  };

  const handlePermissionToggle = (permissionId) => {
    setGrantForm(prev => {
      const currentPerms = prev.permissions;
      if (currentPerms.includes(permissionId)) {
        // Remove permission (but keep at least view)
        if (permissionId === 'view') {
          return prev; // Can't remove view permission
        }
        return { ...prev, permissions: currentPerms.filter(p => p !== permissionId) };
      } else {
        // Add permission
        return { ...prev, permissions: [...currentPerms, permissionId] };
      }
    });
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    
    if (!userForm.email || !userForm.password) {
      setError('Email and password are required');
      return;
    }

    if (userForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      await createUser(userForm);
      setSuccess('User created successfully and synced to Mayan!');
      setShowUserForm(false);
      setUserForm({ email: '', password: '', firstName: '', lastName: '', role: 'user' });
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId, email) => {
    if (!window.confirm(`Are you sure you want to delete user ${email}? This cannot be undone.`)) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      await deleteUser(userId);
      setSuccess('User deleted successfully!');
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const getDefaultExpiry = () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 16);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getNonAdminUsers = () => {
    return users.filter(u => !u.roles?.includes('admin'));
  };

  const getPermissionBadgeColor = (permId) => {
    const colors = {
      view: '#3498db',
      download: '#27ae60',
      ocr: '#9b59b6',
      ai_summary: '#e67e22',
      upload: '#e74c3c'
    };
    return colors[permId] || '#95a5a6';
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '1rem' }}>
        <button className="button button-secondary" onClick={() => navigate('/')}>
          ← Back to Dashboard
        </button>
      </div>

      <h2>🔐 Admin Panel - Access Control Management</h2>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* User Management Section */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>👥 User Management</h3>
          <button 
            className="button button-primary"
            onClick={() => setShowUserForm(!showUserForm)}
          >
            {showUserForm ? 'Cancel' : '+ Create New User'}
          </button>
        </div>

        {showUserForm && (
          <form onSubmit={handleCreateUser} style={{ marginTop: '1rem', padding: '1.5rem', backgroundColor: '#e8f5e9', borderRadius: '8px', border: '1px solid #4caf50' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="label">Email *</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="input"
                  placeholder="user@company.com"
                  required
                />
              </div>

              <div>
                <label className="label">Password *</label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="input"
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label className="label">First Name</label>
                <input
                  type="text"
                  value={userForm.firstName}
                  onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
                  className="input"
                  placeholder="John"
                />
              </div>

              <div>
                <label className="label">Last Name</label>
                <input
                  type="text"
                  value={userForm.lastName}
                  onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
                  className="input"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <label className="label">Role</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="role"
                    value="user"
                    checked={userForm.role === 'user'}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  />
                  <span style={{ 
                    backgroundColor: '#3498db', 
                    color: 'white', 
                    padding: '0.25rem 0.75rem', 
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}>User</span>
                  <span style={{ color: '#666', fontSize: '0.875rem' }}>- Regular access with granted permissions</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="role"
                    value="admin"
                    checked={userForm.role === 'admin'}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  />
                  <span style={{ 
                    backgroundColor: '#e74c3c', 
                    color: 'white', 
                    padding: '0.25rem 0.75rem', 
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}>Admin</span>
                  <span style={{ color: '#666', fontSize: '0.875rem' }}>- Full access to all documents and settings</span>
                </label>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <button type="submit" className="button button-primary" style={{ backgroundColor: '#4caf50' }}>
                ✅ Create User & Sync to Mayan
              </button>
            </div>

            <p style={{ marginTop: '1rem', color: '#666', fontSize: '0.875rem' }}>
              <strong>Note:</strong> Users will be created in both Keycloak (authentication) and Mayan EDMS (document management).
            </p>
          </form>
        )}

        {/* Users List */}
        {!loading && users.length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <h4 style={{ marginBottom: '1rem' }}>Existing Users ({users.length})</h4>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Roles</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email || user.username}</td>
                    <td>{user.firstName} {user.lastName}</td>
                    <td>
                      {user.roles?.map(role => (
                        <span 
                          key={role} 
                          style={{
                            backgroundColor: role === 'admin' ? '#e74c3c' : '#3498db',
                            color: 'white',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            marginRight: '0.25rem'
                          }}
                        >
                          {role.toUpperCase()}
                        </span>
                      ))}
                    </td>
                    <td>
                      <span style={{
                        backgroundColor: user.enabled ? '#27ae60' : '#95a5a6',
                        color: 'white',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem'
                      }}>
                        {user.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      {!user.roles?.includes('admin') && (
                        <button
                          onClick={() => handleDeleteUser(user.id, user.email)}
                          className="button button-secondary"
                          style={{ backgroundColor: '#e74c3c', color: 'white', fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Grant Access Form */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>⏱️ Grant Time-Limited Access</h3>
          <button 
            className="button button-primary"
            onClick={() => setShowGrantForm(!showGrantForm)}
          >
            {showGrantForm ? 'Cancel' : '+ Grant Document Access'}
          </button>
        </div>

        {showGrantForm && (
          <form onSubmit={handleGrantAccess} style={{ marginTop: '1rem', padding: '1.5rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="label">Select User (non-admin only)</label>
                <select
                  value={grantForm.userId}
                  onChange={(e) => setGrantForm({ ...grantForm, userId: e.target.value })}
                  className="input"
                  required
                >
                  <option value="">-- Select a user --</option>
                  {getNonAdminUsers().map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email || user.username} ({user.username})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Select Document</label>
                <select
                  value={grantForm.documentId}
                  onChange={(e) => setGrantForm({ ...grantForm, documentId: e.target.value })}
                  className="input"
                  required
                >
                  <option value="">-- Select a document --</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title} (ID: {doc.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <label className="label">Access Expires At</label>
              <input
                type="datetime-local"
                value={grantForm.expiresAt || getDefaultExpiry()}
                onChange={(e) => setGrantForm({ ...grantForm, expiresAt: e.target.value })}
                className="input"
                required
                style={{ maxWidth: '300px' }}
              />
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <label className="label">Permissions to Grant</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
                {permissionTypes.map((perm) => (
                  <label 
                    key={perm.id}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      padding: '0.75rem 1rem',
                      backgroundColor: grantForm.permissions.includes(perm.id) ? getPermissionBadgeColor(perm.id) : '#e0e0e0',
                      color: grantForm.permissions.includes(perm.id) ? 'white' : '#333',
                      borderRadius: '8px',
                      cursor: perm.id === 'view' ? 'not-allowed' : 'pointer',
                      opacity: perm.id === 'view' ? 0.8 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={grantForm.permissions.includes(perm.id)}
                      onChange={() => handlePermissionToggle(perm.id)}
                      disabled={perm.id === 'view'}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{perm.name}</div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>{perm.description}</div>
                    </div>
                  </label>
                ))}
              </div>
              <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                ℹ️ View permission is always required and cannot be removed.
              </p>
            </div>

            <button type="submit" className="button button-primary" style={{ marginTop: '1.5rem' }}>
              Grant Access
            </button>
          </form>
        )}
      </div>

      {/* Active Grants */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3>🔓 Active Access Grants</h3>
        {loading ? (
          <div className="loading">Loading grants...</div>
        ) : grants.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic' }}>No active access grants. Use the form above to grant time-limited access to users.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd', backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>User</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Document</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Permissions</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Expires At</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {grants.map((grant, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ fontWeight: 'bold' }}>{grant.userEmail || 'Unknown'}</div>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>{grant.username}</div>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{ 
                        backgroundColor: '#34495e', 
                        color: 'white', 
                        padding: '0.25rem 0.5rem', 
                        borderRadius: '4px',
                        fontSize: '0.875rem'
                      }}>
                        #{grant.documentId}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {(grant.permissions || ['view']).map((perm, i) => (
                          <span
                            key={i}
                            style={{
                              backgroundColor: getPermissionBadgeColor(perm),
                              color: 'white',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              textTransform: 'uppercase'
                            }}
                          >
                            {perm.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      <span style={{ 
                        color: new Date(grant.expiresAt) < new Date() ? '#e74c3c' : '#27ae60',
                        fontWeight: 'bold'
                      }}>
                        {formatDate(grant.expiresAt)}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <button
                        className="button button-danger"
                        onClick={() => handleRevokeAccess(grant.userId, grant.documentId)}
                        style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User List */}
      <div className="card">
        <h3>👥 All Users (from Keycloak)</h3>
        {loading ? (
          <div className="loading">Loading users...</div>
        ) : users.length === 0 ? (
          <p style={{ color: '#666' }}>No users found. Make sure Keycloak is running and has users configured.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd', backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Username</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Email</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Roles</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{user.username}</td>
                    <td style={{ padding: '0.75rem' }}>{user.email || '-'}</td>
                    <td style={{ padding: '0.75rem' }}>
                      {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '-'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {user.roles && user.roles.length > 0 ? user.roles.map((role, index) => (
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
                      )) : (
                        <span style={{ color: '#666', fontStyle: 'italic' }}>No roles</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <span style={{
                        color: user.enabled ? '#27ae60' : '#e74c3c',
                        fontWeight: 'bold',
                        fontSize: '0.875rem'
                      }}>
                        {user.enabled ? '✓ Enabled' : '✗ Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Permission Legend */}
      <div className="card" style={{ marginTop: '2rem', backgroundColor: '#e8f4fd', border: '1px solid #3498db' }}>
        <h4 style={{ color: '#2980b9', marginBottom: '1rem' }}>📋 Permission Types Explained</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span style={{ backgroundColor: getPermissionBadgeColor('view'), color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>VIEW</span>
            <span style={{ color: '#34495e', fontSize: '0.875rem' }}>See document in list and view basic details</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span style={{ backgroundColor: getPermissionBadgeColor('download'), color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>DOWNLOAD</span>
            <span style={{ color: '#34495e', fontSize: '0.875rem' }}>Download the original document file</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span style={{ backgroundColor: getPermissionBadgeColor('ocr'), color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OCR</span>
            <span style={{ color: '#34495e', fontSize: '0.875rem' }}>View extracted text from document</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span style={{ backgroundColor: getPermissionBadgeColor('ai_summary'), color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>AI SUMMARY</span>
            <span style={{ color: '#34495e', fontSize: '0.875rem' }}>Generate AI summary and keywords</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span style={{ backgroundColor: getPermissionBadgeColor('upload'), color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>UPLOAD</span>
            <span style={{ color: '#34495e', fontSize: '0.875rem' }}>Upload new documents to the system</span>
          </div>
        </div>
        <p style={{ marginTop: '1rem', color: '#34495e', fontSize: '0.875rem' }}>
          <strong>Note:</strong> Admins have full access to all documents. Regular users only see documents they've been granted access to.
        </p>
      </div>
    </div>
  );
};

export default AdminPanel;

