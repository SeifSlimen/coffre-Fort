/**
 * Access Control Service (Redis-backed)
 * 
 * Manages time-limited access grants with granular permissions.
 * Uses Redis for persistence and automatic expiration.
 * 
 * KEY PATTERNS:
 * - grant:{userId}:{documentId} → JSON grant data with TTL
 * - user_grants:{userId} → Set of document IDs user has access to
 * 
 * WHY REDIS?
 * ----------
 * 1. PERSISTENCE: Grants survive backend restarts
 * 2. AUTO-EXPIRATION: Redis TTL handles cleanup automatically
 * 3. SCALABILITY: Works across multiple backend instances
 * 4. SPEED: ~0.1ms operations
 */

const { redis, scanKeys, mgetParsed } = require('./redisClient');

// Permission types that can be granted
const PERMISSION_TYPES = {
  VIEW: 'view',           // Can view document details
  DOWNLOAD: 'download',   // Can download the document file
  OCR: 'ocr',            // Can view OCR extracted text
  AI_SUMMARY: 'ai_summary', // Can request AI summary and keywords
  UPLOAD: 'upload'        // Can upload new documents (for special users)
};

// Key prefixes
const GRANT_PREFIX = 'grant:';
const USER_GRANTS_PREFIX = 'user_grants:';

class AccessControlService {
  constructor() {
    this.PERMISSION_TYPES = PERMISSION_TYPES;
  }

  /**
   * Generate grant key
   */
  _grantKey(userId, documentId) {
    return `${GRANT_PREFIX}${userId}:${documentId}`;
  }

  /**
   * Generate user grants set key
   */
  _userGrantsKey(userId) {
    return `${USER_GRANTS_PREFIX}${userId}`;
  }

  /**
   * Grant access to a document with specific permissions
   * @param {string} userId - Keycloak user ID
   * @param {string|number} documentId - Document ID
   * @param {Date|string} expiresAt - Expiration date
   * @param {string[]} permissions - Array of permission types
   */
  async grantAccess(userId, documentId, expiresAt, permissions = ['view']) {
    const key = this._grantKey(userId, documentId);
    const userGrantsKey = this._userGrantsKey(userId);
    
    // Validate permissions
    const validPermissions = permissions.filter(p => Object.values(PERMISSION_TYPES).includes(p));
    if (validPermissions.length === 0) {
      validPermissions.push(PERMISSION_TYPES.VIEW); // Default to view only
    }

    const expirationDate = new Date(expiresAt);
    const now = new Date();
    const ttlSeconds = Math.max(1, Math.floor((expirationDate - now) / 1000));

    const grantData = {
      userId,
      documentId: String(documentId),
      expiresAt: expirationDate.toISOString(),
      grantedAt: now.toISOString(),
      permissions: validPermissions
    };

    try {
      // Store grant with TTL (auto-expires)
      await redis.setex(key, ttlSeconds, JSON.stringify(grantData));
      
      // Add document ID to user's grant set
      await redis.sadd(userGrantsKey, String(documentId));
      // Extend TTL on the set if needed
      const currentTtl = await redis.ttl(userGrantsKey);
      if (currentTtl < ttlSeconds) {
        await redis.expire(userGrantsKey, ttlSeconds);
      }
      
      console.log(`[Access Control] Granted access to user ${userId} for document ${documentId}`);
      console.log(`[Access Control] Permissions: ${validPermissions.join(', ')}`);
      console.log(`[Access Control] Expires in ${ttlSeconds} seconds`);
      
      return true;
    } catch (error) {
      console.error(`[Access Control] Error granting access:`, error.message);
      return false;
    }
  }

  /**
   * Check if user has a specific permission for a document
   * @param {string} userId - Keycloak user ID
   * @param {string|number} documentId - Document ID
   * @param {string} permission - Permission type to check
   * @returns {Promise<boolean>}
   */
  async hasPermission(userId, documentId, permission = 'view') {
    const key = this._grantKey(userId, documentId);

    try {
      const grantJson = await redis.get(key);
      
      if (!grantJson) {
        console.log(`[Access Control] No grant found for user ${userId} document ${documentId}`);
        return false;
      }

      const grant = JSON.parse(grantJson);
      
      // Check if the specific permission is granted
      const hasPermission = grant.permissions.includes(permission);
      console.log(`[Access Control] User ${userId} ${hasPermission ? 'HAS' : 'DOES NOT HAVE'} ${permission} permission for document ${documentId}`);
      
      return hasPermission;
    } catch (error) {
      console.error(`[Access Control] Error checking permission:`, error.message);
      return false;
    }
  }

