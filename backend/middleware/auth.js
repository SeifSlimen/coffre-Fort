const jwt = require('jsonwebtoken');
const { getKey, KEYCLOAK_REALM } = require('../config/keycloak');

function getKeyPromise(header) {
  return new Promise((resolve, reject) => {
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
    const issuerFromEnv = process.env.KEYCLOAK_URL
      ? `${process.env.KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`
      : null;

    const validIssuers = [
      issuerFromEnv,
      `http://localhost:8080/realms/${KEYCLOAK_REALM}`,
      `http://127.0.0.1:8080/realms/${KEYCLOAK_REALM}`,
      `http://localhost:8081/realms/${KEYCLOAK_REALM}`,
      `http://127.0.0.1:8081/realms/${KEYCLOAK_REALM}`
    ].filter(Boolean);

    const verified = jwt.verify(token, key, {
      algorithms: ['RS256'],
      issuer: validIssuers
    });

    return verified;
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

function _firstQueryValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function extractTokenWithSource(req) {
  // Support query param tokens for iframe/img requests (e.g. /documents/:id/preview?token=...)
  // Browsers do not send custom Authorization headers for <iframe>/<img>.
  const queryTokenRaw =
    _firstQueryValue(req.query?.token) ??
    _firstQueryValue(req.query?.access_token) ??
    _firstQueryValue(req.query?.accessToken) ??
    _firstQueryValue(req.query?.jwt);

  if (typeof queryTokenRaw === 'string' && queryTokenRaw.trim()) {
    return { token: queryTokenRaw.trim(), source: 'query' };
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]?.trim()) {
      return { token: match[1].trim(), source: 'authorization' };
    }
  }

  const xAccessToken = req.headers['x-access-token'];
  if (typeof xAccessToken === 'string' && xAccessToken.trim()) {
    return { token: xAccessToken.trim(), source: 'x-access-token' };
  }

  return { token: null, source: null };
}

async function authenticate(req, res, next) {
  try {
    const { token, source } = extractTokenWithSource(req);
    if (!token) {
      const debug = process.env.NODE_ENV === 'development'
        ? {
            method: req.method,
            path: req.path,
            originalUrl: req.originalUrl,
            queryKeys: Object.keys(req.query || {}),
            hasAuthHeader: !!(req.headers.authorization || req.headers.Authorization),
            hasReferer: !!req.headers.referer,
            hasOrigin: !!req.headers.origin
          }
        : undefined;

      return res.status(401).json({
        error: 'No token provided',
        ...(debug ? { debug } : {})
      });
    }

    const decoded = await verifyToken(token);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[AUTH] Token verified via ${source || 'unknown'} for user: ${decoded.email || decoded.preferred_username || decoded.sub}`);
    }

    // Set user info from JWT
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      username: decoded.preferred_username,
      roles: decoded.realm_access?.roles || []
    };

    // Set userContext for Mayan per-user authentication (True SSO)
    // This is passed to mayanService for per-user API tokens
    req.userContext = {
      userId: decoded.sub,
      email: decoded.email,
      username: decoded.preferred_username,
      roles: decoded.realm_access?.roles || [],
      firstName: decoded.given_name || '',
      lastName: decoded.family_name || ''
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

