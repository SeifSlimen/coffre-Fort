const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const accessControl = require('../services/accessControl');

// All admin routes require admin role
router.use(authenticate);
router.use(requireRole('admin'));

// List all users (placeholder - in production, fetch from Keycloak)
router.get('/users', async (req, res) => {
  // This would typically fetch users from Keycloak Admin API
  // For hackathon, return mock data or implement basic Keycloak admin client
  res.json({
    users: [
      { id: 'user1', email: 'admin@test.com', roles: ['admin', 'user'] },
      { id: 'user2', email: 'user@test.com', roles: ['user'] }
    ],
    message: 'User list (Keycloak integration pending)'
  });
});

// Grant time-limited access to a document
router.post('/access', async (req, res, next) => {
  try {
    const { userId, documentId, expiresAt } = req.body;

    if (!userId || !documentId || !expiresAt) {
      return res.status(400).json({
        error: 'userId, documentId, and expiresAt are required'
      });
    }

    const expiryDate = new Date(expiresAt);
    if (isNaN(expiryDate.getTime())) {
      return res.status(400).json({ error: 'Invalid expiresAt date format' });
    }

    if (expiryDate <= new Date()) {
      return res.status(400).json({ error: 'expiresAt must be in the future' });
    }

    accessControl.grantAccess(userId, documentId, expiresAt);

    res.json({
      message: 'Access granted successfully',
      userId,
      documentId,
      expiresAt: expiryDate.toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// Revoke access
router.delete('/access/:userId/:documentId', async (req, res) => {
  const { userId, documentId } = req.params;
  accessControl.revokeAccess(userId, documentId);
  res.json({ message: 'Access revoked successfully' });
});

module.exports = router;