  /**
   * Check if user has basic view access (for backward compatibility)
   */
  async hasAccess(userId, documentId) {
    return this.hasPermission(userId, documentId, PERMISSION_TYPES.VIEW);
  }

  /**
   * Get all documents a user has access to (with unexpired grants)
   * @param {string} userId - Keycloak user ID
   * @returns {Promise<string[]>} Array of document IDs
   */
  async getAccessibleDocuments(userId) {
    try {
      // Get all document IDs from user's grant set
      const documentIds = await redis.smembers(this._userGrantsKey(userId));
      
      // Verify each grant still exists (hasn't expired)
      const validDocIds = [];
      for (const docId of documentIds) {
        const grantExists = await redis.exists(this._grantKey(userId, docId));
        if (grantExists) {
          validDocIds.push(docId);
        } else {
          // Clean up expired entry from set
          await redis.srem(this._userGrantsKey(userId), docId);
        }
      }
      
      console.log(`[Access Control] User ${userId} has access to documents: ${validDocIds.join(', ') || 'none'}`);
      return validDocIds;
    } catch (error) {
      console.error(`[Access Control] Error getting accessible documents:`, error.message);
      return [];
    }
  }

  /**
   * Revoke access to a document
   */
  async revokeAccess(userId, documentId) {
    const key = this._grantKey(userId, documentId);

    try {
      const deleted = await redis.del(key);
      await redis.srem(this._userGrantsKey(userId), String(documentId));
      
      if (deleted) {
        console.log(`[Access Control] Revoked access for user ${userId} to document ${documentId}`);
      }
      return deleted > 0;
    } catch (error) {
      console.error(`[Access Control] Error revoking access:`, error.message);
      return false;
    }
  }

  /**
   * Get all grants for a specific user
   */
  async getUserGrants(userId) {
    try {
      const documentIds = await this.getAccessibleDocuments(userId);
      const grants = [];
      
      for (const docId of documentIds) {
        const grantJson = await redis.get(this._grantKey(userId, docId));
        if (grantJson) {
          grants.push(JSON.parse(grantJson));
        }
      }
      
      return grants;
    } catch (error) {
      console.error(`[Access Control] Error getting user grants:`, error.message);
      return [];
    }
  }

  /**
   * Check if user has any grant with a specific permission (global check)
   */
  async hasGlobalPermission(userId, permission) {
    try {
      const grants = await this.getUserGrants(userId);
      return grants.some(grant => grant.permissions.includes(permission));
    } catch (error) {
      console.error(`[Access Control] Error checking global permission:`, error.message);
      return false;
    }
  }

  /**
   * Get all permissions a user has across all documents
   */
  async getUserPermissions(userId) {
    try {
      const grants = await this.getUserGrants(userId);
      const permissions = new Set();
      grants.forEach(grant => {
        grant.permissions.forEach(p => permissions.add(p));
      });
      return Array.from(permissions);
    } catch (error) {
      console.error(`[Access Control] Error getting user permissions:`, error.message);
      return [];
    }
  }

  /**
   * Get all active grants (admin function)
   * OPTIMIZED: Uses SCAN instead of blocking KEYS + pipeline batch fetch
   */
  async getAllGrants() {
    try {
      const keys = await scanKeys(`${GRANT_PREFIX}*`);
      if (keys.length === 0) return [];
      
      const results = await mgetParsed(keys);
      const grants = [];
      
      for (const { value } of results) {
        if (value) {
          try { grants.push(JSON.parse(value)); } catch (_) {}
        }
      }
      
      return grants;
    } catch (error) {
      console.error(`[Access Control] Error getting all grants:`, error.message);
      return [];
    }
  }

  /**
   * Get permission types
   */
  getPermissionTypes() {
    return PERMISSION_TYPES;
  }

  /**
   * Cleanup is no longer needed - Redis TTL handles expiration automatically!
   */
  cleanupExpired() {
    // No-op: Redis TTL handles expiration automatically
    console.log(`[Access Control] Cleanup not needed - Redis TTL handles expiration`);
  }

  // ============================================================================
  // ACCESS REQUEST WORKFLOW
  // ============================================================================

