const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const accessControl = require('../services/accessControl');
const mayanUserService = require('../services/mayanUserService');
const auditService = require('../services/auditService');

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'coffre-fort';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'coffre-fort-app';

// Direct login endpoint - authenticates with Keycloak without redirect
router.post('/direct-login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    console.log('[Auth] Direct login attempt for:', username);
    
    const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;
    
    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'password',
        client_id: KEYCLOAK_CLIENT_ID,
        username,
        password,
        scope: 'openid profile email'
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    console.log('[Auth] Direct login successful for:', username);

    // Decode the access token to get user info
    const decoded = jwt.decode(response.data.access_token);
    
    // Sync user to Mayan (True SSO - creates user in Mayan with same identity)
    try {
      await mayanUserService.syncUserToMayan({
        id: decoded.sub,
        email: decoded.email,
        username: decoded.preferred_username,
        firstName: decoded.given_name || '',
        lastName: decoded.family_name || '',
        roles: decoded.realm_access?.roles || []
      });
      console.log('[Auth] User synced to Mayan:', decoded.email);
    } catch (syncError) {
      console.warn('[Auth] Mayan user sync failed (non-blocking):', syncError.message);
    }

    // Audit login
    try {
      await auditService.log(auditService.AUDIT_ACTIONS.USER_LOGIN, decoded.sub, {
        userEmail: decoded.email,
        username: decoded.preferred_username,
        roles: decoded.realm_access?.roles || [],
        loginMethod: 'direct'
      });
    } catch (auditError) {
      console.warn('[Auth] Audit log failed (non-blocking):', auditError.message);
    }

    res.json({
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      id_token: response.data.id_token,
      expires_in: response.data.expires_in,
      token_type: response.data.token_type
    });
  } catch (error) {
    console.error('[Auth] Direct login failed:', error.response?.data || error.message);
    
    if (error.response?.status === 401 || error.response?.data?.error === 'invalid_grant') {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Logout endpoint - revoke tokens with Keycloak
router.post('/logout', authenticate, async (req, res) => {
  const { refresh_token } = req.body;

  if (refresh_token) {
    try {
      // Revoke the refresh token with Keycloak
      await axios.post(
        `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`,
        new URLSearchParams({
          client_id: KEYCLOAK_CLIENT_ID,
          refresh_token
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );
      console.log('[Auth] Token revoked successfully');
    } catch (error) {
      console.warn('[Auth] Token revocation failed:', error.message);
      // Continue anyway - the important thing is to clear client-side tokens
    }
  }

  res.json({ message: 'Logout successful' });
});

// Validate JWT token
router.get('/validate', authenticate, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      username: req.user.username,
      roles: req.user.roles
    }
  });
});

// Get current user info
router.get('/user', authenticate, async (req, res) => {
  try {
    // Get user's granted permissions across all documents (async - Redis-backed)
    const grantedPermissions = await accessControl.getUserPermissions(req.user.id);
    
    res.json({
      id: req.user.id,
      email: req.user.email,
      username: req.user.username,
      roles: req.user.roles,
      grantedPermissions: grantedPermissions, // permissions from admin grants
      canUpload: req.user.roles.includes('admin') || grantedPermissions.includes('upload')
    });
  } catch (error) {
    console.error('[Auth] Error getting user info:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
});

// Token refresh endpoint
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  
  if (!refresh_token) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;
    
    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: KEYCLOAK_CLIENT_ID,
        refresh_token
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    console.log('[Auth] Token refreshed successfully');

    res.json({
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      id_token: response.data.id_token,
      expires_in: response.data.expires_in,
      token_type: response.data.token_type
    });
  } catch (error) {
    console.error('[Auth] Token refresh failed:', error.response?.data || error.message);
    res.status(401).json({ error: 'Token refresh failed' });
  }
});

module.exports = router;

