const jwt = require('jsonwebtoken');
const { getKey, KEYCLOAK_REALM } = require('../config/keycloak');

// In-memory cache for public keys
const keyCache = {};

function getKeyPromise(header) {
  return new Promise((resolve, reject) => {
    const { getKey } = require('../config/keycloak');
    getKey(header, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

async function verifyToken(token) {
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header || !decoded.header.kid) {
      throw new Error('Invalid token format');
    }

    const key = await getKeyPromise(decoded.header);

    // Accept both localhost (browser) and keycloak (internal) issuers
    const validIssuers = [
      `${process.env.KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
      `http://localhost:8080/realms/${KEYCLOAK_REALM}`,
      `http://127.0.0.1:8080/realms/${KEYCLOAK_REALM}`,
      `http://localhost:8081/realms/${KEYCLOAK_REALM}`,
      `http://127.0.0.1:8081/realms/${KEYCLOAK_REALM}`
    ];

    const verified = jwt.verify(token, key, {
      algorithms: ['RS256'],
      issuer: validIssuers
    });

    return verified;
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

async function authenticate(req, res, next) {
  try {
    console.log('[AUTH] Authenticating request to:', req.path);

    const token = extractToken(req);
    if (!token) {
      console.log('[AUTH] No token found in request');
      return res.status(401).json({ error: 'No token provided' });
    }

    console.log('[AUTH] Token found:', token.substring(0, 50) + '...');
    console.log('[AUTH] Verifying token...');

    const decoded = await verifyToken(token);
    console.log('[AUTH] Token verified successfully. User:', decoded.email);

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      username: decoded.preferred_username,
      roles: decoded.realm_access?.roles || []
    };

    next();
  } catch (error) {
    console.error('[AUTH] Token verification failed:', error.message);
    console.error('[AUTH] Error stack:', error.stack);
    return res.status(401).json({ error: 'Invalid or expired token', details: error.message });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRoles = req.user.roles || [];
    const hasRole = allowedRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

module.exports = {
  authenticate,
  requireRole
};

