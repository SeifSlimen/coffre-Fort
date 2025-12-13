import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocument, downloadDocument, requestDocumentAccess, getDocumentPreviewUrl, getDocumentPages, getDocumentPageImageUrl, requestOcrText, requestAiSummary } from '../services/api';
import { getToken } from '../services/auth';
import websocket from '../services/websocket';
import '../App.css';

const DocumentView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const [ocrNotification, setOcrNotification] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState(null);
  const [pages, setPages] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  
  // Explicit OCR/AI action states
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const loadDocument = useCallback(async (isPolling = false) => {
    try {
      if (!isPolling) {
        setLoading(true);
      }
      const response = await getDocument(id);
      setDocument(response.data);
      setError(null);
      setErrorCode(null);
      
      // Clear OCR notification if OCR is now complete
      if (response.data.ocrText && response.data.ocrText !== 'OCR_PROCESSING') {
        setOcrNotification(null);
      }
    } catch (err) {
      if (!isPolling) {
        setError(err.response?.data?.error || 'Failed to load document');
        setErrorCode(err.response?.data?.code || null);
      }
    } finally {
      if (!isPolling) {
        setLoading(false);
      }
    }
  }, [id]);

  // Load Mayan-rendered pages when user opens preview for non-PDF/image types (e.g., DOCX)
  useEffect(() => {
    const loadPages = async () => {
      const fileType = document?.metadata?.fileType || '';
      const isPdf = fileType.includes('pdf');
      const isImage = fileType.startsWith('image/');

      if (!showPreview || isPdf || isImage) return;

      try {
        setPagesError(null);
        setPagesLoading(true);
        const res = await getDocumentPages(id);
        const list = res.data?.pages || [];
        setPages(list);
        setPageIndex(0);

        if (list.length === 0) {
          setPagesError('Pages are not ready yet. Please wait for processing/OCR and try again.');
        }
      } catch (e) {
        setPages([]);
        setPageIndex(0);
        setPagesError(e.response?.data?.error || 'Failed to load preview pages');
      } finally {
        setPagesLoading(false);
      }
    };

    loadPages();
  }, [showPreview, document?.metadata?.fileType, id]);

  // Explicit OCR action handler
  const handleRequestOcr = async () => {
    try {
      setOcrLoading(true);
      console.log('[DocumentView] Requesting OCR for document:', id);
      const response = await requestOcrText(id);
      console.log('[DocumentView] OCR response:', response.data);
      setOcrResult(response.data);
    } catch (err) {
      console.error('[DocumentView] OCR error:', err);
      setOcrResult({ success: false, message: err.response?.data?.error || 'Failed to get OCR text' });
    } finally {
      setOcrLoading(false);
    }
  };

  // Explicit AI Summary action handler
  const handleRequestAiSummary = async (forceRefresh = false) => {
    try {
      setAiLoading(true);
      console.log('[DocumentView] Requesting AI summary for document:', id, 'forceRefresh:', forceRefresh);
      const response = await requestAiSummary(id, forceRefresh);
      console.log('[DocumentView] AI summary response:', response.data);
      setAiResult(response.data);
    } catch (err) {
      console.error('[DocumentView] AI summary error:', err);
      setAiResult({ success: false, message: err.response?.data?.error || 'Failed to generate AI summary' });
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  // WebSocket subscription for OCR updates
  useEffect(() => {
    let unsubscribeComplete = null;
    let unsubscribeStatus = null;
    
    // Only subscribe if OCR is still processing
    if (document && document.ocrText === 'OCR_PROCESSING') {
      console.log('[DocumentView] OCR processing, subscribing to WebSocket updates');
      
      unsubscribeComplete = websocket.subscribeToOCR(id, (data) => {
        console.log('[DocumentView] Received OCR complete notification:', data);
        
        // Show notification
        setOcrNotification('✓ OCR processing complete! Refreshing...');
        
        // Reload document to get the OCR text
        setTimeout(() => {
          loadDocument(false);
        }, 500);
      });

      unsubscribeStatus = websocket.subscribeToOCRStatus(id, (data) => {
        setOcrProgress(data);
      });
    } else {
      setOcrProgress(null);
    }
    
    return () => {
      unsubscribeComplete && unsubscribeComplete();
      unsubscribeStatus && unsubscribeStatus();
    };
  }, [document, id, loadDocument]);

  // Fallback polling for OCR updates (always poll when processing for reliability)
  useEffect(() => {
    let intervalId;
    
    // Poll while OCR is processing - WebSocket may miss updates
    if (document && document.ocrText === 'OCR_PROCESSING') {
      console.log('[DocumentView] OCR processing, starting status polling');
      intervalId = setInterval(() => {
        loadDocument(true);
      }, 8000); // Poll every 8 seconds
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [document, loadDocument]);

  const handleDownload = async () => {
    try {
      setDownloadError(null);
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
      const errorMsg = err.response?.data?.error || 'Failed to download document';
      setDownloadError(errorMsg);
    }
  };

  const handleRequestAccess = async () => {
    try {
      setRequestSubmitting(true);
      setRequestError(null);
      await requestDocumentAccess(id, requestReason, ['view', 'download']);
      setRequestSuccess(true);
      setShowRequestForm(false);
    } catch (err) {
      setRequestError(err.response?.data?.error || 'Failed to submit access request');
    } finally {
      setRequestSubmitting(false);
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
    const isAccessDenied = errorCode === 'NO_VIEW_PERMISSION' || error.includes('Access denied');
    
    return (
      <div className="container">
        <div className="card" style={{ 
          backgroundColor: isAccessDenied ? '#fef3f2' : '#fff', 
          border: isAccessDenied ? '1px solid #e74c3c' : 'none' 
        }}>
          <h2 style={{ color: '#e74c3c' }}>
            {isAccessDenied ? '🚫 Access Denied' : '❌ Error'}
          </h2>
          <p style={{ marginTop: '1rem', color: '#666' }}>{error}</p>
          
          {isAccessDenied && !requestSuccess && !showRequestForm && (
            <div style={{ marginTop: '1.5rem' }}>
              <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
                You don't have permission to view this document.
              </p>
              <button 
                className="button button-primary"
                onClick={() => setShowRequestForm(true)}
                style={{ backgroundColor: '#3498db' }}
              >
                📩 Request Access
              </button>
            </div>
          )}
          
          {isAccessDenied && showRequestForm && (
            <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Request Access</h3>
              <textarea
                placeholder="Please explain why you need access to this document..."
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                style={{ 
                  width: '100%', 
                  minHeight: '100px', 
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  resize: 'vertical'
                }}
              />
              {requestError && (
                <p style={{ color: '#e74c3c', fontSize: '0.875rem', marginTop: '0.5rem' }}>{requestError}</p>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button 
                  className="button button-primary"
                  onClick={handleRequestAccess}
                  disabled={requestSubmitting || !requestReason.trim()}
                  style={{ backgroundColor: '#27ae60' }}
                >
                  {requestSubmitting ? 'Submitting...' : '✓ Submit Request'}
                </button>
                <button 
                  className="button button-secondary"
                  onClick={() => setShowRequestForm(false)}
                  disabled={requestSubmitting}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          
          {isAccessDenied && requestSuccess && (
            <div style={{ 
              marginTop: '1.5rem', 
              padding: '1rem', 
              backgroundColor: '#d4edda', 
              borderRadius: '8px',
              border: '1px solid #c3e6cb'
            }}>
              <p style={{ color: '#155724', fontWeight: '500' }}>
                ✓ Access request submitted successfully!
              </p>
              <p style={{ color: '#155724', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                An administrator will review your request. You'll be notified once it's processed.
              </p>
            </div>
          )}
        </div>
        <button className="button button-secondary" onClick={() => navigate('/')} style={{ marginTop: '1rem' }}>
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  // Check permissions from response
  const permissions = document.permissions || {};
  const canView = permissions.canView !== false;
  const canDownload = permissions.canDownload !== false;
  const canViewOcr = permissions.canOcr !== false;
  const canViewAiSummary = permissions.canAiSummary !== false;

  // If user cannot view content, show metadata-only view with request access
  if (!canView) {
    return (
      <div className="container">
        <div style={{ marginBottom: '1rem' }}>
          <button className="button button-secondary" onClick={() => navigate('/')}>
            ← Back to Dashboard
          </button>
        </div>

        <div className="card" style={{ border: '2px solid #e74c3c', backgroundColor: '#fef3f2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
            <h2>
              <span style={{ marginRight: '0.5rem' }}>🔒</span>
              {document.title || `Document ${id}`}
            </h2>
          </div>

          {/* Metadata section (visible for all) */}
          {document.metadata && (
            <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#fff', borderRadius: '4px' }}>
              <p><strong>Uploaded:</strong> {new Date(document.metadata.uploadedAt).toLocaleString()}</p>
              {document.metadata.uploadedBy && (
                <p><strong>By:</strong> {document.metadata.uploadedBy}</p>
              )}
              {document.metadata.fileType && (
                <p><strong>Type:</strong> {document.metadata.fileType}</p>
              )}
              {document.documentType && (
                <p><strong>Document Type:</strong> {document.documentType}</p>
              )}
            </div>
          )}

          {/* Access restricted notice */}
          <div style={{ 
            padding: '1.5rem', 
            backgroundColor: '#fff', 
            borderRadius: '8px',
            border: '1px solid #e74c3c',
            marginBottom: '1rem'
          }}>
            <h3 style={{ color: '#e74c3c', marginBottom: '0.75rem' }}>🚫 Access Restricted</h3>
            <p style={{ color: '#666', marginBottom: '1rem' }}>
              You don't have permission to view this document's content. You can request access below.
            </p>

            {/* Show pending request status if exists */}
            {document.accessRequest && (
              <div style={{ 
                padding: '0.75rem', 
                backgroundColor: document.accessRequest.status === 'pending' ? '#fff3cd' : '#d4edda',
                borderRadius: '6px',
                marginBottom: '1rem'
              }}>
                <p style={{ fontWeight: '500', color: document.accessRequest.status === 'pending' ? '#856404' : '#155724' }}>
                  {document.accessRequest.status === 'pending' ? '⏳ Access Request Pending' : '✓ Request Status: ' + document.accessRequest.status}
                </p>
                <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                  Requested: {new Date(document.accessRequest.requestedAt).toLocaleString()}
                </p>
              </div>
            )}

            {/* Request form or success message */}
            {!document.accessRequest && !requestSuccess && !showRequestForm && (
              <button 
                className="button button-primary"
                onClick={() => setShowRequestForm(true)}
                style={{ backgroundColor: '#3498db' }}
              >
                📩 Request Access
              </button>
            )}

            {!document.accessRequest && showRequestForm && (
              <div style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Request Access</h4>
                <textarea
                  placeholder="Please explain why you need access to this document..."
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  style={{ 
                    width: '100%', 
                    minHeight: '100px', 
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    resize: 'vertical'
                  }}
                />
                {requestError && (
                  <p style={{ color: '#e74c3c', fontSize: '0.875rem', marginTop: '0.5rem' }}>{requestError}</p>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button 
                    className="button button-primary"
                    onClick={handleRequestAccess}
                    disabled={requestSubmitting || !requestReason.trim()}
                    style={{ backgroundColor: '#27ae60' }}
                  >
                    {requestSubmitting ? 'Submitting...' : '✓ Submit Request'}
                  </button>
                  <button 
                    className="button button-secondary"
                    onClick={() => setShowRequestForm(false)}
                    disabled={requestSubmitting}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!document.accessRequest && requestSuccess && (
              <div style={{ 
                padding: '1rem', 
                backgroundColor: '#d4edda', 
                borderRadius: '8px',
                border: '1px solid #c3e6cb'
              }}>
                <p style={{ color: '#155724', fontWeight: '500' }}>
                  ✓ Access request submitted successfully!
                </p>
                <p style={{ color: '#155724', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  An administrator will review your request.
                </p>
              </div>
            )}
          </div>

          {/* Permission badges */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ 
              padding: '0.25rem 0.5rem', 
              borderRadius: '4px', 
              fontSize: '0.75rem',
              backgroundColor: '#e74c3c',
              color: 'white'
            }}>
              ✗ VIEW
            </span>
            <span style={{ 
              padding: '0.25rem 0.5rem', 
              borderRadius: '4px', 
              fontSize: '0.75rem',
              backgroundColor: '#95a5a6',
              color: 'white'
            }}>
              ✗ DOWNLOAD
            </span>
            <span style={{ 
              padding: '0.25rem 0.5rem', 
              borderRadius: '4px', 
              fontSize: '0.75rem',
              backgroundColor: '#95a5a6',
              color: 'white'
            }}>
              ✗ OCR
            </span>
            <span style={{ 
              padding: '0.25rem 0.5rem', 
              borderRadius: '4px', 
              fontSize: '0.75rem',
              backgroundColor: '#95a5a6',
              color: 'white'
            }}>
              ✗ AI SUMMARY
            </span>
          </div>
        </div>
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
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {/* In-app preview button */}
            <button 
              className="button button-secondary" 
              onClick={() => setShowPreview(!showPreview)}
              style={{ backgroundColor: showPreview ? '#3498db' : undefined, color: showPreview ? 'white' : undefined }}
            >
              {showPreview ? '📖 Hide Preview' : '👁️ View In-App'}
            </button>
            {canDownload ? (
              <button className="button button-primary" onClick={handleDownload}>
                Download
              </button>
            ) : (
              <span style={{ 
                padding: '0.5rem 1rem', 
                backgroundColor: '#e0e0e0', 
                borderRadius: '4px', 
                color: '#666',
                fontSize: '0.875rem'
              }}>
                🔒 Download not permitted
              </span>
            )}
          </div>
        </div>

        {/* In-App Document Preview */}
        {showPreview && (
          <div style={{ marginBottom: '1rem' }}>
            {previewError ? (
              <div style={{ padding: '2rem', backgroundColor: '#fef3f2', borderRadius: '8px', textAlign: 'center' }}>
                <p style={{ color: '#e74c3c' }}>⚠️ {previewError}</p>
                <button 
                  className="button button-secondary" 
                  onClick={() => { setPreviewError(null); setShowPreview(false); }}
                  style={{ marginTop: '1rem' }}
                >
                  Close
                </button>
              </div>
            ) : document.metadata?.fileType?.includes('pdf') ? (
              <iframe
                src={`${getDocumentPreviewUrl(id)}?token=${getToken()}`}
                style={{ 
                  width: '100%', 
                  height: '600px', 
                  border: '1px solid #ddd', 
                  borderRadius: '8px',
                  backgroundColor: '#f5f5f5'
                }}
                title="Document Preview"
                onError={() => setPreviewError('Failed to load PDF preview')}
              />
            ) : document.metadata?.fileType?.startsWith('image/') ? (
              <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                <img
                  src={`${getDocumentPreviewUrl(id)}?token=${getToken()}`}
                  alt={document.title}
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: '600px', 
                    borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                  onError={() => setPreviewError('Failed to load image preview')}
                />
              </div>
            ) : (
              <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                {pagesError ? (
                  <div style={{ padding: '1rem', backgroundColor: '#fef3f2', borderRadius: '8px', textAlign: 'center' }}>
                    <p style={{ color: '#e74c3c' }}>⚠️ {pagesError}</p>
                    <p style={{ color: '#888', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                      You can also use Download or open it in Mayan.
                    </p>
                  </div>
                ) : pagesLoading ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                    Loading preview pages...
                  </div>
                ) : pages.length > 0 ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={{ color: '#666', fontSize: '0.875rem' }}>
                        📄 Page {pageIndex + 1} of {pages.length}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="button button-secondary"
                          disabled={pageIndex <= 0}
                          onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                        >
                          ← Prev
                        </button>
                        <button
                          className="button button-secondary"
                          disabled={pageIndex >= pages.length - 1}
                          onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
                        >
                          Next →
                        </button>
                      </div>
                    </div>

                    <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                      <img
                        src={`${getDocumentPageImageUrl(id, pages[pageIndex].id, 1400)}&token=${getToken()}`}
                        alt={document.title}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '700px',
                          borderRadius: '4px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}
                        onError={() => setPreviewError('Failed to load document page preview')}
                      />
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                    📄 Preview not available for this file type ({document.metadata?.fileType || 'unknown'})
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {downloadError && (
          <div className="error" style={{ marginBottom: '1rem' }}>{downloadError}</div>
        )}

        {document.metadata && (
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', alignItems: 'center' }}>
              <span style={{ color: '#666', fontSize: '0.9rem' }}>Uploaded:</span>
              <span>{new Date(document.metadata.uploadedAt).toLocaleString()}</span>
              
              {document.metadata.uploadedBy && (
                <>
                  <span style={{ color: '#666', fontSize: '0.9rem' }}>By:</span>
                  <span>{document.metadata.uploadedBy}</span>
                </>
              )}
              
              {document.metadata.fileType && (
                <>
                  <span style={{ color: '#666', fontSize: '0.9rem' }}>Type:</span>
                  <span>{document.metadata.fileType}</span>
                </>
              )}
              
              <span style={{ color: '#666', fontSize: '0.9rem' }}>OCR:</span>
              <span>
                {document.ocrText === 'OCR_PROCESSING' ? (
                  <span style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.5rem',
                    padding: '0.35rem 0.75rem',
                    backgroundColor: '#fff3e0',
                    borderRadius: '20px',
                    fontSize: '0.85rem'
                  }}>
                    <span style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid #f39c12',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      display: 'inline-block'
                    }}></span>
                    <span style={{ color: '#e67e22' }}>Processing...</span>
                  </span>
                ) : document.ocrText && !document.ocrText.startsWith('[OCR access') ? (
                  <span style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.35rem',
                    padding: '0.35rem 0.75rem',
                    backgroundColor: '#e8f5e9',
                    borderRadius: '20px',
                    color: '#2e7d32',
                    fontSize: '0.85rem'
                  }}>
                    <span>✓</span> Complete
                  </span>
                ) : (
                  <span style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.35rem',
                    padding: '0.35rem 0.75rem',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '20px',
                    color: '#757575',
                    fontSize: '0.85rem'
                  }}>
                    Restricted
                  </span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Permissions Summary */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <span style={{ 
            padding: '0.25rem 0.5rem', 
            borderRadius: '4px', 
            fontSize: '0.75rem',
            backgroundColor: '#3498db',
            color: 'white'
          }}>
            ✓ VIEW
          </span>
          <span style={{ 
            padding: '0.25rem 0.5rem', 
            borderRadius: '4px', 
            fontSize: '0.75rem',
            backgroundColor: canDownload ? '#27ae60' : '#95a5a6',
            color: 'white'
          }}>
            {canDownload ? '✓' : '✗'} DOWNLOAD
          </span>
          <span style={{ 
            padding: '0.25rem 0.5rem', 
            borderRadius: '4px', 
            fontSize: '0.75rem',
            backgroundColor: canViewOcr ? '#9b59b6' : '#95a5a6',
            color: 'white'
          }}>
            {canViewOcr ? '✓' : '✗'} OCR
          </span>
          <span style={{ 
            padding: '0.25rem 0.5rem', 
            borderRadius: '4px', 
            fontSize: '0.75rem',
            backgroundColor: canViewAiSummary ? '#e67e22' : '#95a5a6',
            color: 'white'
          }}>
            {canViewAiSummary ? '✓' : '✗'} AI SUMMARY
          </span>
        </div>
      </div>

      {/* Explicit AI Summary Action */}
      {canViewAiSummary && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3>🤖 AI Summary</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className="button button-primary"
                onClick={() => handleRequestAiSummary(false)}
                disabled={aiLoading}
                style={{ 
                  backgroundColor: '#e67e22',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {aiLoading ? (
                  <>
                    <span style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: 'white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      display: 'inline-block'
                    }}></span>
                    Generating...
                  </>
                ) : '✨ Generate Summary'}
              </button>
              {aiResult && (
                <button 
                  className="button button-secondary"
                  onClick={() => handleRequestAiSummary(true)}
                  disabled={aiLoading}
                  title="Force regenerate (bypass cache)"
                >
                  🔄 Refresh
                </button>
              )}
            </div>
          </div>
          
          {aiResult ? (
            <div>
              {aiResult.success !== false ? (
                <>
                  {aiResult.cached && (
                    <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.5rem' }}>
                      📦 Cached result
                    </p>
                  )}
                  <p style={{ lineHeight: '1.6' }}>{aiResult.summary || aiResult.message}</p>
                  {aiResult.keywords && aiResult.keywords.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <strong>Keywords:</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                        {aiResult.keywords.map((keyword, index) => (
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
              ) : (
                <p style={{ color: '#e74c3c' }}>❌ {aiResult.message}</p>
              )}
            </div>
          ) : (
            <p style={{ color: '#888', fontStyle: 'italic' }}>
              Click "Generate Summary" to create an AI-powered summary of this document.
            </p>
          )}
        </div>
      )}

      {/* Explicit OCR Text Action */}
      {canViewOcr && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3>📝 OCR Text</h3>
            <button 
              className="button button-primary"
              onClick={handleRequestOcr}
              disabled={ocrLoading}
              style={{ 
                backgroundColor: '#9b59b6',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {ocrLoading ? (
                <>
                  <span style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    display: 'inline-block'
                  }}></span>
                  Extracting...
                </>
              ) : '🔍 Extract OCR Text'}
            </button>
          </div>
          
          {/* OCR Notification Banner */}
          {ocrNotification && (
            <div style={{
              backgroundColor: '#d4edda',
              border: '1px solid #c3e6cb',
              color: '#155724',
              padding: '0.75rem 1rem',
              borderRadius: '4px',
              marginBottom: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ fontSize: '1.2rem' }}>🔔</span>
              <span>{ocrNotification}</span>
            </div>
          )}
          
          {ocrResult ? (
            <div>
              {ocrResult.success !== false ? (
                <div style={{
                  maxHeight: '400px',
                  overflowY: 'auto',
                  padding: '1rem',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '8px',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem'
                }}>
                  {ocrResult.cached && (
                    <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.5rem' }}>
                      📦 Cached result
                    </p>
                  )}
                  {ocrResult.ocrText === 'OCR_PROCESSING' ? (
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column',
                      alignItems: 'center', 
                      gap: '1rem', 
                      padding: '2rem',
                      backgroundColor: '#fff3e0',
                      borderRadius: '8px'
                    }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        border: '3px solid #f39c12',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }}></div>
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ color: '#e67e22', fontWeight: 500, marginBottom: '0.5rem' }}>
                          OCR Processing in Progress
                        </p>
                        <p style={{ color: '#999', fontSize: '0.8rem' }}>
                          This may take a moment. The page will update automatically when complete.
                        </p>
                      </div>
                    </div>
                  ) : (ocrResult.ocrText || ocrResult.message || 'No OCR text available')}
                </div>
              ) : (
                <p style={{ color: '#e74c3c' }}>❌ {ocrResult.message}</p>
              )}
            </div>
          ) : (
            <p style={{ color: '#888', fontStyle: 'italic' }}>
              Click "Extract OCR Text" to retrieve the extracted text from this document.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentView;

