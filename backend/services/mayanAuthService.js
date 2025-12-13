/**
 * Mayan Authentication Service (Per-User Tokens)
 * 
 * Manages per-user Mayan API tokens for True SSO.
 * Each user gets their own Mayan API token, cached in Redis.
 * This enables Mayan to track actions by actual user, not just "admin".
 * 
 * FLOW:
 * 1. User logs in via Keycloak → synced to Mayan via mayanUserService
 * 2. Backend requests Mayan token for that user
 * 3. Token cached in Redis with TTL
 * 4. All subsequent API calls use user's token
 * 
 * KEY PATTERNS:
 * - mayan:token:{userId} → Mayan API token string
 * - mayan:user:{userId} → Cached Mayan user ID mapping
 */

const axios = require('axios');
const { redis } = require('./redisClient');
const { MAYAN_URL } = require('../config/mayan');

// Configuration
const MAYAN_ADMIN_USER = process.env.MAYAN_USERNAME || 'admin';
const MAYAN_ADMIN_PASSWORD = process.env.MAYAN_PASSWORD || 'admin123';
const TOKEN_CACHE_PREFIX = 'mayan:token:';
const USER_CACHE_PREFIX = 'mayan:user:';
const AUTH_METHOD_KEY = 'mayan:auth:method'; // Cache whether token API works
const TOKEN_TTL = 3600; // 1 hour

// Cache whether Mayan token API is available (avoid repeated failed attempts)
let tokenApiAvailable = null; // null = unknown, true = works, false = doesn't work

/**
 * Get admin auth header for service account operations
 */
function getAdminAuth() {
  return 'Basic ' + Buffer.from(`${MAYAN_ADMIN_USER}:${MAYAN_ADMIN_PASSWORD}`).toString('base64');
}

/**
 * Find Mayan user by email or username
 * @param {string} email - User email from Keycloak
 * @param {string} username - Username from Keycloak
 * @returns {object|null} Mayan user object or null
 */
async function findMayanUser(email, username) {
  try {
    const response = await axios.get(`${MAYAN_URL}/api/v4/users/`, {
      headers: { 'Authorization': getAdminAuth() }
    });
    
    const users = response.data.results || [];
    
    // Try to match by email first, then username
    let mayanUser = users.find(u => u.email === email);
    if (!mayanUser) {
      mayanUser = users.find(u => u.username === username || u.username === email);
    }
    
    return mayanUser || null;
  } catch (error) {
    console.error('[MayanAuth] Failed to find user:', error.message);
    return null;
  }
}

/**
 * Get or create Mayan API token for a user
 * Uses cached token if available, otherwise creates new one
 * 
 * @param {string} userId - Keycloak user ID (sub claim)
 * @param {string} email - User email
 * @param {string} username - Username
 * @returns {string|null} Mayan API token or null if failed
 */
async function getMayanTokenForUser(userId, email, username) {
  const cacheKey = `${TOKEN_CACHE_PREFIX}${userId}`;
  
  try {
    // Check cache first
    const cachedToken = await redis.get(cacheKey);
    if (cachedToken) {
      console.log(`[MayanAuth] Cache HIT - Using cached token for user ${email}`);
      return cachedToken;
    }
    
    console.log(`[MayanAuth] Cache MISS - Getting token for user ${email}`);
    
    // First check if we have a cached Mayan user ID mapping
    const cachedMayanUserId = await getCachedMayanUserId(userId);
    let mayanUser = null;
    
    if (cachedMayanUserId) {
      console.log(`[MayanAuth] Using cached Mayan user ID: ${cachedMayanUserId}`);
      try {
        const response = await axios.get(`${MAYAN_URL}/api/v4/users/${cachedMayanUserId}/`, {
          headers: { 'Authorization': getAdminAuth() }
        });
        mayanUser = response.data;
      } catch (error) {
        console.warn(`[MayanAuth] Cached Mayan user ID ${cachedMayanUserId} not found, searching...`);
      }
    }
    
    // If no cached mapping, find user by email/username
    if (!mayanUser) {
      mayanUser = await findMayanUser(email, username);
    }
    
    if (!mayanUser) {
      console.warn(`[MayanAuth] User ${email} not found in Mayan - will use admin token`);
      return null;
    }
    
    // Get or create API token for this user
    // Mayan's AuthToken model stores tokens per user
    const token = await getOrCreateMayanToken(mayanUser);
    
    if (token) {
      // Cache the token
      await redis.setex(cacheKey, TOKEN_TTL, token);
      console.log(`[MayanAuth] Token obtained and cached for user ${email} (TTL: ${TOKEN_TTL}s)`);
    }
    
    return token;
  } catch (error) {
    console.error(`[MayanAuth] Failed to get token for user ${email}:`, error.message);
    return null;
  }
}

/**
 * Get or create Mayan API token for a specific user
 * Uses admin credentials to manage tokens
 * 
 * @param {object} mayanUser - Mayan user object
 * @returns {string|null} API token or null
 */
