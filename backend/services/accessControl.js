// In-memory store for time-limited access (in production, use Redis or database)
const accessGrants = new Map();

class AccessControlService {
  grantAccess(userId, documentId, expiresAt) {
    const key = `${userId}_${documentId}`;
    accessGrants.set(key, {
      userId,
      documentId,
      expiresAt: new Date(expiresAt),
      grantedAt: new Date()
    });
  }

  hasAccess(userId, documentId) {
    const key = `${userId}_${documentId}`;
    const grant = accessGrants.get(key);

    if (!grant) {
      return false;
    }

    // Check if access has expired
    if (new Date() > grant.expiresAt) {
      accessGrants.delete(key);
      return false;
    }

    return true;
  }

  revokeAccess(userId, documentId) {
    const key = `${userId}_${documentId}`;
    accessGrants.delete(key);
  }

  getUserGrants(userId) {
    const grants = [];
    for (const [key, grant] of accessGrants.entries()) {
      if (grant.userId === userId && new Date() <= grant.expiresAt) {
        grants.push(grant);
      }
    }
    return grants;
  }

  cleanupExpired() {
    const now = new Date();
    for (const [key, grant] of accessGrants.entries()) {
      if (now > grant.expiresAt) {
        accessGrants.delete(key);
      }
    }
  }
}

// Cleanup expired grants every hour
setInterval(() => {
  new AccessControlService().cleanupExpired();
}, 3600000);

module.exports = new AccessControlService();