  /**
   * Create an access request (user wants access to a document)
   */
  async createAccessRequest(userId, userEmail, documentId, documentTitle, reason = '', permissions = ['view']) {
    const requestId = `${userId}:${documentId}:${Date.now()}`;
    const key = `access_request:${requestId}`;
    
    const requestData = {
      id: requestId,
      userId,
      userEmail,
      documentId: String(documentId),
      documentTitle,
      reason,
      permissions,
      status: 'pending', // pending, approved, rejected
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null
    };

    try {
      // Store request (expires after 30 days if not processed)
      await redis.setex(key, 60 * 60 * 24 * 30, JSON.stringify(requestData));
      
      // Add to pending requests set
      await redis.sadd('access_requests:pending', requestId);
      
      console.log(`[Access Control] Access request created: ${requestId}`);
      return requestData;
    } catch (error) {
      console.error(`[Access Control] Error creating access request:`, error.message);
      throw error;
    }
  }

  /**
   * Get all pending access requests
   */
  async getPendingRequests() {
    try {
      const requestIds = await redis.smembers('access_requests:pending');
      const requests = [];
      
      for (const requestId of requestIds) {
        const requestJson = await redis.get(`access_request:${requestId}`);
        if (requestJson) {
          const request = JSON.parse(requestJson);
          if (request.status === 'pending') {
            requests.push(request);
          } else {
            // Clean up non-pending requests from the set
            await redis.srem('access_requests:pending', requestId);
          }
        } else {
          // Request expired, remove from set
          await redis.srem('access_requests:pending', requestId);
        }
      }
      
      // Sort by creation date (newest first)
      requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      return requests;
    } catch (error) {
      console.error(`[Access Control] Error getting pending requests:`, error.message);
      return [];
    }
  }

  /**
   * Get all access requests (including processed)
   * OPTIMIZED: Uses SCAN instead of blocking KEYS + pipeline batch fetch
   */
  async getAllRequests(includeProcessed = true) {
    try {
      const keys = await scanKeys('access_request:*');
      if (keys.length === 0) return [];
      
      const results = await mgetParsed(keys);
      const requests = [];
      
      for (const { value } of results) {
        if (value) {
          try {
            const request = JSON.parse(value);
            if (includeProcessed || request.status === 'pending') {
              requests.push(request);
            }
          } catch (_) {}
        }
      }
      
      // Sort by creation date (newest first)
      requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      return requests;
    } catch (error) {
      console.error(`[Access Control] Error getting all requests:`, error.message);
      return [];
    }
  }

  /**
   * Approve an access request
   */
  async approveRequest(requestId, adminId, adminEmail, expiresAt, note = '') {
    const key = `access_request:${requestId}`;
    
    try {
      const requestJson = await redis.get(key);
      if (!requestJson) {
        throw new Error('Access request not found');
      }
      
      const request = JSON.parse(requestJson);
      
      if (request.status !== 'pending') {
        throw new Error(`Request already ${request.status}`);
      }
      
      // Grant the access
      await this.grantAccess(request.userId, request.documentId, expiresAt, request.permissions);
      
      // Update request status
      request.status = 'approved';
      request.updatedAt = new Date().toISOString();
      request.reviewedBy = adminEmail;
      request.reviewedAt = new Date().toISOString();
      request.reviewNote = note;
      request.expiresAt = expiresAt;
      
      // Store updated request
      await redis.setex(key, 60 * 60 * 24 * 30, JSON.stringify(request));
      
      // Remove from pending set
      await redis.srem('access_requests:pending', requestId);
      
      console.log(`[Access Control] Request approved: ${requestId} by ${adminEmail}`);
      return request;
    } catch (error) {
      console.error(`[Access Control] Error approving request:`, error.message);
      throw error;
    }
  }

  /**
   * Reject an access request
   */
  async rejectRequest(requestId, adminId, adminEmail, note = '') {
    const key = `access_request:${requestId}`;
    
    try {
      const requestJson = await redis.get(key);
      if (!requestJson) {
        throw new Error('Access request not found');
      }
      
      const request = JSON.parse(requestJson);
      
      if (request.status !== 'pending') {
        throw new Error(`Request already ${request.status}`);
      }
      
      // Update request status
      request.status = 'rejected';
      request.updatedAt = new Date().toISOString();
      request.reviewedBy = adminEmail;
      request.reviewedAt = new Date().toISOString();
      request.reviewNote = note;
      
      // Store updated request
      await redis.setex(key, 60 * 60 * 24 * 30, JSON.stringify(request));
      
      // Remove from pending set
      await redis.srem('access_requests:pending', requestId);
      
      console.log(`[Access Control] Request rejected: ${requestId} by ${adminEmail}`);
      return request;
    } catch (error) {
      console.error(`[Access Control] Error rejecting request:`, error.message);
      throw error;
    }
  }

  /**
   * Get requests for a specific user
   */
  async getUserRequests(userId) {
    try {
      const allRequests = await this.getAllRequests(true);
      return allRequests.filter(r => r.userId === userId);
    } catch (error) {
      console.error(`[Access Control] Error getting user requests:`, error.message);
      return [];
    }
  }

