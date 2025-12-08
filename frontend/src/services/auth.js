import axios from 'axios';
import { KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, API_URL } from '../utils/constants';

// Configuration
const config = {
  url: KEYCLOAK_URL,
  realm: KEYCLOAK_REALM,
  clientId: KEYCLOAK_CLIENT_ID,
  redirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
};

// Token storage (in-memory + localStorage persistence)
const getStoredTokens = () => {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('auth_tokens') || '{}');
  } catch (e) {
    return {};
  }
};

const storedTokens = getStoredTokens();

let tokens = {
  accessToken: storedTokens.accessToken || null,
  refreshToken: storedTokens.refreshToken || null,
  idToken: storedTokens.idToken || null,
  expiresAt: storedTokens.expiresAt || null
};

let userInfo = null;

/**
 * Direct login - authenticate with username/password without redirect
 */
export const directLogin = async (username, password) => {
  try {
    console.log('[Auth] Direct login attempt for:', username);
    
    const response = await axios.post(`${API_URL}/api/auth/direct-login`, {
      username,
      password
    });

    const data = response.data;

    // Store tokens
    tokens.accessToken = data.access_token;
    tokens.refreshToken = data.refresh_token;
    tokens.idToken = data.id_token;
    tokens.expiresAt = Date.now() + (data.expires_in * 1000);

    // Persist to localStorage
    localStorage.setItem('auth_tokens', JSON.stringify(tokens));

    console.log('[Auth] Direct login successful');

    // Decode ID token to get user info
    if (data.id_token) {
      userInfo = parseJwt(data.id_token);
    }

    return true;
  } catch (error) {
    console.error('[Auth] Direct login failed:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error || 'Authentication failed');
  }
};

/**
 * Generate a random state parameter for CSRF protection
 */
const generateState = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

/**
 * Initiate login by redirecting to Keycloak (fallback/SSO option)
 */
export const login = () => {
  const state = generateState();
  sessionStorage.setItem('oauth_state', state);

  const authUrl = `${config.url}/realms/${config.realm}/protocol/openid-connect/auth?` +
    `client_id=${encodeURIComponent(config.clientId)}&` +
    `redirect_uri=${encodeURIComponent(config.redirectUri)}&` +
    `state=${encodeURIComponent(state)}&` +
    `response_type=code&` +
    `scope=openid%20profile%20email`;

  console.log('Redirecting to Keycloak:', authUrl);
  window.location.href = authUrl;
};

/**
 * Handle OAuth callback after Keycloak redirect
 */
export const handleCallback = async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const storedState = sessionStorage.getItem('oauth_state');

  if (!code) {
    throw new Error('No authorization code found');
  }

  if (state !== storedState) {
    throw new Error('Invalid state parameter - possible CSRF attack');
  }

  // Clear state from storage
  sessionStorage.removeItem('oauth_state');

  try {
    // Exchange authorization code for tokens
    const tokenUrl = `${config.url}/realms/${config.realm}/protocol/openid-connect/token`;

    console.log('Exchanging code for tokens...');

    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const data = response.data;

    // Store tokens
    tokens.accessToken = data.access_token;
    tokens.refreshToken = data.refresh_token;
    tokens.idToken = data.id_token;
    tokens.expiresAt = Date.now() + (data.expires_in * 1000);

    // Persist to localStorage
    localStorage.setItem('auth_tokens', JSON.stringify(tokens));

    console.log('Tokens received successfully');

    // Decode ID token to get user info
    userInfo = parseJwt(data.id_token);

    // Clear URL parameters
    window.history.replaceState({}, document.title, window.location.pathname);

    return true;
  } catch (error) {
    console.error('Token exchange failed:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  if (!tokens.accessToken) {
    return false;
  }

  // Check if token is expired
  if (tokens.expiresAt && Date.now() >= tokens.expiresAt) {
    return false;
  }

  return true;
};

/**
 * Get current access token
 */
export const getToken = () => {
  return tokens.accessToken;
};

/**
 * Get user information from ID token and access token
 */
export const getUserInfo = () => {
  if (!userInfo && tokens.idToken) {
    userInfo = parseJwt(tokens.idToken);
  }

  if (!userInfo) return null;

  // Get roles from access token (realm_access is in access token, not ID token)
  let roles = userInfo.realm_access?.roles || [];
  if (roles.length === 0 && tokens.accessToken) {
    const accessTokenPayload = parseJwt(tokens.accessToken);
    roles = accessTokenPayload?.realm_access?.roles || [];
  }

  return {
    sub: userInfo.sub,
    email: userInfo.email,
    username: userInfo.preferred_username || userInfo.email,
    name: userInfo.name,
    givenName: userInfo.given_name,
    familyName: userInfo.family_name,
    roles: roles
  };
};

/**
 * Refresh access token using refresh token via backend
 */
export const refreshToken = async () => {
  if (!tokens.refreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    console.log('[Auth] Refreshing token via backend...');
    
    // Use backend endpoint for refresh (more reliable, handles CORS)
    const response = await axios.post(`${API_URL}/api/auth/refresh`, {
      refresh_token: tokens.refreshToken
    });

    const data = response.data;

    // Update tokens
    tokens.accessToken = data.access_token;
    tokens.refreshToken = data.refresh_token;
    tokens.idToken = data.id_token;
    tokens.expiresAt = Date.now() + (data.expires_in * 1000);

    // Persist to localStorage
    localStorage.setItem('auth_tokens', JSON.stringify(tokens));

    console.log('[Auth] Token refreshed successfully, expires in:', data.expires_in, 'seconds');

    return tokens.accessToken;
  } catch (error) {
    console.error('[Auth] Token refresh failed:', error.response?.data || error.message);
    // Clear tokens on refresh failure
    clearTokens();
    throw error;
  }
};

/**
 * Update token if it's about to expire or already expired
 */
export const updateToken = async (minValidity = 60) => {
  // If no access token, can't update
  if (!tokens.accessToken) {
    return null;
  }

  // If no expiry info, just return current token
  if (!tokens.expiresAt) {
    return tokens.accessToken;
  }

  const expiresIn = (tokens.expiresAt - Date.now()) / 1000;
  console.log('[Auth] Token expires in:', expiresIn, 'seconds');

  // If token is expired or about to expire, try to refresh
  if (expiresIn < minValidity) {
    console.log('[Auth] Token needs refresh');
    if (tokens.refreshToken) {
      return await refreshToken();
    } else {
      console.log('[Auth] No refresh token available');
      return tokens.accessToken; // Return expired token, let server reject
    }
  }

  return tokens.accessToken;
};

/**
 * Logout user - silent logout without redirect to Keycloak
 */
export const logout = async () => {
  const refreshToken = tokens.refreshToken;
  
  // Clear tokens first
  clearTokens();

  // Try to revoke the token with our backend (which will call Keycloak)
  if (refreshToken) {
    try {
      await axios.post(`${API_URL}/api/auth/logout`, 
        { refresh_token: refreshToken },
        {
          headers: {
            'Authorization': `Bearer ${tokens.accessToken || ''}`
          }
        }
      );
      console.log('[Auth] Logout successful - token revoked');
    } catch (error) {
      console.warn('[Auth] Token revocation failed, but local logout completed:', error.message);
      // Continue anyway - local tokens are cleared
    }
  }

  // Redirect to login page
  window.location.href = '/';
};

/**
 * Clear all tokens
 */
const clearTokens = () => {
  tokens = {
    accessToken: null,
    refreshToken: null,
    idToken: null,
    expiresAt: null
  };
  userInfo = null;
  localStorage.removeItem('auth_tokens');
};

/**
 * Parse JWT token (without validation - for display purposes only)
 */
const parseJwt = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to parse JWT:', e);
    return null;
  }
};

// Set up automatic token refresh
if (typeof window !== 'undefined') {
  setInterval(() => {
    if (isAuthenticated()) {
      updateToken(300).catch(() => {
        // Token refresh failed, user will need to re-authenticate
        console.log('Auto token refresh failed');
      });
    }
  }, 60000); // Check every minute
}

export default {
  login,
  directLogin,
  logout,
  handleCallback,
  isAuthenticated,
  getToken,
  getUserInfo,
  updateToken
};