async function getOrCreateMayanToken(mayanUser) {
  // Fast path: if we already know token API doesn't work, skip trying
  if (tokenApiAvailable === false) {
    return null; // Will trigger fallback
  }

  try {
    // First, try to get existing token from Mayan's auth_token endpoint
    // Mayan stores tokens in database, we need to access via admin
    
    // Method 1: Try to get user's existing auth tokens
    const tokensResponse = await axios.get(
      `${MAYAN_URL}/api/v4/auth/tokens/`,
      { headers: { 'Authorization': getAdminAuth() } }
    );
    
    // Token API works!
    tokenApiAvailable = true;
    
    // Check if user already has a token
    const existingToken = tokensResponse.data.results?.find(
      t => t.user?.id === mayanUser.id
    );
    
    if (existingToken) {
      return existingToken.token || existingToken.key;
    }
    
    // Method 2: Create new token for user
    // Note: This requires proper Mayan API version that supports token creation
    const createResponse = await axios.post(
      `${MAYAN_URL}/api/v4/auth/tokens/`,
      { user_id: mayanUser.id },
      { headers: { 'Authorization': getAdminAuth() } }
    );
    
    const newToken = createResponse.data.token || createResponse.data.key;
    return newToken;
    
  } catch (error) {
    // If token API not available, cache this fact and use fallback
    if (error.response?.status === 404 || error.response?.status === 405) {
      tokenApiAvailable = false;
      console.log('[MayanAuth] Token API not available - using admin auth with user context (cached)');
      return null;
    }
    
    console.error(`[MayanAuth] Token creation failed:`, error.response?.data || error.message);
    return null;
  }
}

/**
 * Alternative: Get token via session-based login
 * For Mayan versions that don't expose token API
 * 
 * @param {object} mayanUser - Mayan user object
 * @returns {string|null} Session token or null
 */
async function getSessionBasedToken(mayanUser) {
  try {
    // For OIDC users, we use a different approach:
    // The user already has a session via OIDC, we use admin impersonation
    
    // Store admin token with user context header for audit
    // This is a fallback - user tracking via X-Forwarded-User header
    console.log(`[MayanAuth] Using admin token with user context for ${mayanUser.username}`);
    return null; // Return null to trigger fallback with user context headers
    
  } catch (error) {
    console.error('[MayanAuth] Session-based token failed:', error.message);
    return null;
  }
}

/**
 * Invalidate cached token for a user
 * Call this on logout or token refresh
 * 
 * @param {string} userId - Keycloak user ID
 */
async function invalidateUserToken(userId) {
  try {
    await redis.del(`${TOKEN_CACHE_PREFIX}${userId}`);
    await redis.del(`${USER_CACHE_PREFIX}${userId}`);
    console.log(`[MayanAuth] Invalidated token cache for user ${userId}`);
  } catch (error) {
    console.error(`[MayanAuth] Failed to invalidate token:`, error.message);
  }
}

/**
 * Get auth header for Mayan API requests
 * Returns user token if available, otherwise admin with user context headers
 * 
 * @param {object} userContext - User context from request
 * @returns {object} Headers object for Mayan requests
 */
async function getAuthHeaders(userContext = null) {
  const headers = {};
  
  // Fast path: if we know token API doesn't work, use admin directly
  if (tokenApiAvailable === false) {
    headers['Authorization'] = getAdminAuth();
    if (userContext?.email) {
      headers['X-Forwarded-User'] = userContext.email;
      headers['X-Request-User-Id'] = userContext.userId || '';
    }
    return headers;
  }
  
  if (userContext?.userId && userContext?.email) {
    const userToken = await getMayanTokenForUser(
      userContext.userId,
      userContext.email,
      userContext.username
    );
    
    if (userToken) {
      // Use user's own token (true SSO)
      headers['Authorization'] = `Token ${userToken}`;
    } else {
      // Fallback: Admin token with user context headers for audit
      headers['Authorization'] = getAdminAuth();
      headers['X-Forwarded-User'] = userContext.email;
      headers['X-Request-User-Id'] = userContext.userId;
      headers['X-Request-Username'] = userContext.username || 'unknown';
    }
  } else {
    // No user context - use admin (for background jobs, etc.)
    headers['Authorization'] = getAdminAuth();
  }
  
  return headers;
}

/**
 * Cache Mayan user ID for faster lookups
 * 
 * @param {string} keycloakUserId - Keycloak user ID
 * @param {number} mayanUserId - Mayan user ID
 */
async function cacheMayanUserId(keycloakUserId, mayanUserId) {
  const cacheKey = `${USER_CACHE_PREFIX}${keycloakUserId}`;
  await redis.setex(cacheKey, TOKEN_TTL * 24, String(mayanUserId)); // 24 hour cache
  console.log(`[MayanAuth] Cached Mayan user ID mapping: ${keycloakUserId} → ${mayanUserId}`);
}

/**
 * Get cached Mayan user ID
 * 
 * @param {string} keycloakUserId - Keycloak user ID
 * @returns {number|null} Mayan user ID or null
 */
async function getCachedMayanUserId(keycloakUserId) {
  const cacheKey = `${USER_CACHE_PREFIX}${keycloakUserId}`;
  const mayanUserId = await redis.get(cacheKey);
  return mayanUserId ? parseInt(mayanUserId, 10) : null;
}

module.exports = {
  getMayanTokenForUser,
  invalidateUserToken,
  getAuthHeaders,
  findMayanUser,
  cacheMayanUserId,
  getCachedMayanUserId
};
