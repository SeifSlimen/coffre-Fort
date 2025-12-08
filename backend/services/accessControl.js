// In-memory store for time-limited access (in production, use Redis or database)
const accessGrants = new Map();

// Permission types that can be granted
const PERMISSION_TYPES = {
  VIEW: 'view',           // Can view document details
  DOWNLOAD: 'download',   // Can download the document file
  OCR: 'ocr',            // Can view OCR extracted text
  AI_SUMMARY: 'ai_summary', // Can request AI summary and keywords
  UPLOAD: 'upload'        // Can upload new documents (for special users)
};

class AccessControlService {
  constructor() {
    this.PERMISSION_TYPES = PERMISSION_TYPES;
  }

  /**
   * Grant access to a document with specific permissions
   * @param {string} userId - Keycloak user ID
   * @param {string|number} documentId - Document ID
   * @param {Date|string} expiresAt - Expiration date
   * @param {string[]} permissions - Array of permission types (view, download, ocr, ai_summary)
   */
  grantAccess(userId, documentId, expiresAt, permissions = ['view']) {
    const key = `${userId}_${documentId}`;
    
    // Validate permissions
    const validPermissions = permissions.filter(p => Object.values(PERMISSION_TYPES).includes(p));
    if (validPermissions.length === 0) {
      validPermissions.push(PERMISSION_TYPES.VIEW); // Default to view only
    }

    accessGrants.set(key, {
      userId,
      documentId: String(documentId),
      expiresAt: new Date(expiresAt),
      grantedAt: new Date(),
      permissions: validPermissions
    });
    
    console.log(`[Access Control] Granted access to user ${userId} for document ${documentId}`);
    console.log(`[Access Control] Permissions: ${validPermissions.join(', ')}`);
    console.log(`[Access Control] Expires: ${expiresAt}`);
  }

  /**
   * Check if user has a specific permission for a document
   * @param {string} userId - Keycloak user ID
   * @param {string|number} documentId - Document ID
   * @param {string} permission - Permission type to check
   * @returns {boolean}
   */
  hasPermission(userId, documentId, permission = 'view') {
    const key = `${userId}_${documentId}`;
    const grant = accessGrants.get(key);

    if (!grant) {
      console.log(`[Access Control] No grant found for user ${userId} document ${documentId}`);
      return false;
    }

    // Check if access has expired
    const now = new Date();
    if (now > grant.expiresAt) {
      console.log(`[Access Control] Grant expired for user ${userId} document ${documentId}`);
      console.log(`[Access Control] Expired at: ${grant.expiresAt}, Current time: ${now}`);
      accessGrants.delete(key);
      return false;
    }

    // Check if the specific permission is granted
    const hasPermission = grant.permissions.includes(permission);
    console.log(`[Access Control] User ${userId} ${hasPermission ? 'HAS' : 'DOES NOT HAVE'} ${permission} permission for document ${documentId}`);
    
    return hasPermission;
  }

  /**
   * Check if user has basic view access (for backward compatibility)
   */
  hasAccess(userId, documentId) {
    return this.hasPermission(userId, documentId, PERMISSION_TYPES.VIEW);
  }

  /**
   * Get all documents a user has access to (with unexpired grants)
   * @param {string} userId - Keycloak user ID
   * @returns {string[]} Array of document IDs
   */
  getAccessibleDocuments(userId) {
    const documentIds = [];
    const now = new Date();
    
    console.log(`[Access Control] Checking access for user ${userId} at ${now.toISOString()}`);
    
    for (const [key, grant] of accessGrants.entries()) {
      if (grant.userId === userId) {
        const expiresAt = grant.expiresAt;
        const isExpired = now > expiresAt;
        
        console.log(`[Access Control] Grant for doc ${grant.documentId}: expires ${expiresAt.toISOString()}, expired: ${isExpired}`);
        
        if (!isExpired) {
          documentIds.push(grant.documentId);
        } else {
          // Clean up expired grant
          console.log(`[Access Control] Removing expired grant for doc ${grant.documentId}`);
          accessGrants.delete(key);
        }
      }
    }
    
    console.log(`[Access Control] User ${userId} has access to documents: ${documentIds.join(', ') || 'none'}`);
    return documentIds;
  }

  revokeAccess(userId, documentId) {
    const key = `${userId}_${documentId}`;
    const deleted = accessGrants.delete(key);
    if (deleted) {
      console.log(`[Access Control] Revoked access for user ${userId} to document ${documentId}`);
    }
    return deleted;
  }

  getUserGrants(userId) {
    const grants = [];
    const now = new Date();
    for (const [key, grant] of accessGrants.entries()) {
      if (grant.userId === userId && now <= grant.expiresAt) {
        grants.push({
          ...grant,
          expiresAt: grant.expiresAt.toISOString(),
          grantedAt: grant.grantedAt.toISOString()
        });
      }
    }
    return grants;
  }

  /**
   * Check if user has any grant with a specific permission (global check)
   * Useful for checking if user can upload anywhere
   * @param {string} userId 
   * @param {string} permission 
   * @returns {boolean}
   */
  hasGlobalPermission(userId, permission) {
    const now = new Date();
    for (const [key, grant] of accessGrants.entries()) {
      if (grant.userId === userId && now <= grant.expiresAt) {
        if (grant.permissions.includes(permission)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get all permissions a user has across all documents
   * @param {string} userId 
   * @returns {string[]}
   */
  getUserPermissions(userId) {
    const permissions = new Set();
    const now = new Date();
    for (const [key, grant] of accessGrants.entries()) {
      if (grant.userId === userId && now <= grant.expiresAt) {
        grant.permissions.forEach(p => permissions.add(p));
      }
    }
    return Array.from(permissions);
  }

  getAllGrants() {
    const grants = [];
    const now = new Date();
    for (const [key, grant] of accessGrants.entries()) {
      if (now <= grant.expiresAt) {
        grants.push({
          userId: grant.userId,
          documentId: grant.documentId,
          permissions: grant.permissions,
          expiresAt: grant.expiresAt.toISOString(),
          grantedAt: grant.grantedAt.toISOString()
        });
      }
    }
    return grants;
  }

  cleanupExpired() {
    const now = new Date();
    let cleaned = 0;
    for (const [key, grant] of accessGrants.entries()) {
      if (now > grant.expiresAt) {
        accessGrants.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[Access Control] Cleaned up ${cleaned} expired grants`);
    }
  }

  getPermissionTypes() {
    return PERMISSION_TYPES;
  }
}

// Create singleton instance
const accessControlService = new AccessControlService();

// Cleanup expired grants every minute (more frequent for testing)
setInterval(() => {
  accessControlService.cleanupExpired();
}, 60000);

module.exports = accessControlService;

