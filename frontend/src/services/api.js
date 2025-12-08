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
export const uploadDocument = (file, title, description) => {
  const formData = new FormData();
  formData.append('file', file);
  if (title) formData.append('title', title);
  if (description) formData.append('description', description);

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

// AI endpoints
export const getSummary = (documentId) =>
  api.post('/api/ai/summarize', { documentId });

export const getCachedSummary = (documentId) =>
  api.get(`/api/ai/summary/${documentId}`);

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

export default api;

