const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const accessControl = require('../services/accessControl');
const keycloakAdmin = require('../services/keycloakAdmin');
const mayanUserService = require('../services/mayanUserService');

// All admin routes require admin role
router.use(authenticate);
router.use(requireRole('admin'));

// Get available permission types
router.get('/permission-types', async (req, res) => {
  res.json({
    permissions: [
      { id: 'view', name: 'View Document', description: 'Can view document details' },
      { id: 'download', name: 'Download', description: 'Can download the document file' },
      { id: 'ocr', name: 'OCR Text', description: 'Can view extracted OCR text' },
      { id: 'ai_summary', name: 'AI Summary', description: 'Can request AI-generated summary and keywords' },
      { id: 'upload', name: 'Upload Documents', description: 'Can upload new documents to the system' }
    ]
  });
});

// List all users from Keycloak
router.get('/users', async (req, res, next) => {
  try {
    const users = await keycloakAdmin.getUsers();
    res.json({ users });
  } catch (error) {
    console.error('[Admin] Failed to fetch users:', error.message);
    // Fallback to empty array if Keycloak admin API fails
    res.json({ 
      users: [],
      error: 'Could not fetch users from Keycloak. Make sure Keycloak is running and admin credentials are correct.'
    });
  }
});

// Create a new user
router.post('/users', async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Validate role
    const validRoles = ['admin', 'user'];
    const userRole = validRoles.includes(role) ? role : 'user';

    // Create user in Keycloak
    const keycloakUser = await keycloakAdmin.createUser({
      email,
      username: email,
      password,
      firstName: firstName || '',
      lastName: lastName || '',
      role: userRole
    });

    // Sync user to Mayan EDMS
    try {
      await mayanUserService.syncUserToMayan({
        id: keycloakUser.id,
        email,
        username: email,
        firstName: firstName || '',
        lastName: lastName || ''
      });
      console.log('[Admin] User synced to Mayan:', email);
    } catch (mayanError) {
      console.warn('[Admin] Failed to sync user to Mayan:', mayanError.message);
      // Don't fail the request - Keycloak user is created
    }

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: keycloakUser.id,
        email,
        username: email,
        firstName,
        lastName,
        role: userRole
      }
    });
  } catch (error) {
    console.error('[Admin] Failed to create user:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Update a user
router.put('/users/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, email, password, enabled } = req.body;

    await keycloakAdmin.updateUser(userId, {
      firstName,
      lastName,
      email,
      password,
      enabled
    });

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('[Admin] Failed to update user:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Delete a user
router.delete('/users/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    await keycloakAdmin.deleteUser(userId);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('[Admin] Failed to delete user:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Get available roles
router.get('/roles', async (req, res, next) => {
  try {
    const roles = await keycloakAdmin.getAvailableRoles();
    // Filter to only our custom roles
    const appRoles = roles.filter(r => ['admin', 'user'].includes(r.name));
    res.json({ roles: appRoles });
  } catch (error) {
    console.error('[Admin] Failed to fetch roles:', error.message);
    res.json({ roles: [] });
  }
});

// Get all active access grants
router.get('/access-grants', async (req, res, next) => {
  try {
    const grants = accessControl.getAllGrants();
    
    // Enrich grants with user information
    const enrichedGrants = await Promise.all(
      grants.map(async (grant) => {
        try {
          const user = await keycloakAdmin.getUserById(grant.userId);
          return {
            ...grant,
            userEmail: user.email,
            username: user.username
          };
        } catch (error) {
          return {
            ...grant,
            userEmail: 'Unknown',
            username: 'Unknown'
          };
        }
      })
    );

    res.json({ grants: enrichedGrants });
  } catch (error) {
    next(error);
  }
});

// Grant time-limited access to a document with specific permissions
router.post('/access', async (req, res, next) => {
  try {
    const { userId, documentId, expiresAt, permissions } = req.body;

    if (!userId || !documentId || !expiresAt) {
      return res.status(400).json({
        error: 'userId, documentId, and expiresAt are required'
      });
    }

    // Verify user exists in Keycloak
    try {
      await keycloakAdmin.getUserById(userId);
    } catch (error) {
      return res.status(404).json({ error: 'User not found in Keycloak' });
    }

    const expiryDate = new Date(expiresAt);
    if (isNaN(expiryDate.getTime())) {
      return res.status(400).json({ error: 'Invalid expiresAt date format' });
    }

    if (expiryDate <= new Date()) {
      return res.status(400).json({ error: 'expiresAt must be in the future' });
    }

    // Default to view-only if no permissions specified
    const grantPermissions = permissions && permissions.length > 0 
      ? permissions 
      : ['view'];

    accessControl.grantAccess(userId, documentId, expiresAt, grantPermissions);

    res.json({
      message: 'Access granted successfully',
      userId,
      documentId,
      permissions: grantPermissions,
      expiresAt: expiryDate.toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// Revoke access
router.delete('/access/:userId/:documentId', async (req, res, next) => {
  try {
    const { userId, documentId } = req.params;
    accessControl.revokeAccess(userId, documentId);
    res.json({ message: 'Access revoked successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

