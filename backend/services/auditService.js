/**
 * Audit Service
 * 
 * Provides unified audit logging across the application:
 * - Stores audit logs in Redis (last 10,000 entries)
 * - Integrates with Mayan EDMS events API
 * - Links to Keycloak event console
 * 
 * WHY AUDIT LOGGING?
 * ------------------
 * 1. COMPLIANCE: GDPR, HIPAA, SOC2 require audit trails
 * 2. SECURITY: Track who accessed what and when
 * 3. DEBUGGING: Understand user behavior and issues
 * 4. ACCOUNTABILITY: Prove what happened in disputes
 */

const { redis } = require('./redisClient');

// Redis key for audit logs
const AUDIT_KEY = 'audit:logs';
const MAX_AUDIT_ENTRIES = 10000;

// Audit action types
const AUDIT_ACTIONS = {
  // Document actions
  DOCUMENT_VIEW: 'DOCUMENT_VIEW',
  DOCUMENT_DOWNLOAD: 'DOCUMENT_DOWNLOAD',
  DOCUMENT_UPLOAD: 'DOCUMENT_UPLOAD',
  DOCUMENT_DELETE: 'DOCUMENT_DELETE',
  
  // Access control actions
  ACCESS_GRANTED: 'ACCESS_GRANTED',
  ACCESS_REVOKED: 'ACCESS_REVOKED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  
  // Authentication actions
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  
  // AI actions
  AI_SUMMARY_GENERATED: 'AI_SUMMARY_GENERATED',
  AI_SUMMARY_CACHED: 'AI_SUMMARY_CACHED',
  
  // Admin actions
  ADMIN_ACTION: 'ADMIN_ACTION'
};

/**
 * Log an audit event
 * @param {string} action - Action type (from AUDIT_ACTIONS)
 * @param {string} userId - User ID who performed the action
 * @param {object} details - Additional details about the action
 * @returns {Promise<object>} - The logged entry
 */
async function log(action, userId, details = {}) {
  const entry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    action,
    userId,
    userEmail: details.userEmail || null,
    ...details
  };
  
  // Remove userEmail from details to avoid duplication
  delete entry.details?.userEmail;
  
  // Log to console for debugging
  console.log(`[AUDIT] ${action}`, JSON.stringify({
    userId,
    ...details
  }));
  
  try {
    // Store in Redis (LPUSH adds to head, LTRIM keeps max size)
    await redis.lpush(AUDIT_KEY, JSON.stringify(entry));
    await redis.ltrim(AUDIT_KEY, 0, MAX_AUDIT_ENTRIES - 1);
  } catch (error) {
    console.error(`[AUDIT] Error storing audit log:`, error.message);
  }
  
  return entry;
}

/**
 * Get audit logs with pagination
 * @param {number} limit - Number of entries to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<object[]>} - Array of audit entries
 */
async function getAuditLogs(limit = 100, offset = 0) {
  try {
    const logs = await redis.lrange(AUDIT_KEY, offset, offset + limit - 1);
    return logs.map(log => {
      try {
        return JSON.parse(log);
      } catch {
        return { raw: log };
      }
    });
  } catch (error) {
    console.error(`[AUDIT] Error fetching audit logs:`, error.message);
    return [];
  }
}

/**
 * Get audit logs for a specific user
 * @param {string} userId - User ID to filter by
 * @param {number} limit - Max entries to return
 * @returns {Promise<object[]>} - Array of audit entries
 */
async function getUserAuditLogs(userId, limit = 100) {
  try {
    const allLogs = await getAuditLogs(MAX_AUDIT_ENTRIES, 0);
    return allLogs
      .filter(log => log.userId === userId)
      .slice(0, limit);
  } catch (error) {
    console.error(`[AUDIT] Error fetching user audit logs:`, error.message);
    return [];
  }
}

/**
 * Get audit logs for a specific document
 * @param {string} documentId - Document ID to filter by
 * @param {number} limit - Max entries to return
 * @returns {Promise<object[]>} - Array of audit entries
 */
async function getDocumentAuditLogs(documentId, limit = 100) {
  try {
    const allLogs = await getAuditLogs(MAX_AUDIT_ENTRIES, 0);
    return allLogs
      .filter(log => log.documentId === documentId || log.documentId === String(documentId))
      .slice(0, limit);
  } catch (error) {
    console.error(`[AUDIT] Error fetching document audit logs:`, error.message);
    return [];
  }
}

/**
 * Get Mayan document events (from Mayan's built-in audit)
 * @param {string} documentId - Document ID
 * @returns {Promise<object>} - Mayan events response
 */
async function getMayanDocumentEvents(documentId) {
  // Import here to avoid circular dependency
  const mayanService = require('./mayanService');
  
  try {
    const events = await mayanService.makeRequest('get', `/api/v4/documents/${documentId}/events/`);
    return events;
  } catch (error) {
    console.error(`[AUDIT] Error fetching Mayan events:`, error.message);
    return { results: [], error: error.message };
  }
}

/**
 * Get Keycloak event console URL and info
 * @returns {object} - Keycloak event info
 */
function getKeycloakEventsInfo() {
  const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
  const realm = process.env.KEYCLOAK_REALM || 'coffre-fort';
  
  return {
    message: 'View authentication events in Keycloak Admin Console',
    consoleUrl: `${keycloakUrl}/admin/master/console/#/${realm}/events`,
    loginEventsUrl: `${keycloakUrl}/admin/master/console/#/${realm}/events/login-events`,
    adminEventsUrl: `${keycloakUrl}/admin/master/console/#/${realm}/events/admin-events`,
    instructions: [
      '1. Log in to Keycloak Admin Console',
      '2. Select the "coffre-fort" realm',
      '3. Go to Events → Login Events or Admin Events',
      '4. Configure event types and retention as needed'
    ]
  };
}

/**
 * Get audit statistics
 * @returns {Promise<object>} - Audit statistics
 */
async function getAuditStats() {
  try {
    const totalLogs = await redis.llen(AUDIT_KEY);
    const recentLogs = await getAuditLogs(100, 0);
    
    // Count by action type
    const actionCounts = {};
    for (const log of recentLogs) {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    }
    
    return {
      totalEntries: totalLogs,
      maxEntries: MAX_AUDIT_ENTRIES,
      recentActionCounts: actionCounts,
      oldestEntry: recentLogs[recentLogs.length - 1]?.timestamp || null,
      newestEntry: recentLogs[0]?.timestamp || null
    };
  } catch (error) {
    console.error(`[AUDIT] Error getting audit stats:`, error.message);
    return { error: error.message };
  }
}

/**
 * Clear all audit logs (admin only, use with caution!)
 * @returns {Promise<boolean>} - Success status
 */
async function clearAuditLogs() {
  try {
    await redis.del(AUDIT_KEY);
    console.log('[AUDIT] All audit logs cleared');
    return true;
  } catch (error) {
    console.error(`[AUDIT] Error clearing audit logs:`, error.message);
    return false;
  }
}

module.exports = {
  log,
  getAuditLogs,
  getUserAuditLogs,
  getDocumentAuditLogs,
  getMayanDocumentEvents,
  getKeycloakEventsInfo,
  getAuditStats,
  clearAuditLogs,
  AUDIT_ACTIONS
};
