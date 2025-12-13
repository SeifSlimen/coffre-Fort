const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const accessControl = require('../services/accessControl');
const keycloakAdmin = require('../services/keycloakAdmin');
const mayanUserService = require('../services/mayanUserService');
const cacheService = require('../services/cacheService');
const { redis, scanKeys } = require('../services/redisClient');
const mayanService = require('../services/mayanService');
const os = require('os');
const { execSync } = require('child_process');

// All admin routes require admin role
router.use(authenticate);
router.use(requireRole('admin'));

// ============================================================================
// MAYAN ACL SYNC (FORCE RUN)
// ============================================================================

router.post('/acl-sync/trigger', async (req, res) => {
  try {
    const result = await mayanService.makeRequest(
      'post',
      '/api/custom/acl-sync/',
      null,
      { Authorization: mayanService.getAdminAuth() },
      null
    );

    res.json({ ok: true, mayan: result });
  } catch (error) {
    console.error('[Admin] ACL sync trigger failed:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

function getDiskUsage() {
  try {
    // Cross-platform disk usage check
    if (process.platform === 'win32') {
      // Windows - check C: drive (or mount point)
      const result = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
      const lines = result.trim().split('\n').slice(1);
      let totalDisk = 0;
      let freeDisk = 0;
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          freeDisk += parseInt(parts[1]) || 0;
          totalDisk += parseInt(parts[2]) || 0;
        }
      }
      return { total: totalDisk, free: freeDisk, used: totalDisk - freeDisk };
    } else {
      // Linux/Mac - df command
      const result = execSync("df -k / | tail -1 | awk '{print $2, $3, $4}'", { encoding: 'utf8' });
      const [total, used, free] = result.trim().split(/\s+/).map(n => parseInt(n) * 1024);
      return { total, free, used };
    }
  } catch (error) {
    console.error('[Admin] Disk usage check failed:', error.message);
    return { total: 0, free: 0, used: 0 };
  }
}

// ============================================================================
// STORAGE STATS ENDPOINT
// ============================================================================

router.get('/storage-stats', async (req, res) => {
  try {
    // 1. Get total document count from Mayan
    const docsResponse = await mayanService.makeRequest('get', '/api/v4/documents/?page_size=1', null, {}, req.userContext);
    const totalDocuments = docsResponse.count || 0;
    
    // 2. Get document types with counts
    const docTypesResponse = await mayanService.getDocumentTypes(req.userContext);
    const documentTypes = docTypesResponse.results || [];
    
    // 3. Get recent documents with file sizes (sample for stats)
    const recentDocsResponse = await mayanService.makeRequest(
      'get', 
      '/api/v4/documents/?page_size=100&ordering=-datetime_created', 
      null, {}, req.userContext
    );
    const recentDocs = recentDocsResponse.results || [];
    
    // 4. Calculate storage by document type
    let totalStorageBytes = 0;
    const typeStats = {};
    const fileTypes = {};
    let processedDocs = 0;
    let pendingOcrDocs = 0;
    
    for (const doc of recentDocs) {
      const fileSize = doc.file_latest?.size || 0;
      totalStorageBytes += fileSize;
      
      // Track by document type
      const typeLabel = doc.document_type?.label || 'Unknown';
      if (!typeStats[typeLabel]) {
        typeStats[typeLabel] = { count: 0, size: 0, typeId: doc.document_type?.id };
      }
      typeStats[typeLabel].count++;
      typeStats[typeLabel].size += fileSize;
      
      // Track by file extension
      const filename = doc.file_latest?.filename || doc.label || '';
      const ext = filename.split('.').pop()?.toLowerCase() || 'unknown';
      if (!fileTypes[ext]) {
        fileTypes[ext] = { count: 0, size: 0 };
      }
      fileTypes[ext].count++;
      fileTypes[ext].size += fileSize;
      
      // OCR status estimation
      if (doc.pages_count && doc.pages_count > 0) {
        processedDocs++;
      } else {
        pendingOcrDocs++;
      }
    }
    
    // 5. Estimate total storage (extrapolate if we have more docs than sample)
    const sampleSize = recentDocs.length;
    let estimatedTotalStorage = totalStorageBytes;
    if (sampleSize > 0 && totalDocuments > sampleSize) {
      const avgFileSize = totalStorageBytes / sampleSize;
      estimatedTotalStorage = avgFileSize * totalDocuments;
    }
    
    // 6. Get disk usage
    const diskUsage = getDiskUsage();
    
    // 7. Get Redis memory usage
    const redisInfo = await redis.info('memory');
    const usedMemoryMatch = redisInfo.match(/used_memory:(\d+)/);
    const redisMemoryBytes = usedMemoryMatch ? parseInt(usedMemoryMatch[1]) : 0;
    
    // 8. Get cache stats (using non-blocking SCAN)
    const cacheKeys = await scanKeys('cache:*');
    
    // 9. Compile storage stats
    res.json({
      success: true,
      storage: {
        documents: {
          total: totalDocuments,
          sampled: sampleSize,
          estimatedStorageBytes: Math.round(estimatedTotalStorage),
          estimatedStorageFormatted: formatBytes(Math.round(estimatedTotalStorage)),
          actualSampledBytes: totalStorageBytes,
          actualSampledFormatted: formatBytes(totalStorageBytes)
        },
        disk: {
          totalBytes: diskUsage.total,
          usedBytes: diskUsage.used,
          freeBytes: diskUsage.free,
          totalFormatted: formatBytes(diskUsage.total),
          usedFormatted: formatBytes(diskUsage.used),
          freeFormatted: formatBytes(diskUsage.free),
          usedPercent: diskUsage.total > 0 ? Math.round((diskUsage.used / diskUsage.total) * 100) : 0
        },
        cache: {
          redisMemoryBytes: redisMemoryBytes,
          redisMemoryFormatted: formatBytes(redisMemoryBytes),
          cacheKeyCount: cacheKeys.length
        }
      },
      documentTypes: Object.entries(typeStats).map(([label, stats]) => ({
        id: stats.typeId,
        label,
        documentCount: stats.count,
        storageBytes: stats.size,
        storageFormatted: formatBytes(stats.size),
        percent: totalStorageBytes > 0 ? Math.round((stats.size / totalStorageBytes) * 100) : 0
      })).sort((a, b) => b.storageBytes - a.storageBytes),
      fileTypes: Object.entries(fileTypes).map(([ext, stats]) => ({
        extension: ext.toUpperCase(),
        count: stats.count,
        storageBytes: stats.size,
        storageFormatted: formatBytes(stats.size),
        percent: totalStorageBytes > 0 ? Math.round((stats.size / totalStorageBytes) * 100) : 0
      })).sort((a, b) => b.storageBytes - a.storageBytes),
      ocr: {
        processed: processedDocs,
        pending: pendingOcrDocs,
        processedPercent: sampleSize > 0 ? Math.round((processedDocs / sampleSize) * 100) : 0
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        uptime: Math.round(process.uptime()),
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
          totalFormatted: formatBytes(os.totalmem()),
          freeFormatted: formatBytes(os.freemem()),
          usedFormatted: formatBytes(os.totalmem() - os.freemem()),
          usedPercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
        }
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Admin] Storage stats error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CACHE MANAGEMENT ENDPOINTS
// ============================================================================


// Get cache statistics
router.get('/cache-stats', async (req, res) => {
  try {
    // Get all cache keys (using non-blocking SCAN)
    const allKeys = await scanKeys('cache:*');
    
    // Get TTL for each key and categorize
    const keyDetails = await Promise.all(allKeys.map(async (key) => {
      const ttl = await redis.ttl(key);
      const parts = key.split(':');
      return { 
        key, 
        ttl, 
        type: parts[1] || 'unknown',
        subtype: parts[2] || null
      };
    }));

    // Categorize by type
    const cacheTypes = {
      documents: keyDetails.filter(k => k.type === 'documents').length,
      document: keyDetails.filter(k => k.type === 'document').length,
      ocr: keyDetails.filter(k => k.type === 'ocr').length,
      ai: keyDetails.filter(k => k.type === 'ai').length
    };

    // Get memory stats
    const stats = await cacheService.getStats();

    res.json({
      success: true,
      totalKeys: allKeys.length,
      cacheTypes,
      keys: keyDetails.slice(0, 100), // Limit to 100 keys for display
      memoryInfo: stats.memoryInfo,
      ttlConfig: cacheService.CACHE_TTL
    });
  } catch (error) {
    console.error('[Admin] Cache stats error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get detailed cache keys with TTL and size estimates
router.get('/cache/keys', async (req, res) => {
  try {
    const { pattern = 'cache:*', limit = 100 } = req.query;
    
    // Validate pattern for safety (prevent scanning all keys)
    if (!pattern.startsWith('cache:')) {
      return res.status(400).json({ error: 'Pattern must start with cache:' });
    }
    
    // Use non-blocking SCAN instead of KEYS
    const allKeys = await scanKeys(pattern);
    const limitedKeys = allKeys.slice(0, parseInt(limit));
    
    // Get detailed info for each key
    const keyDetails = await Promise.all(limitedKeys.map(async (key) => {
      const ttl = await redis.ttl(key);
      const type = await redis.type(key);
      let sizeEstimate = 0;
      
      try {
        if (type === 'string') {
          const val = await redis.get(key);
          sizeEstimate = val ? Buffer.byteLength(val, 'utf8') : 0;
        }
      } catch (e) {
        // Ignore size errors
      }
      
      const parts = key.split(':');
      return { 
        key, 
        ttl,
        ttlFormatted: ttl < 0 ? 'No expiry' : ttl < 60 ? `${ttl}s` : ttl < 3600 ? `${Math.floor(ttl/60)}m` : `${Math.floor(ttl/3600)}h`,
        type,
        namespace: parts[1] || 'unknown',
        subkey: parts.slice(2).join(':') || null,
        sizeBytes: sizeEstimate,
        sizeFormatted: sizeEstimate > 1024 ? `${(sizeEstimate/1024).toFixed(1)}KB` : `${sizeEstimate}B`
      };
    }));

    // Group by namespace
    const namespaces = {};
    keyDetails.forEach(k => {
      if (!namespaces[k.namespace]) {
        namespaces[k.namespace] = { count: 0, totalSize: 0, keys: [] };
      }
      namespaces[k.namespace].count++;
      namespaces[k.namespace].totalSize += k.sizeBytes;
      namespaces[k.namespace].keys.push(k);
    });

    res.json({
      success: true,
      totalMatched: allKeys.length,
      returned: keyDetails.length,
      pattern,
      keys: keyDetails,
      namespaces: Object.entries(namespaces).map(([name, data]) => ({
        name,
        count: data.count,
        totalSizeBytes: data.totalSize,
        totalSizeFormatted: data.totalSize > 1024 ? `${(data.totalSize/1024).toFixed(1)}KB` : `${data.totalSize}B`
      }))
    });
  } catch (error) {
    console.error('[Admin] Cache keys error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Delete specific cache key
router.delete('/cache/key/:key(*)', async (req, res) => {
  try {
    const { key } = req.params;
    
    // Safety: only allow deleting cache keys
    if (!key.startsWith('cache:')) {
      return res.status(400).json({ error: 'Can only delete keys starting with cache:' });
    }
    
    const exists = await redis.exists(key);
    if (!exists) {
      return res.status(404).json({ error: 'Key not found' });
    }
    
    await redis.del(key);
    console.log(`[Admin] Deleted cache key: ${key}`);
    
    res.json({ success: true, message: `Deleted key: ${key}` });
  } catch (error) {
    console.error('[Admin] Delete key error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Delete keys by pattern (with safety limits)
router.post('/cache/delete-pattern', async (req, res) => {
  try {
    const { pattern } = req.body;
    
    if (!pattern || !pattern.startsWith('cache:')) {
      return res.status(400).json({ error: 'Pattern must start with cache:' });
    }
    
    // Don't allow wildcard-only patterns
    if (pattern === 'cache:*') {
      return res.status(400).json({ error: 'Use /cache/clear endpoint to clear all cache' });
    }
    
    // Use non-blocking SCAN instead of KEYS
    const keys = await scanKeys(pattern);
    const maxDelete = 1000;
    
    if (keys.length > maxDelete) {
      return res.status(400).json({ 
        error: `Pattern matches ${keys.length} keys, max ${maxDelete} allowed. Use a more specific pattern.` 
      });
    }
    
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    
    console.log(`[Admin] Deleted ${keys.length} keys matching pattern: ${pattern}`);
    
    res.json({ 
      success: true, 
      message: `Deleted ${keys.length} keys matching pattern: ${pattern}`,
      deletedCount: keys.length
    });
  } catch (error) {
    console.error('[Admin] Delete pattern error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Clear all cache
router.post('/cache/clear', async (req, res) => {
  try {
    await cacheService.invalidatePattern('cache:*');
    res.json({ 
      success: true, 
      message: 'All cache cleared successfully' 
    });
  } catch (error) {
    console.error('[Admin] Cache clear error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Clear specific cache type
router.post('/cache/clear/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const validTypes = ['documents', 'document', 'ocr', 'ai'];
    
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid cache type. Valid types: ${validTypes.join(', ')}` });
    }
    
    await cacheService.invalidatePattern(`cache:${type}:*`);
    res.json({ 
      success: true, 
      message: `Cache type '${type}' cleared successfully` 
    });
  } catch (error) {
    console.error('[Admin] Cache clear type error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PERMISSION TYPES
// ============================================================================

// Get available permission types
router.get('/permission-types', async (req, res) => {
  res.json({
    permissions: [
      { id: 'view', name: 'View Document', description: 'Can view document details' },
      { id: 'download', name: 'Download', description: 'Can download the document file' },
      { id: 'ocr', name: 'OCR Text', description: 'Can view extracted OCR text' },
      { id: 'ai_summary', name: 'AI Summary', description: 'Can request AI-generated summary and keywords' },
      { id: 'upload', name: 'Upload Documents', description: 'Can upload new documents to the system' }
    ]
  });
});

// List all users from Keycloak
router.get('/users', async (req, res, next) => {
  try {
    const users = await keycloakAdmin.getUsers();
    res.json({ users });
  } catch (error) {
    console.error('[Admin] Failed to fetch users:', error.message);
    // Fallback to empty array if Keycloak admin API fails
    res.json({ 
      users: [],
      error: 'Could not fetch users from Keycloak. Make sure Keycloak is running and admin credentials are correct.'
    });
  }
});

// Create a new user
router.post('/users', async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Validate role
    const validRoles = ['admin', 'user'];
    const userRole = validRoles.includes(role) ? role : 'user';

    // Create user in Keycloak
    const keycloakUser = await keycloakAdmin.createUser({
      email,
      username: email,
      password,
      firstName: firstName || '',
      lastName: lastName || '',
      role: userRole
    });

    // Sync user to Mayan EDMS
    try {
      await mayanUserService.syncUserToMayan({
        id: keycloakUser.id,
        email,
        username: email,
        firstName: firstName || '',
        lastName: lastName || ''
      });
      console.log('[Admin] User synced to Mayan:', email);
    } catch (mayanError) {
      console.warn('[Admin] Failed to sync user to Mayan:', mayanError.message);
      // Don't fail the request - Keycloak user is created
    }

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: keycloakUser.id,
        email,
        username: email,
        firstName,
        lastName,
        role: userRole
      }
    });
  } catch (error) {
    console.error('[Admin] Failed to create user:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Update a user
router.put('/users/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, email, password, enabled } = req.body;

    await keycloakAdmin.updateUser(userId, {
      firstName,
      lastName,
      email,
      password,
      enabled
    });

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('[Admin] Failed to update user:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Delete a user
router.delete('/users/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    await keycloakAdmin.deleteUser(userId);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('[Admin] Failed to delete user:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Get available roles
router.get('/roles', async (req, res, next) => {
  try {
    const roles = await keycloakAdmin.getAvailableRoles();
    // Filter to only our custom roles
    const appRoles = roles.filter(r => ['admin', 'user'].includes(r.name));
    res.json({ roles: appRoles });
  } catch (error) {
    console.error('[Admin] Failed to fetch roles:', error.message);
    res.json({ roles: [] });
  }
});

// Get all active access grants
router.get('/access-grants', async (req, res, next) => {
  try {
    const grants = await accessControl.getAllGrants();
    
    // Enrich grants with user information
    const enrichedGrants = await Promise.all(
      grants.map(async (grant) => {
        try {
          const user = await keycloakAdmin.getUserById(grant.userId);
          return {
            ...grant,
            userEmail: user.email,
            username: user.username
          };
        } catch (error) {
          return {
            ...grant,
            userEmail: 'Unknown',
            username: 'Unknown'
          };
        }
      })
    );

    res.json({ grants: enrichedGrants });
  } catch (error) {
    next(error);
  }
});

// Grant time-limited access to a document with specific permissions
router.post('/access', async (req, res, next) => {
  try {
    const { userId, documentId, expiresAt, permissions } = req.body;

    if (!userId || !documentId || !expiresAt) {
      return res.status(400).json({
        error: 'userId, documentId, and expiresAt are required'
      });
    }

    // Verify user exists in Keycloak
    try {
      await keycloakAdmin.getUserById(userId);
    } catch (error) {
      return res.status(404).json({ error: 'User not found in Keycloak' });
    }

    const expiryDate = new Date(expiresAt);
    if (isNaN(expiryDate.getTime())) {
      return res.status(400).json({ error: 'Invalid expiresAt date format' });
    }

    if (expiryDate <= new Date()) {
      return res.status(400).json({ error: 'expiresAt must be in the future' });
    }

    // Default to view-only if no permissions specified
    const grantPermissions = permissions && permissions.length > 0 
      ? permissions 
      : ['view'];

    await accessControl.grantAccess(userId, documentId, expiresAt, grantPermissions);

    res.json({
      message: 'Access granted successfully',
      userId,
      documentId,
      permissions: grantPermissions,
      expiresAt: expiryDate.toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// Revoke access
router.delete('/access/:userId/:documentId', async (req, res, next) => {
  try {
    const { userId, documentId } = req.params;
    await accessControl.revokeAccess(userId, documentId);
    res.json({ message: 'Access revoked successfully' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ACCESS REQUEST WORKFLOW
// ============================================================================

// Get all pending access requests
router.get('/access-requests', async (req, res, next) => {
  try {
    const { status } = req.query;
    
    let requests;
    if (status === 'pending') {
      requests = await accessControl.getPendingRequests();
    } else {
      requests = await accessControl.getAllRequests(true);
    }
    
    res.json({ 
      requests,
      pendingCount: requests.filter(r => r.status === 'pending').length
    });
  } catch (error) {
    next(error);
  }
});

// Get pending request count (for badge)
router.get('/access-requests/count', async (req, res, next) => {
  try {
    const count = await accessControl.getPendingRequestCount();
    res.json({ count });
  } catch (error) {
    next(error);
  }
});

// Approve an access request
router.post('/access-requests/:requestId/approve', async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { expiresAt, note } = req.body;
    
    if (!expiresAt) {
      return res.status(400).json({ error: 'expiresAt is required' });
    }
    
    const request = await accessControl.approveRequest(
      requestId, 
      req.user.sub, 
      req.user.email,
      expiresAt,
      note || ''
    );
    
    res.json({ 
      message: 'Access request approved',
      request 
    });
  } catch (error) {
    console.error('[Admin] Error approving request:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Reject an access request
router.post('/access-requests/:requestId/reject', async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { note } = req.body;
    
    const request = await accessControl.rejectRequest(
      requestId, 
      req.user.sub, 
      req.user.email,
      note || ''
    );
    
    res.json({ 
      message: 'Access request rejected',
      request 
    });
  } catch (error) {
    console.error('[Admin] Error rejecting request:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// BULK ACCESS OPERATIONS
// ============================================================================

// Bulk grant access
router.post('/access/bulk', async (req, res, next) => {
  try {
    const { userId, documentIds, expiresAt, permissions } = req.body;
    
    if (!userId || !documentIds || !Array.isArray(documentIds) || !expiresAt) {
      return res.status(400).json({ 
        error: 'userId, documentIds (array), and expiresAt are required' 
      });
    }
    
    const results = await accessControl.bulkGrantAccess(
      userId, 
      documentIds, 
      expiresAt, 
      permissions || ['view']
    );
    
    res.json({ 
      message: 'Bulk access grant completed',
      results,
      successCount: results.filter(r => r.success).length,
      failedCount: results.filter(r => !r.success).length
    });
  } catch (error) {
    next(error);
  }
});

// Bulk revoke access
router.delete('/access/bulk', async (req, res, next) => {
  try {
    const { userId, documentIds } = req.body;
    
    if (!userId || !documentIds || !Array.isArray(documentIds)) {
      return res.status(400).json({ 
        error: 'userId and documentIds (array) are required' 
      });
    }
    
    const results = await accessControl.bulkRevokeAccess(userId, documentIds);
    
    res.json({ 
      message: 'Bulk access revoke completed',
      results,
      successCount: results.filter(r => r.success).length,
      failedCount: results.filter(r => !r.success).length
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ACCESS TEMPLATES
// ============================================================================

// Get all access templates
router.get('/access-templates', async (req, res, next) => {
  try {
    const templates = await accessControl.getAccessTemplates();
    res.json({ templates });
  } catch (error) {
    next(error);
  }
});

// Create an access template
router.post('/access-templates', async (req, res, next) => {
  try {
    const { name, permissions, defaultDurationDays, description } = req.body;
    
    if (!name || !permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ 
        error: 'name and permissions (array) are required' 
      });
    }
    
    const template = await accessControl.createAccessTemplate(
      name,
      permissions,
      defaultDurationDays || 7,
      description || ''
    );
    
    res.status(201).json({ 
      message: 'Template created',
      template 
    });
  } catch (error) {
    next(error);
  }
});

// Delete an access template
router.delete('/access-templates/:templateId', async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const deleted = await accessControl.deleteAccessTemplate(templateId);
    
    if (deleted) {
      res.json({ message: 'Template deleted' });
    } else {
      res.status(404).json({ error: 'Template not found' });
    }
  } catch (error) {
    next(error);
  }
});

// Apply a template to grant access
router.post('/access-templates/:templateId/apply', async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { userId, documentId } = req.body;
    
    if (!userId || !documentId) {
      return res.status(400).json({ 
        error: 'userId and documentId are required' 
      });
    }
    
    await accessControl.applyTemplate(templateId, userId, documentId);
    
    res.json({ 
      message: 'Template applied successfully' 
    });
  } catch (error) {
    console.error('[Admin] Error applying template:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// MAYAN EVENTS (Enhanced Audit)
// ============================================================================

// Get Mayan system events
router.get('/mayan-events', async (req, res, next) => {
  try {
    const { limit, page, actionName, dateFrom, dateTo } = req.query;
    
    const events = await mayanService.getSystemEvents({
      limit: parseInt(limit) || 50,
      page: parseInt(page) || 1,
      actionName,
      dateFrom,
      dateTo
    }, req.userContext);
    
    res.json({ 
      events: events.results || [],
      total: events.count || 0
    });
  } catch (error) {
    console.error('[Admin] Error fetching Mayan events:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get Mayan event types
router.get('/mayan-event-types', async (req, res, next) => {
  try {
    const eventTypes = await mayanService.getEventTypes(req.userContext);
    res.json({ eventTypes: eventTypes.results || [] });
  } catch (error) {
    console.error('[Admin] Error fetching event types:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CABINETS/FOLDERS CRUD
// ============================================================================

// List all cabinets
router.get('/cabinets', async (req, res, next) => {
  try {
    const cabinets = await mayanService.getCabinets(req.userContext);
    res.json({
      success: true,
      cabinets: cabinets.results || [],
      total: cabinets.count || 0
    });
  } catch (error) {
    console.error('[Admin] Error fetching cabinets:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create a new cabinet
router.post('/cabinets', async (req, res, next) => {
  try {
    const { label, parentId } = req.body;

    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Label is required' });
    }

    const cabinet = await mayanService.createCabinet(label.trim(), parentId || null, req.userContext);
    res.status(201).json({
      success: true,
      message: 'Cabinet created successfully',
      cabinet
    });
  } catch (error) {
    console.error('[Admin] Error creating cabinet:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Update a cabinet
router.patch('/cabinets/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { label } = req.body;

    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Label is required' });
    }

    const cabinet = await mayanService.updateCabinet(id, label.trim(), req.userContext);
    res.json({
      success: true,
      message: 'Cabinet updated successfully',
      cabinet
    });
  } catch (error) {
    console.error('[Admin] Error updating cabinet:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Delete a cabinet
router.delete('/cabinets/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await mayanService.deleteCabinet(id, req.userContext);
    res.json({
      success: true,
      message: 'Cabinet deleted successfully'
    });
  } catch (error) {
    console.error('[Admin] Error deleting cabinet:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get documents in a cabinet
router.get('/cabinets/:id/documents', async (req, res, next) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const response = await mayanService.getCabinetDocuments(id, page, limit, req.userContext);
    res.json({
      success: true,
      documents: response.results || [],
      total: response.count || 0,
      page,
      limit
    });
  } catch (error) {
    console.error('[Admin] Error fetching cabinet documents:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Add a document to a cabinet
router.post('/cabinets/:id/documents', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { documentId } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: 'documentId is required' });
    }

    await mayanService.addDocumentToCabinet(id, documentId, req.userContext);
    res.status(201).json({
      success: true,
      message: 'Document added to cabinet successfully'
    });
  } catch (error) {
    console.error('[Admin] Error adding document to cabinet:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Remove a document from a cabinet
router.delete('/cabinets/:id/documents/:docId', async (req, res, next) => {
  try {
    const { id, docId } = req.params;
    await mayanService.removeDocumentFromCabinet(id, docId, req.userContext);
    res.json({
      success: true,
      message: 'Document removed from cabinet successfully'
    });
  } catch (error) {
    console.error('[Admin] Error removing document from cabinet:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// METADATA TYPES
// ============================================================================

// List all metadata types
router.get('/metadata-types', async (req, res, next) => {
  try {
    const metadataTypes = await mayanService.getMetadataTypes(req.userContext);
    res.json({
      success: true,
      metadataTypes: metadataTypes.results || [],
      total: metadataTypes.count || 0
    });
  } catch (error) {
    console.error('[Admin] Error fetching metadata types:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create a new metadata type
router.post('/metadata-types', async (req, res, next) => {
  try {
    const { name, label } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Label is required' });
    }

    const metadataType = await mayanService.createMetadataType(name.trim(), label.trim(), req.userContext);
    res.status(201).json({
      success: true,
      message: 'Metadata type created successfully',
      metadataType
    });
  } catch (error) {
    console.error('[Admin] Error creating metadata type:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// REAL STATISTICS
// ============================================================================

// Get comprehensive system statistics
router.get('/statistics', async (req, res, next) => {
  try {
    const stats = await mayanService.getStatistics(req.userContext);
    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('[Admin] Error fetching statistics:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ENHANCED EVENTS
// ============================================================================

// Get filtered events
router.get('/events/filtered', async (req, res, next) => {
  try {
    const { userId, eventType, documentId, dateFrom, dateTo, page, limit } = req.query;

    const events = await mayanService.getEventsFiltered({
      userId,
      eventType,
      documentId: documentId ? parseInt(documentId) : undefined,
      dateFrom,
      dateTo,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    }, req.userContext);

    res.json({
      success: true,
      events: events.results || [],
      total: events.count || 0,
      hasNext: !!events.next,
      hasPrev: !!events.previous
    });
  } catch (error) {
    console.error('[Admin] Error fetching filtered events:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

