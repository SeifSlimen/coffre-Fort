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

    if (isAuthenticated()) {
      console.log('[API] User is authenticated, getting token...');
      try {
        // Update token if needed (refreshes if expiring soon)
        const token = await updateToken();
        console.log('[API] Token obtained:', token ? token.substring(0, 20) + '...' : 'null');

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (err) {
        console.error('[API] Failed to update token:', err);
        // Fallback to current token if refresh fails
        const fallbackToken = getToken();
        console.log('[API] Using fallback token:', fallbackToken ? fallbackToken.substring(0, 20) + '...' : 'null');

        if (fallbackToken) {
          config.headers.Authorization = `Bearer ${fallbackToken}`;
        }
      }
    } else {
      console.log('[API] User not authenticated');
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

export const grantAccess = (userId, documentId, expiresAt) =>
  api.post('/api/admin/access', { userId, documentId, expiresAt });

export const revokeAccess = (userId, documentId) =>
  api.delete(`/api/admin/access/${userId}/${documentId}`);

export default api;

