import axios from 'axios';
import { API_URL } from '../utils/constants';
import { getToken, updateToken, isAuthenticated } from './auth';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add token
api.interceptors.request.use(
  async (config) => {
    console.log('[API] Making request to:', config.url);

    // Always try to get a token if we have one stored
    const currentToken = getToken();
    
    if (currentToken) {
      console.log('[API] Token found, checking if refresh needed...');
      try {
        // Update token if needed (refreshes if expiring soon)
        const token = await updateToken();
        console.log('[API] Token obtained:', token ? token.substring(0, 20) + '...' : 'null');

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (err) {
        console.error('[API] Failed to update token:', err);
        // Use current token as fallback - let the server reject if invalid
        console.log('[API] Using current token as fallback');
        config.headers.Authorization = `Bearer ${currentToken}`;
      }
    } else {
      console.log('[API] No token available');
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      console.error('[API] 401 Unauthorized - redirecting to login');
      // Token expired or invalid, redirect to login
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const validateToken = () => api.get('/api/auth/validate');
export const getUser = () => api.get('/api/auth/user');
export const logout = () => api.post('/api/auth/logout');

// Document endpoints
export const uploadDocument = (file, title, description, options = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  if (title) formData.append('title', title);
  if (description) formData.append('description', description);

  if (options?.cabinetId) formData.append('cabinetId', String(options.cabinetId));
  if (options?.cabinetPath) formData.append('cabinetPath', String(options.cabinetPath));
  if (options?.documentTypeId) formData.append('documentTypeId', String(options.documentTypeId));
  if (options?.tagIds && Array.isArray(options.tagIds)) formData.append('tagIds', JSON.stringify(options.tagIds));

  return api.post('/api/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};

export const getDocuments = (page = 1, limit = 10) =>
  api.get(`/api/documents?page=${page}&limit=${limit}`);

export const getDocument = (id) =>
  api.get(`/api/documents/${id}`);

export const deleteDocument = (id) =>
  api.delete(`/api/documents/${id}`);

export const downloadDocument = (id) =>
  api.get(`/api/documents/${id}/download`, { responseType: 'blob' });

// Get document preview URL for in-app viewing
export const getDocumentPreviewUrl = (id) =>
  `${API_URL}/api/documents/${id}/preview`;

// Batch get thumbnails (more efficient than individual calls)
export const getBatchThumbnails = (ids, size = 150) =>
  api.get(`/api/documents/thumbnails?ids=${ids.join(',')}&size=${size}`);

export const getDocumentPages = (id) =>
  api.get(`/api/documents/${id}/pages`);

export const getDocumentPageImageUrl = (id, pageId, width = 1200) =>
  `${API_URL}/api/documents/${id}/pages/${pageId}/image?width=${width}`;

// AI endpoints (legacy)
export const getSummary = (documentId) =>
  api.post('/api/ai/summarize', { documentId });

export const getCachedSummary = (documentId) =>
  api.get(`/api/ai/summary/${documentId}`);

// Explicit OCR/AI actions (new)
export const requestOcrText = (documentId) =>
  api.post(`/api/ai/ocr/${documentId}`);

export const requestAiSummary = (documentId, forceRefresh = false) =>
  api.post(`/api/ai/summary/${documentId}`, { forceRefresh });

// Admin endpoints
export const getUsers = () =>
  api.get('/api/admin/users');

export const createUser = (userData) =>
  api.post('/api/admin/users', userData);

export const updateUser = (userId, userData) =>
  api.put(`/api/admin/users/${userId}`, userData);

export const deleteUser = (userId) =>
  api.delete(`/api/admin/users/${userId}`);

export const getRoles = () =>
  api.get('/api/admin/roles');

export const getPermissionTypes = () =>
  api.get('/api/admin/permission-types');

export const grantAccess = (userId, documentId, expiresAt, permissions) =>
  api.post('/api/admin/access', { userId, documentId, expiresAt, permissions });

export const revokeAccess = (userId, documentId) =>
  api.delete(`/api/admin/access/${userId}/${documentId}`);

export const getAccessGrants = () =>
  api.get('/api/admin/access-grants');

// ============================================================================
// CACHE MANAGEMENT (Admin)
// ============================================================================

export const getCacheStats = () =>
  api.get('/api/admin/cache-stats');

export const clearAllCache = () =>
  api.post('/api/admin/cache/clear');

export const clearCacheType = (type) =>
  api.post(`/api/admin/cache/clear/${type}`);

export const getCacheKeys = (pattern = 'cache:*', limit = 100) =>
  api.get(`/api/admin/cache/keys?pattern=${encodeURIComponent(pattern)}&limit=${limit}`);

export const deleteCacheKey = (key) =>
  api.delete(`/api/admin/cache/key/${encodeURIComponent(key)}`);

export const deleteCachePattern = (pattern) =>
  api.post('/api/admin/cache/delete-pattern', { pattern });

// ============================================================================
// AUDIT LOGS
// ============================================================================

export const getAuditLogs = (limit = 100, offset = 0) =>
  api.get(`/api/audit/logs?limit=${limit}&offset=${offset}`);

export const getAuditStats = () =>
  api.get('/api/audit/stats');

export const getAuditByUser = (userId, limit = 50) =>
  api.get(`/api/audit/users/${userId}?limit=${limit}`);

export const getAuditByDocument = (documentId, limit = 50) =>
  api.get(`/api/audit/documents/${documentId}?limit=${limit}`);

// ============================================================================
// DOCUMENT SEARCH
// ============================================================================

export const getDocumentTypes = () =>
  api.get('/api/documents/types');

export const searchDocuments = (params) => {
  const queryString = new URLSearchParams(params).toString();
  return api.get(`/api/documents/search?${queryString}`);
};

export const getSearchSuggestions = (query) =>
  api.get(`/api/documents/search/suggestions?q=${encodeURIComponent(query)}`);

// ============================================================================
// DOCUMENT EXTRAS (Thumbnails, Tags, Versions)
// ============================================================================

export const getDocumentThumbnail = (documentId, size = 200) =>
  api.get(`/api/documents/${documentId}/thumbnail?size=${size}&format=json`);

export const getDocumentTags = (documentId) =>
  api.get(`/api/documents/${documentId}/tags`);

export const getAllTags = () =>
  api.get('/api/documents/tags/all');

export const getAllCabinets = () =>
  api.get('/api/documents/cabinets/all');

export const getCabinetDocumentsPublic = (cabinetId, page = 1, limit = 12) =>
  api.get(`/api/documents/cabinets/${cabinetId}/documents?page=${page}&limit=${limit}`);

export const getDocumentVersions = (documentId) =>
  api.get(`/api/documents/${documentId}/versions`);

export const getDocumentEvents = (documentId) =>
  api.get(`/api/documents/${documentId}/events`);

// ============================================================================
// STORAGE STATS
// ============================================================================

export const getStorageStats = () =>
  api.get('/api/admin/storage-stats');

// ============================================================================
// ACCESS REQUESTS (User-initiated)
// ============================================================================

export const requestDocumentAccess = (documentId, reason, permissions = ['view']) =>
  api.post(`/api/documents/${documentId}/request-access`, { reason, permissions });

// ============================================================================
// ACCESS REQUESTS (Admin management)
// ============================================================================

export const getAccessRequests = (status = null) => {
  const params = status ? `?status=${status}` : '';
  return api.get(`/api/admin/access-requests${params}`);
};

export const getPendingRequestCount = () =>
  api.get('/api/admin/access-requests/count');

export const approveAccessRequest = (requestId, expiresAt, note = '') =>
  api.post(`/api/admin/access-requests/${requestId}/approve`, { expiresAt, note });

export const rejectAccessRequest = (requestId, note = '') =>
  api.post(`/api/admin/access-requests/${requestId}/reject`, { note });

// ============================================================================
// BULK ACCESS OPERATIONS
// ============================================================================

export const bulkGrantAccess = (userId, documentIds, expiresAt, permissions = ['view']) =>
  api.post('/api/admin/access/bulk', { userId, documentIds, expiresAt, permissions });

export const bulkRevokeAccess = (userId, documentIds) =>
  api.delete('/api/admin/access/bulk', { data: { userId, documentIds } });

// ============================================================================
// ACCESS TEMPLATES
// ============================================================================

export const getAccessTemplates = () =>
  api.get('/api/admin/access-templates');

export const createAccessTemplate = (name, permissions, defaultDurationDays, description) =>
  api.post('/api/admin/access-templates', { name, permissions, defaultDurationDays, description });

export const deleteAccessTemplate = (templateId) =>
  api.delete(`/api/admin/access-templates/${templateId}`);

export const applyAccessTemplate = (templateId, userId, documentId) =>
  api.post(`/api/admin/access-templates/${templateId}/apply`, { userId, documentId });

// ============================================================================
// MAYAN EVENTS (Enhanced Audit)
// ============================================================================

export const getMayanEvents = (params = {}) => {
  const queryString = new URLSearchParams(params).toString();
  return api.get(`/api/admin/mayan-events?${queryString}`);
};

export const getMayanEventTypes = () =>
  api.get('/api/admin/mayan-event-types');

// ============================================================================
// CABINETS (Folders)
// ============================================================================

export const getCabinets = () =>
  api.get('/api/admin/cabinets');

export const createCabinet = (label, parentId = null) =>
  api.post('/api/admin/cabinets', { label, parentId });

export const updateCabinet = (cabinetId, label) =>
  api.patch(`/api/admin/cabinets/${cabinetId}`, { label });

export const deleteCabinet = (cabinetId) =>
  api.delete(`/api/admin/cabinets/${cabinetId}`);

export const getCabinetDocuments = (cabinetId, page = 1, limit = 20) =>
  api.get(`/api/admin/cabinets/${cabinetId}/documents?page=${page}&limit=${limit}`);

export const addDocumentToCabinet = (cabinetId, documentId) =>
  api.post(`/api/admin/cabinets/${cabinetId}/documents`, { documentId });

export const removeDocumentFromCabinet = (cabinetId, documentId) =>
  api.delete(`/api/admin/cabinets/${cabinetId}/documents/${documentId}`);

// ============================================================================
// METADATA TYPES
// ============================================================================

export const getMetadataTypes = () =>
  api.get('/api/admin/metadata-types');

export const createMetadataType = (name, label) =>
  api.post('/api/admin/metadata-types', { name, label });

export const setDocumentMetadata = (documentId, metadataTypeId, value) =>
  api.post(`/api/documents/${documentId}/metadata`, { metadataTypeId, value });

export const getDocumentMetadata = (documentId) =>
  api.get(`/api/documents/${documentId}/metadata`);

// ============================================================================
// CONTENT SEARCH (OCR)
// ============================================================================

export const searchByContent = (query, page = 1, limit = 20) =>
  api.get(`/api/documents/search/content?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);

export const advancedSearch = (params) => {
  const queryString = new URLSearchParams(params).toString();
  return api.get(`/api/documents/search/advanced?${queryString}`);
};

// ============================================================================
// REAL STATISTICS
// ============================================================================

export const getSystemStatistics = () =>
  api.get('/api/admin/statistics');

// ============================================================================
// FILTERED EVENTS (Enhanced Audit)
// ============================================================================

export const getFilteredEvents = (params = {}) => {
  const queryString = new URLSearchParams(params).toString();
  return api.get(`/api/admin/events/filtered?${queryString}`);
};

export default api;

