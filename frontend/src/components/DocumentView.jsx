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

  // Poll for OCR updates
  useEffect(() => {
    let intervalId;
    
    // If OCR is processing, poll every 3 seconds
    if (document && document.ocrText === 'OCR_PROCESSING') {
      intervalId = setInterval(() => {
        loadDocument(true);
      }, 3000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [document]);

  const loadDocument = async (isPolling = false) => {
    try {
      if (!isPolling) {
        setLoading(true);
        setLoadingAI(true);
      }
      const response = await getDocument(id);
      setDocument(response.data);
      setError(null);
    } catch (err) {
      if (!isPolling) setError(err.response?.data?.error || 'Failed to load document');
    } finally {
      if (!isPolling) {
        setLoading(false);
        // Simulate AI processing delay
        setTimeout(() => setLoadingAI(false), 2000);
      }
    }
  };

  const handleDownload = async () => {
    try {
      const response = await downloadDocument(id);
      
      // Get content type from headers or fallback to metadata
      const contentType = response.headers['content-type'] || document.metadata?.fileType || 'application/pdf';
      
      const url = window.URL.createObjectURL(new Blob([response.data], { type: contentType }));
      // Use window.document explicitly to avoid shadowing
      const link = window.document.createElement('a');
      link.href = url;

      // Try to get filename from Content-Disposition header
      let filename = document.title || 'document';
      const contentDisposition = response.headers['content-disposition'];
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      // If filename doesn't have extension, try to add it based on mime
      if (!filename.includes('.')) {
         let extension = 'pdf';
         if (contentType.includes('image/jpeg')) extension = 'jpg';
         else if (contentType.includes('image/png')) extension = 'png';
         else if (contentType.includes('image/tiff')) extension = 'tiff';
         else if (contentType.includes('word')) extension = 'docx';
         filename = `${filename}.${extension}`;
      }

      link.setAttribute('download', filename);
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
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
            <p><strong>OCR Status:</strong> {document.ocrText && document.ocrText !== 'OCR_PROCESSING' ? <span style={{ color: 'green' }}>Completed</span> : <span style={{ color: 'orange' }}>Processing (Check back later)</span>}</p>
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
          {document.ocrText === 'OCR_PROCESSING' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f39c12' }}>
              <div className="spinner" style={{ width: '20px', height: '20px', border: '3px solid #f3c612', borderTop: '3px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <span>OCR is currently processing... (Auto-refreshing)</span>
            </div>
          ) : (document.ocrText || 'No OCR text available yet. If the document was just uploaded, please wait for background processing.')}
        </div>
      </div>
    </div>
  );
};

export default DocumentView;

