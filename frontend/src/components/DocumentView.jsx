import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocument, downloadDocument } from '../services/api';
import '../App.css';

const DocumentView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingAI, setLoadingAI] = useState(true);

  useEffect(() => {
    loadDocument();
  }, [id]);

  const loadDocument = async () => {
    try {
      setLoading(true);
      setLoadingAI(true);
      const response = await getDocument(id);
      setDocument(response.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load document');
    } finally {
      setLoading(false);
      // Simulate AI processing delay
      setTimeout(() => setLoadingAI(false), 2000);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await downloadDocument(id);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${document.title || 'document'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to download document');
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading document...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="error">{error}</div>
        <button className="button button-secondary" onClick={() => navigate('/')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ marginBottom: '1rem' }}>
        <button className="button button-secondary" onClick={() => navigate('/')}>
          ← Back to Dashboard
        </button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
          <h2>{document.title || `Document ${id}`}</h2>
          <button className="button button-primary" onClick={handleDownload}>
            Download
          </button>
        </div>

        {document.metadata && (
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
            <p><strong>Uploaded:</strong> {new Date(document.metadata.uploadedAt).toLocaleString()}</p>
            {document.metadata.uploadedBy && (
              <p><strong>By:</strong> {document.metadata.uploadedBy}</p>
            )}
            {document.metadata.fileType && (
              <p><strong>Type:</strong> {document.metadata.fileType}</p>
            )}
          </div>
        )}
      </div>

      {loadingAI ? (
        <div className="card">
          <div className="loading">Processing AI summary...</div>
        </div>
      ) : (
        <>
          {document.summary && (
            <div className="card">
              <h3>AI Summary</h3>
              <p style={{ lineHeight: '1.6', marginTop: '0.5rem' }}>{document.summary}</p>
            </div>
          )}

          {document.keywords && document.keywords.length > 0 && (
            <div className="card">
              <h3>Keywords</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                {document.keywords.map((keyword, index) => (
                  <span
                    key={index}
                    style={{
                      backgroundColor: '#3498db',
                      color: 'white',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.875rem'
                    }}
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {document.ocrText && (
        <div className="card">
          <h3>OCR Text</h3>
          <div style={{
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '1rem',
            backgroundColor: '#f9f9f9',
            borderRadius: '4px',
            marginTop: '0.5rem',
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
            fontSize: '0.875rem'
          }}>
            {document.ocrText || 'No OCR text available'}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentView;

