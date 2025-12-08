import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocuments, uploadDocument, deleteDocument, getUser } from '../services/api';
import { getUserInfo as getAuthUserInfo } from '../services/auth';
import '../App.css';

const Dashboard = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [user, setUser] = useState(null);
  const [canUpload, setCanUpload] = useState(false);
  
  const navigate = useNavigate();
  const isAdmin = user?.roles?.includes('admin') || false;

  useEffect(() => {
    const initUser = async () => {
      const authUser = getAuthUserInfo();
      setUser(authUser);
      
      // Get full user info from backend (includes granted permissions)
      try {
        const response = await getUser();
        const userData = response.data;
        setCanUpload(userData.canUpload || false);
        console.log('[Dashboard] User canUpload:', userData.canUpload);
      } catch (err) {
        console.error('[Dashboard] Failed to get user permissions:', err);
        setCanUpload(authUser?.roles?.includes('admin') || false);
      }
    };
    
    initUser();
    loadDocuments();
  }, [page]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const response = await getDocuments(page, 10);
      setDocuments(response.data.documents || []);
      setTotal(response.data.total || 0);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      setError('Please select a file');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      await uploadDocument(uploadFile, uploadTitle || uploadFile.name, uploadDescription);
      setShowUpload(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadDescription('');
      loadDocuments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      await deleteDocument(id);
      loadDocuments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete document');
    }
  };

  const handleView = (id) => {
    navigate(`/document/${id}`);
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Documents</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {canUpload && (
            <button className="button button-primary" onClick={() => setShowUpload(!showUpload)}>
              {showUpload ? 'Cancel' : 'Upload Document'}
            </button>
          )}
          {isAdmin && (
            <button 
              className="button button-secondary" 
              onClick={() => navigate('/admin')}
            >
              Admin Panel
            </button>
          )}
          {isAdmin && (
            <a 
              href="http://localhost:8000/oidc/authenticate/"
              target="_blank"
              rel="noopener noreferrer"
              className="button button-secondary"
              style={{ textDecoration: 'none' }}
            >
              Open Mayan EDMS
            </a>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {showUpload && (
        <div className="card">
          <h3>Upload Document</h3>
          <form onSubmit={handleUpload}>
            <label className="label">File</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.doc,.docx"
              onChange={(e) => setUploadFile(e.target.files[0])}
              className="input"
              required
            />
            <label className="label">Title (optional)</label>
            <input
              type="text"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              className="input"
              placeholder="Document title"
            />
            <label className="label">Description (optional)</label>
            <textarea
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              className="input"
              placeholder="Document description"
              rows="3"
            />
            <button 
              type="submit" 
              className="button button-primary"
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="card">
          <p>No documents found. Upload your first document to get started.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <p>Total documents: {total}</p>
          </div>
          {documents.map((doc) => (
            <div key={doc.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ marginBottom: '0.5rem' }}>{doc.title || `Document ${doc.id}`}</h3>
                  <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    Uploaded: {new Date(doc.uploadedAt).toLocaleString()}
                  </p>
                  {doc.uploadedBy && (
                    <p style={{ color: '#666', fontSize: '0.875rem' }}>
                      By: {doc.uploadedBy}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className="button button-primary"
                    onClick={() => handleView(doc.id)}
                  >
                    View
                  </button>
                  {isAdmin && (
                    <button 
                      className="button button-danger"
                      onClick={() => handleDelete(doc.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
            <button 
              className="button button-secondary"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <span style={{ padding: '0.75rem' }}>Page {page}</span>
            <button 
              className="button button-secondary"
              onClick={() => setPage(p => p + 1)}
              disabled={documents.length < 10}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;

