import axios from 'axios';
import { KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID } from '../utils/constants';

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
 * Generate a random state parameter for CSRF protection
 */
const generateState = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

/**
 * Initiate login by redirecting to Keycloak
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
 * Get user information from ID token
 */
export const getUserInfo = () => {
  if (!userInfo && tokens.idToken) {
    userInfo = parseJwt(tokens.idToken);
  }

  if (!userInfo) return null;

  return {
    sub: userInfo.sub,
    email: userInfo.email,
    username: userInfo.preferred_username || userInfo.email,
    name: userInfo.name,
    givenName: userInfo.given_name,
    familyName: userInfo.family_name,
    roles: userInfo.realm_access?.roles || []
  };
};

/**
 * Refresh access token using refresh token
 */
export const refreshToken = async () => {
  if (!tokens.refreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    const tokenUrl = `${config.url}/realms/${config.realm}/protocol/openid-connect/token`;

    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: config.clientId
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const data = response.data;

    // Update tokens
    tokens.accessToken = data.access_token;
    tokens.refreshToken = data.refresh_token;
    tokens.idToken = data.id_token;
    tokens.expiresAt = Date.now() + (data.expires_in * 1000);

    // Persist to localStorage
    localStorage.setItem('auth_tokens', JSON.stringify(tokens));

    console.log('Token refreshed successfully');

    return tokens.accessToken;
  } catch (error) {
    console.error('Token refresh failed:', error.response?.data || error.message);
    // Clear tokens on refresh failure
    clearTokens();
    throw error;
  }
};

/**
 * Update token if it's about to expire
 */
export const updateToken = async (minValidity = 60) => {
  if (!tokens.expiresAt) {
    return tokens.accessToken;
  }

  const expiresIn = (tokens.expiresAt - Date.now()) / 1000;

  if (expiresIn < minValidity) {
    return await refreshToken();
  }

  return tokens.accessToken;
};

/**
 * Logout user
 */
export const logout = () => {
  const logoutUrl = `${config.url}/realms/${config.realm}/protocol/openid-connect/logout?` +
    `redirect_uri=${encodeURIComponent(config.redirectUri)}`;

  // Clear tokens
  clearTokens();

  // Redirect to Keycloak logout
  window.location.href = logoutUrl;
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
  logout,
  handleCallback,
  isAuthenticated,
  getToken,
  getUserInfo,
  updateToken
};
