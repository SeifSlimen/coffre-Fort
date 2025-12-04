const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

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
router.get('/user', authenticate, (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    username: req.user.username,
    roles: req.user.roles
  });
});

// Logout (frontend handles Keycloak logout)
router.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Logout successful' });
});

module.exports = router;

