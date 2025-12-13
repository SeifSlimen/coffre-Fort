/**
 * Audit Routes
 * 
 * API endpoints for viewing audit logs and events.
 * Most endpoints require admin role.
 */

const express = require('express');
const router = express.Router();
const auditService = require('../services/auditService');
const { authenticate, requireRole } = require('../middleware/auth');

/**
 * GET /api/audit/logs
 * Get paginated audit logs (admin only)
 */
router.get('/logs', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const offset = parseInt(req.query.offset) || 0;
    
    const logs = await auditService.getAuditLogs(limit, offset);
    
    res.json({
      logs,
      count: logs.length,
      limit,
      offset
    });
  } catch (error) {
    console.error('[Audit API] Error fetching logs:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/audit/stats
 * Get audit statistics (admin only)
 */
router.get('/stats', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const stats = await auditService.getAuditStats();
    res.json(stats);
  } catch (error) {
    console.error('[Audit API] Error fetching stats:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/audit/users/:userId
 * Get audit logs for a specific user (admin only)
 */
router.get('/users/:userId', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const logs = await auditService.getUserAuditLogs(req.params.userId, limit);
    
    res.json({
      userId: req.params.userId,
      logs,
      count: logs.length
    });
  } catch (error) {
    console.error('[Audit API] Error fetching user logs:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/audit/documents/:documentId
 * Get audit logs for a specific document (admin or document owner)
 */
router.get('/documents/:documentId', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const logs = await auditService.getDocumentAuditLogs(req.params.documentId, limit);
    
    res.json({
      documentId: req.params.documentId,
      logs,
      count: logs.length
    });
  } catch (error) {
    console.error('[Audit API] Error fetching document logs:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/audit/documents/:documentId/mayan-events
 * Get Mayan EDMS events for a document
 */
router.get('/documents/:documentId/mayan-events', authenticate, async (req, res) => {
  try {
    const events = await auditService.getMayanDocumentEvents(req.params.documentId);
    res.json(events);
  } catch (error) {
    console.error('[Audit API] Error fetching Mayan events:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/audit/keycloak
 * Get Keycloak event console info (admin only)
 */
router.get('/keycloak', authenticate, requireRole('admin'), (req, res) => {
  const info = auditService.getKeycloakEventsInfo();
  res.json(info);
});

/**
 * GET /api/audit/my-activity
 * Get current user's own audit logs
 */
router.get('/my-activity', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const logs = await auditService.getUserAuditLogs(req.user.id, limit);
    
    res.json({
      logs,
      count: logs.length
    });
  } catch (error) {
    console.error('[Audit API] Error fetching user activity:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/audit/logs
 * Clear all audit logs (admin only, dangerous!)
 */
router.delete('/logs', authenticate, requireRole('admin'), async (req, res) => {
  try {
    // Require confirmation
    if (req.query.confirm !== 'yes') {
      return res.status(400).json({ 
        error: 'Confirmation required',
        message: 'Add ?confirm=yes to confirm deletion of all audit logs'
      });
    }
    
    // Log this action before clearing
    await auditService.log('ADMIN_ACTION', req.user.id, {
      action: 'CLEAR_AUDIT_LOGS',
      userEmail: req.user.email
    });
    
    const success = await auditService.clearAuditLogs();
    
    if (success) {
      res.json({ message: 'All audit logs cleared' });
    } else {
      res.status(500).json({ error: 'Failed to clear audit logs' });
    }
  } catch (error) {
    console.error('[Audit API] Error clearing logs:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