  /**
   * Get pending request for a specific user and document (for metadata-only browse)
   */
  async getPendingRequestForDocument(userId, documentId) {
    try {
      const userRequests = await this.getUserRequests(userId);
      return userRequests.find(
        r => String(r.documentId) === String(documentId) && r.status === 'pending'
      ) || null;
    } catch (error) {
      console.error(`[Access Control] Error getting pending request for document:`, error.message);
      return null;
    }
  }

  /**
   * Get pending request count (for badge display)
   */
  async getPendingRequestCount() {
    try {
      const pendingRequests = await this.getPendingRequests();
      return pendingRequests.length;
    } catch (error) {
      console.error(`[Access Control] Error getting pending count:`, error.message);
      return 0;
    }
  }

  // ============================================================================
  // BULK OPERATIONS
  // ============================================================================

  /**
   * Bulk grant access to multiple documents
   */
  async bulkGrantAccess(userId, documentIds, expiresAt, permissions = ['view']) {
    const results = [];
    
    for (const docId of documentIds) {
      try {
        const success = await this.grantAccess(userId, docId, expiresAt, permissions);
        results.push({ documentId: docId, success, error: null });
      } catch (error) {
        results.push({ documentId: docId, success: false, error: error.message });
      }
    }
    
    console.log(`[Access Control] Bulk grant: ${results.filter(r => r.success).length}/${documentIds.length} succeeded`);
    return results;
  }

  /**
   * Bulk revoke access from multiple documents
   */
  async bulkRevokeAccess(userId, documentIds) {
    const results = [];
    
    for (const docId of documentIds) {
      try {
        const success = await this.revokeAccess(userId, docId);
        results.push({ documentId: docId, success, error: null });
      } catch (error) {
        results.push({ documentId: docId, success: false, error: error.message });
      }
    }
    
    console.log(`[Access Control] Bulk revoke: ${results.filter(r => r.success).length}/${documentIds.length} succeeded`);
    return results;
  }

  // ============================================================================
  // ACCESS TEMPLATES
  // ============================================================================

  /**
   * Create an access template (reusable permission set)
   */
  async createAccessTemplate(name, permissions, defaultDurationDays = 7, description = '') {
    const key = `access_template:${name.toLowerCase().replace(/\s+/g, '_')}`;
    
    const template = {
      id: name.toLowerCase().replace(/\s+/g, '_'),
      name,
      description,
      permissions,
      defaultDurationDays,
      createdAt: new Date().toISOString()
    };
    
    try {
      await redis.set(key, JSON.stringify(template));
      console.log(`[Access Control] Template created: ${name}`);
      return template;
    } catch (error) {
      console.error(`[Access Control] Error creating template:`, error.message);
      throw error;
    }
  }

  /**
   * Get all access templates
   * OPTIMIZED: Uses SCAN instead of blocking KEYS + pipeline batch fetch
   */
  async getAccessTemplates() {
    try {
      const keys = await scanKeys('access_template:*');
      if (keys.length === 0) return [];
      
      const results = await mgetParsed(keys);
      const templates = [];
      
      for (const { value } of results) {
        if (value) {
          try { templates.push(JSON.parse(value)); } catch (_) {}
        }
      }
      
      return templates;
    } catch (error) {
      console.error(`[Access Control] Error getting templates:`, error.message);
      return [];
    }
  }

  /**
   * Delete an access template
   */
  async deleteAccessTemplate(templateId) {
    try {
      const deleted = await redis.del(`access_template:${templateId}`);
      return deleted > 0;
    } catch (error) {
      console.error(`[Access Control] Error deleting template:`, error.message);
      return false;
    }
  }

  /**
   * Apply a template to grant access
   */
  async applyTemplate(templateId, userId, documentId) {
    try {
      const templateJson = await redis.get(`access_template:${templateId}`);
      if (!templateJson) {
        throw new Error('Template not found');
      }
      
      const template = JSON.parse(templateJson);
      
      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + template.defaultDurationDays);
      
      // Grant access with template permissions
      await this.grantAccess(userId, documentId, expiresAt.toISOString(), template.permissions);
      
      console.log(`[Access Control] Template ${templateId} applied for user ${userId} document ${documentId}`);
      return true;
    } catch (error) {
      console.error(`[Access Control] Error applying template:`, error.message);
      throw error;
    }
  }
}

// Create singleton instance
const accessControlService = new AccessControlService();

module.exports = accessControlService;

