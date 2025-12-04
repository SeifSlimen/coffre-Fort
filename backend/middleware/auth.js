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
    const verified = jwt.verify(token, key, {
      algorithms: ['RS256'],
      issuer: `${process.env.KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`
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
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = await verifyToken(token);
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      username: decoded.preferred_username,
      roles: decoded.realm_access?.roles || []
    };

    next();
  } catch (error) {
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

