const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, requireRole } = require('../middleware/auth');
const mayanService = require('../services/mayanService');
const aiService = require('../services/aiService');
const accessControl = require('../services/accessControl');
const auditService = require('../services/auditService');
const ocrPollingService = require('../services/ocrPollingService');

// Permission types
const { PERMISSION_TYPES } = accessControl;

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept PDF, images, and common document formats
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, images, and documents are allowed.'));
    }
  }
});

// Helper function to check if user is admin
const isAdmin = (user) => {
  return user?.roles?.includes('admin') || false;
};

// ============================================================================
// DOCUMENT TYPES (from Mayan)
// ============================================================================

// Get all document types from Mayan
router.get('/types', authenticate, async (req, res, next) => {
  try {
    const response = await mayanService.getDocumentTypes(req.userContext);
    res.json({
      success: true,
      types: response.results || []
    });
  } catch (error) {
    console.error('[Documents] Failed to get document types:', error.message);
    res.json({ success: true, types: [] }); // Return empty array on error
  }
});

// ============================================================================
// ADVANCED SEARCH
// ============================================================================

// Search documents with advanced filters
router.get('/search', authenticate, async (req, res, next) => {
  try {
    const { 
      q,                    // Full-text search query
      documentType,         // Document type ID filter
      dateFrom,             // Date range start (ISO string)
      dateTo,               // Date range end (ISO string)
      sortBy = 'datetime_created',  // Sort field
      sortOrder = 'desc',   // asc or desc
      page = 1,
      limit = 20
    } = req.query;

    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);

    // Build Mayan search parameters
    const searchParams = new URLSearchParams();
    searchParams.append('page', page);
    searchParams.append('page_size', limit);

    // Add full-text search
    if (q && q.trim()) {
      searchParams.append('q', q.trim());
    }

    // Add document type filter
    if (documentType) {
      searchParams.append('document_type_id', documentType);
    }

    // Add date range filters
    if (dateFrom) {
      searchParams.append('datetime_created__gte', dateFrom);
    }
    if (dateTo) {
      searchParams.append('datetime_created__lte', dateTo);
    }

    // Add sorting
    const orderPrefix = sortOrder === 'desc' ? '-' : '';
    searchParams.append('ordering', `${orderPrefix}${sortBy}`);

    // Fetch from Mayan
    const response = await mayanService.searchDocuments(searchParams.toString(), req.userContext);

    // Get accessible document IDs for non-admin users
    let accessibleDocIds = [];
    if (!userIsAdmin) {
      accessibleDocIds = await accessControl.getAccessibleDocuments(userId);
    }

    // Map documents with access flags
    const documents = (response.results || []).map(doc => {
      const canView = userIsAdmin || accessibleDocIds.includes(String(doc.id));
      return {
        id: doc.id,
        title: doc.label,
        description: doc.description || '',
        documentType: doc.document_type?.label || 'Unknown',
        documentTypeId: doc.document_type?.id,
        uploadedAt: doc.datetime_created,
        uploadedBy: doc.user?.username || 'system',
        fileCount: doc.files_count || 0,
        pageCount: doc.pages_count || 0,
        canView
      };
    });

    // Log search for audit
    await auditService.log(auditService.AUDIT_ACTIONS.DOCUMENT_SEARCH || 'DOCUMENT_SEARCH', userId, {
      query: q,
      filters: { documentType, dateFrom, dateTo, sortBy, sortOrder },
      resultsCount: documents.length,
      userEmail: req.user.email
    });

    res.json({
      success: true,
      documents,
      total: response.count,
      page: parseInt(page),
      limit: parseInt(limit),
      hasNext: !!response.next,
      hasPrev: !!response.previous
    });
  } catch (error) {
    console.error('[Documents] Search error:', error.message);
    next(error);
  }
});

// ============================================================================
// DOCUMENT UPLOAD
// ============================================================================

// Upload document (Admin OR users granted UPLOAD permission)
router.post('/upload', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    const userIsAdmin = isAdmin(req.user);
    const canUpload = userIsAdmin || await accessControl.hasGlobalPermission(req.user.id, PERMISSION_TYPES.UPLOAD);
    if (!canUpload) {
      return res.status(403).json({
        error: 'Access denied. You do not have permission to upload documents.',
        code: 'NO_UPLOAD_PERMISSION'
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const title = req.body.title || req.file.originalname;
    const description = req.body.description || '';

    const documentTypeId = req.body.documentTypeId ? Number(req.body.documentTypeId) : null;
    const cabinetIdRaw = req.body.cabinetId;
    const cabinetPath = req.body.cabinetPath;

    let tagIds = [];
    if (req.body.tagIds) {
      try {
        if (Array.isArray(req.body.tagIds)) {
          tagIds = req.body.tagIds;
        } else if (typeof req.body.tagIds === 'string') {
          const maybeJson = req.body.tagIds.trim();
          if (maybeJson.startsWith('[')) {
            tagIds = JSON.parse(maybeJson);
          } else {
            tagIds = maybeJson.split(',').map(s => s.trim()).filter(Boolean);
          }
        }
      } catch (e) {
        console.warn('[Documents] Failed to parse tagIds, ignoring:', e.message);
        tagIds = [];
      }
    }

    // Pass userContext for per-user Mayan authentication (True SSO)
    const document = await mayanService.uploadDocument(req.file, title, description, req.userContext, { documentTypeId });

    // Apply tags (optional)
    const appliedTagIds = [];
    for (const tagId of tagIds) {
      const numericTagId = Number(tagId);
      if (!numericTagId) continue;
      try {
        await mayanService.addTagToDocument(document.id, numericTagId, req.userContext);
        appliedTagIds.push(numericTagId);
      } catch (e) {
        console.warn(`[Documents] Failed to add tag ${numericTagId} to document ${document.id}:`, e.message);
      }
    }

    // Place in cabinet (optional)
    let destinationCabinetId = null;
    if (cabinetPath && String(cabinetPath).trim()) {
      destinationCabinetId = await mayanService.ensureCabinetPath(String(cabinetPath), req.userContext);
    } else if (cabinetIdRaw) {
      const numericCabinetId = Number(cabinetIdRaw);
      if (numericCabinetId) destinationCabinetId = numericCabinetId;
    }

    if (destinationCabinetId) {
      await mayanService.addDocumentToCabinet(destinationCabinetId, document.id, req.userContext);
    }

    // Start OCR polling for this document (pass MIME type so polling can adjust timeout for images)
    await ocrPollingService.startPolling(document.id, req.file.mimetype);

    // Audit log
    await auditService.log(auditService.AUDIT_ACTIONS.DOCUMENT_UPLOAD, req.user.id, {
      documentId: document.id,
      filename: title,
      userEmail: req.user.email,
      fileSize: req.file.size,
      mimeType: req.file.mimetype
    });

    res.status(201).json({
      id: document.id,
      title: document.label || title,
      uploadedAt: document.datetime_created,
      cabinet: destinationCabinetId
        ? { id: destinationCabinetId, path: cabinetPath ? String(cabinetPath) : null }
        : null,
      documentTypeId: document.document_type?.id || documentTypeId || null,
      tagIds: appliedTagIds,
      message: 'Document uploaded successfully. OCR processing started.'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// CABINETS (for upload destination selection)
// ============================================================================

router.get('/cabinets/all', authenticate, async (req, res) => {
  try {
    const response = await mayanService.getCabinets(req.userContext);
    res.json({ cabinets: response.results || [] });
  } catch (error) {
    console.error('[Documents] Failed to get cabinets:', error.message);
    res.json({ cabinets: [] });
  }
});

// List documents inside a cabinet (metadata-only browse with access flags)
router.get('/cabinets/:cabinetId/documents', authenticate, async (req, res, next) => {
  try {
    const cabinetId = Number(req.params.cabinetId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;

    if (!cabinetId) {
      return res.status(400).json({ error: 'Invalid cabinetId' });
    }

    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);

    const response = await mayanService.getCabinetDocuments(cabinetId, page, limit, req.userContext);

    // Get accessible document IDs for non-admin users
    let accessibleDocIds = [];
    if (!userIsAdmin) {
      accessibleDocIds = await accessControl.getAccessibleDocuments(userId);
    }

    const documents = (response.results || []).map(doc => {
      const canView = userIsAdmin || accessibleDocIds.includes(String(doc.id));
      return {
        id: doc.id,
        title: doc.label,
        uploadedAt: doc.datetime_created,
        uploadedBy: doc.user?.username || doc.user__username || 'system',
        documentType: doc.document_type?.label || 'Unknown',
        documentTypeId: doc.document_type?.id,
        fileCount: doc.files_count || 0,
        pageCount: doc.pages_count || 0,
        canView
      };
    });

    res.json({
      success: true,
      cabinetId,
      documents,
      total: response.count ?? documents.length,
      page,
      limit,
      hasNext: !!response.next,
      hasPrev: !!response.previous
    });
  } catch (error) {
    next(error);
  }
});

// List documents - returns ALL with access flags for metadata-only browse
router.get('/', authenticate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);

    // Pass userContext for per-user Mayan authentication (True SSO)
    // Use actual limit for efficient fetching - let Mayan handle pagination
    const response = await mayanService.getDocumentList(page, limit, req.userContext);

    // Get accessible document IDs for non-admin users
    let accessibleDocIds = [];
    if (!userIsAdmin) {
      accessibleDocIds = await accessControl.getAccessibleDocuments(userId);
      console.log(`[Documents] User ${userId} accessible IDs: ${accessibleDocIds.join(', ') || 'none'}`);
    }

    // Map all documents with access flags (metadata-only browse)
    const documents = response.results.map(doc => {
      const canView = userIsAdmin || accessibleDocIds.includes(String(doc.id));
      return {
        id: doc.id,
        title: doc.label,
        uploadedAt: doc.datetime_created,
        uploadedBy: doc.user__username || 'system',
        documentType: doc.document_type?.label,
        documentTypeId: doc.document_type?.id,
        canView // access flag for UI to show lock icon or request CTA
      };
    });

    if (userIsAdmin) {
      console.log(`[Documents] User ${userId} is admin, showing all documents`);
    }

    // Return documents directly - Mayan handles pagination
    res.json({
      documents,
      total: response.count || documents.length,
      page,
      limit
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// BATCH THUMBNAIL ENDPOINT (must be before /:id route)
// ============================================================================

// Batch get thumbnails (single permission check for multiple documents)
// GET /api/documents/thumbnails?ids=1,2,3,4,5
router.get('/thumbnails', authenticate, async (req, res, next) => {
  try {
    const idsParam = req.query.ids;
    if (!idsParam) {
      return res.status(400).json({ error: 'Missing ids parameter' });
    }
    
    const documentIds = idsParam.split(',').map(id => id.trim()).filter(Boolean);
    if (documentIds.length === 0) {
      return res.json({ thumbnails: [] });
    }
    
    // Limit batch size to prevent abuse
    const MAX_BATCH = 24;
    const limitedIds = documentIds.slice(0, MAX_BATCH);
    
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);
    const size = parseInt(req.query.size) || 150;
    
    // Single batch permission check for all documents
    let accessibleIds;
    if (userIsAdmin) {
      accessibleIds = limitedIds;
    } else {
      // Check which documents user can access
      const accessChecks = await Promise.all(
        limitedIds.map(async (docId) => {
          const hasAccess = await accessControl.hasPermission(userId, docId, 'view');
          return hasAccess ? docId : null;
        })
      );
      accessibleIds = accessChecks.filter(Boolean);
    }
    
    if (accessibleIds.length === 0) {
      return res.json({ thumbnails: [] });
    }
    
    // Fetch thumbnails in parallel
    const thumbnailPromises = accessibleIds.map(async (docId) => {
      try {
        const thumbnail = await mayanService.getDocumentThumbnail(docId, 1, size, req.userContext);
        return {
          id: docId,
          contentType: thumbnail.contentType,
          data: thumbnail.data
        };
      } catch (err) {
        // Thumbnail not available for this document
        return { id: docId, error: true };
      }
    });
    
    const results = await Promise.all(thumbnailPromises);
    const thumbnails = results.filter(t => !t.error);
    
    res.json({ thumbnails });
  } catch (error) {
    console.error('[Documents] Batch thumbnail error:', error.message);
    res.status(500).json({ error: 'Failed to get thumbnails' });
  }
});

// Get document details - returns metadata-only (200) when user lacks view permission
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);

    // Check VIEW permission (admin always has access)
    const hasViewPermission = userIsAdmin || await accessControl.hasPermission(userId, documentId, 'view');

    // Get document using admin auth when user lacks view (for metadata-only)
    const document = await mayanService.getDocument(documentId, hasViewPermission ? req.userContext : null);

    // If user lacks VIEW permission, return metadata-only response (200)
    if (!hasViewPermission) {
      // Check if user has a pending access request
      const pendingRequest = await accessControl.getPendingRequestForDocument(userId, documentId);

      // Audit metadata-only view
      await auditService.log('DOCUMENT_VIEW_METADATA_ONLY', userId, {
        documentId,
        documentTitle: document.label,
        userEmail: req.user.email
      });

      return res.json({
        id: document.id,
        title: document.label,
        documentType: document.document_type?.label || null,
        documentTypeId: document.document_type?.id || null,
        ocrText: null,
        summary: null,
        keywords: [],
        permissions: {
          canView: false,
          canDownload: false,
          canOcr: false,
          canAiSummary: false
        },
        metadata: {
          uploadedAt: document.datetime_created,
          uploadedBy: document.user__username || 'system',
          fileType: document.file_latest?.mimetype || 'unknown'
        },
        accessRequest: pendingRequest ? {
          status: pendingRequest.status,
          requestedAt: pendingRequest.requestedAt
        } : null
      });
    }

    // Audit document view
    await auditService.log(auditService.AUDIT_ACTIONS.DOCUMENT_VIEW, userId, {
      documentId,
      documentTitle: document.label,
      userEmail: req.user.email
    });

    // Permission checks (run in parallel; Redis lookups are cheap but this avoids serial latency)
    const [hasOcrPermission, hasAiPermission, hasDownloadPermission] = await Promise.all([
      Promise.resolve(userIsAdmin).then(v => v || accessControl.hasPermission(userId, documentId, 'ocr')),
      Promise.resolve(userIsAdmin).then(v => v || accessControl.hasPermission(userId, documentId, 'ai_summary')),
      Promise.resolve(userIsAdmin).then(v => v || accessControl.hasPermission(userId, documentId, 'download')),
    ]);

    // IMPORTANT: Do not fetch full OCR text (very expensive) as part of opening a document.
    // We only need a lightweight status for the UI badge; full OCR is available via /api/ai/ocr/:id.
    let ocrText = null;
    if (hasOcrPermission) {
      const ocrStatus = await mayanService.getOCRStatus(documentId, req.userContext);
      ocrText = ocrStatus === 'ready' ? 'OCR_READY' : 'OCR_PROCESSING';
    } else {
      ocrText = '[OCR access not granted. Contact administrator for OCR permission.]';
    }

    // IMPORTANT: Do not generate AI summary here (can be several seconds).
    // The UI uses the explicit AI endpoint (/api/ai/summary/:id) via the "Generate Summary" button.
    let summary = null;
    let keywords = [];
    if (!hasAiPermission) {
      summary = '[AI Summary access not granted. Contact administrator for AI access.]';
    }

    res.json({
      id: document.id,
      title: document.label,
      documentType: document.document_type?.label || null,
      documentTypeId: document.document_type?.id || null,
      ocrText: ocrText,
      summary,
      keywords,
      permissions: {
        canView: true,
        canDownload: hasDownloadPermission,
        canOcr: hasOcrPermission,
        canAiSummary: hasAiPermission
      },
      metadata: {
        uploadedAt: document.datetime_created,
        uploadedBy: document.user__username || 'system',
        fileType: document.file_latest?.mimetype || 'unknown'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete document (admin only)
router.delete('/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const documentId = req.params.id;

    // Get document info before deletion for audit
    let documentTitle = 'Unknown';
    try {
      const doc = await mayanService.getDocument(documentId, req.userContext);
      documentTitle = doc.label;
    } catch (e) {
      // Document might not exist
    }

    // Pass userContext for per-user Mayan authentication (True SSO)
    await mayanService.deleteDocument(documentId, req.userContext);

    // Audit log
    await auditService.log(auditService.AUDIT_ACTIONS.DOCUMENT_DELETE, req.user.id, {
      documentId,
      documentTitle,
      userEmail: req.user.email
    });

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Preview document in-app - requires VIEW permission (inline display, not download)
// Now with Redis caching for faster subsequent views
router.get('/:id/preview', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);
    const cacheService = require('../services/cacheService');

    // Check VIEW permission (preview requires view, not download)
    if (!userIsAdmin && !await accessControl.hasPermission(userId, documentId, 'view')) {
      return res.status(403).json({ 
        error: 'Access denied. You do not have permission to view this document.',
        code: 'NO_VIEW_PERMISSION'
      });
    }

    // Try cache first (only for documents < 5MB to avoid memory issues)
    const cacheKey = cacheService.cacheKeys.preview(documentId);
    const cached = await cacheService.getBinary(cacheKey);
    
    if (cached) {
      const document = await mayanService.getDocument(documentId, req.userContext);
      const filename = document.label || `document-${documentId}.pdf`;

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Type', cached.contentType);
      // Allow the SPA (frontendUrl) to embed this preview in an <iframe>.
      // X-Frame-Options cannot express multiple origins, so we rely on CSP.
      res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${frontendUrl}`);
      res.setHeader('X-Cache', 'HIT');
      
      return res.send(cached.buffer);
    }

    const document = await mayanService.getDocument(documentId, req.userContext);
    const stream = await mayanService.downloadDocument(documentId, req.userContext);

    const safeFilename = String(document.label || `document-${documentId}`)
      .replace(/[\r\n"\\]/g, '_')
      .trim();

    // Mayan's document payload sometimes omits file_latest; fall back to file list.
    let mimeType = document.file_latest?.mimetype;
    let fileSize = document.file_latest?.size;
    if (!mimeType || !fileSize) {
      try {
        const fileList = await mayanService.makeRequest(
          'get',
          `/api/v4/documents/${documentId}/files/?page_size=1`,
          null,
          {},
          req.userContext
        );
        const firstFile = fileList?.results?.[0];
        mimeType = mimeType || firstFile?.mimetype;
        fileSize = fileSize || firstFile?.size;
      } catch (e) {
        // best-effort only
      }
    }

    mimeType = mimeType || 'application/octet-stream';
    fileSize = Number(fileSize) || 0;

    const filename = safeFilename;

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // For inline viewing, use Content-Disposition: inline
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${frontendUrl}`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Cache', 'MISS');
    
    // Collect buffer for caching (only if < 5MB)
    if (fileSize > 0 && fileSize < 5 * 1024 * 1024) {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        await cacheService.setBinary(cacheKey, buffer, mimeType, cacheService.CACHE_TTL.PREVIEW);
        res.send(buffer);
      });
      stream.on('error', (err) => {
        console.error('[Preview] Stream error:', err);
        if (!res.headersSent) {
          next(err);
        }
      });
    } else {
      // Large files: stream directly without caching
      stream.pipe(res);
    }
  } catch (error) {
    next(error);
  }
});

// Download document - requires DOWNLOAD permission
router.get('/:id/download', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);

    // Check DOWNLOAD permission
    if (!userIsAdmin && !await accessControl.hasPermission(userId, documentId, 'download')) {
      // Audit denied access attempt
      await auditService.log(auditService.AUDIT_ACTIONS.ACCESS_DENIED, userId, {
        documentId,
        userEmail: req.user.email,
        requestedPermission: 'download'
      });

      return res.status(403).json({ 
        error: 'Access denied. You do not have permission to download this document.',
        code: 'NO_DOWNLOAD_PERMISSION'
      });
    }

    // Pass userContext for per-user Mayan authentication (True SSO)
    const document = await mayanService.getDocument(documentId, req.userContext);
    const stream = await mayanService.downloadDocument(documentId, req.userContext);
    
    const filename = document.label || `document-${documentId}.pdf`;
    const mimeType = document.file_latest?.mimetype || 'application/pdf';

    // Audit download
    await auditService.log(auditService.AUDIT_ACTIONS.DOCUMENT_DOWNLOAD, userId, {
      documentId,
      documentTitle: document.label,
      userEmail: req.user.email,
      mimeType
    });

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', mimeType);
    
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DOCUMENT THUMBNAIL/PREVIEW
// ============================================================================

// Get document thumbnail (first page preview)
router.get('/:id/thumbnail', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);
    const size = parseInt(req.query.size) || 200;

    // Check VIEW permission
    if (!userIsAdmin && !await accessControl.hasPermission(userId, documentId, 'view')) {
      return res.status(403).json({ 
        error: 'Access denied',
        code: 'NO_VIEW_PERMISSION'
      });
    }

    const thumbnail = await mayanService.getDocumentThumbnail(documentId, 1, size, req.userContext);
    
    if (!thumbnail) {
      return res.status(404).json({ error: 'Thumbnail not available' });
    }

    // Return as base64 JSON or as image
    if (req.query.format === 'json') {
      res.json({
        data: thumbnail.data,
        contentType: thumbnail.contentType
      });
    } else {
      res.setHeader('Content-Type', thumbnail.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      res.send(Buffer.from(thumbnail.data, 'base64'));
    }
  } catch (error) {
    console.error('[Documents] Thumbnail error:', error.message);
    res.status(500).json({ error: 'Failed to get thumbnail' });
  }
});

// List pages for a document (used for non-PDF previews like DOCX)
router.get('/:id/pages', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);

    if (!userIsAdmin && !await accessControl.hasPermission(userId, documentId, 'view')) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'NO_VIEW_PERMISSION'
      });
    }

    // IMPORTANT: Bypass any cached document detail here. Immediately after upload,
    // Mayan can take time to populate version_active; caching a null version would
    // break DOCX/page previews for up to the cache TTL.
    const document = await mayanService.makeRequest('get', `/api/v4/documents/${documentId}/`, null, {}, req.userContext);
    let versionId = document?.version_active?.id;

    if (!versionId) {
      // Fallback: try the latest version even if version_active isn't populated yet.
      const versionsResponse = await mayanService.makeRequest(
        'get',
        `/api/v4/documents/${documentId}/versions/?page_size=1&ordering=-id`,
        null,
        {},
        req.userContext
      );
      versionId = versionsResponse?.results?.[0]?.id || null;
    }

    if (!versionId) {
      return res.json({
        success: true,
        documentId: String(documentId),
        versionId: null,
        pages: [],
        total: 0,
        ready: false
      });
    }

    const pagesResponse = await mayanService.makeRequest(
      'get',
      `/api/v4/documents/${documentId}/versions/${versionId}/pages/?page_size=1000&ordering=page_number`,
      null,
      {},
      req.userContext
    );

    const pages = (pagesResponse.results || []).map((p) => ({
      id: p.id,
      pageNumber: p.page_number
    }));

    res.json({
      success: true,
      documentId: String(documentId),
      versionId,
      pages,
      total: pagesResponse.count ?? pages.length,
      ready: true
    });
  } catch (error) {
    next(error);
  }
});

// Serve a rendered page image for a document (for DOCX/Word/image viewer)
router.get('/:id/pages/:pageId/image', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const pageId = req.params.pageId;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);
    const width = Math.min(2400, Math.max(200, parseInt(req.query.width) || 1200));

    if (!userIsAdmin && !await accessControl.hasPermission(userId, documentId, 'view')) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'NO_VIEW_PERMISSION'
      });
    }

    const axios = require('axios');
    const { MAYAN_URL } = require('../config/mayan');
    const mayanAuthService = require('../services/mayanAuthService');

    // Bypass cache; same rationale as /:id/pages.
    const document = await mayanService.makeRequest('get', `/api/v4/documents/${documentId}/`, null, {}, req.userContext);
    let versionId = document?.version_active?.id;

    if (!versionId) {
      const versionsResponse = await mayanService.makeRequest(
        'get',
        `/api/v4/documents/${documentId}/versions/?page_size=1&ordering=-id`,
        null,
        {},
        req.userContext
      );
      versionId = versionsResponse?.results?.[0]?.id || null;
    }

    if (!versionId) {
      return res.status(404).json({ error: 'Pages are not ready yet' });
    }

    const authHeaders = await mayanAuthService.getAuthHeaders(req.userContext);
    const url = `${MAYAN_URL}/api/v4/documents/${documentId}/versions/${versionId}/pages/${pageId}/image/?width=${width}`;

    const response = await axios({
      method: 'get',
      url,
      headers: authHeaders,
      responseType: 'arraybuffer'
    });

    res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(Buffer.from(response.data));
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DOCUMENT METADATA & EXTRAS
// ============================================================================

// Get document tags
router.get('/:id/tags', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);

    // Check VIEW permission
    if (!userIsAdmin && !await accessControl.hasPermission(userId, documentId, 'view')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tags = await mayanService.getDocumentTags(documentId, req.userContext);
    res.json({ tags: tags.results || [] });
  } catch (error) {
    next(error);
  }
});

// Get document version history
router.get('/:id/versions', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);

    // Check VIEW permission
    if (!userIsAdmin && !await accessControl.hasPermission(userId, documentId, 'view')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const versions = await mayanService.getDocumentVersions(documentId, req.userContext);
    res.json({ versions: versions.results || [] });
  } catch (error) {
    next(error);
  }
});

// Get document events (Mayan audit)
router.get('/:id/events', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);

    // Check VIEW permission
    if (!userIsAdmin && !await accessControl.hasPermission(userId, documentId, 'view')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const events = await mayanService.getDocumentEvents(documentId, req.userContext);
    res.json({ events: events.results || [] });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ACCESS REQUEST (User initiated)
// ============================================================================

// Create access request (any authenticated user)
router.post('/:id/request-access', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;
    const userEmail = req.user.email;
    const { reason, permissions } = req.body;

    // Get document title for the request
    let documentTitle = `Document #${documentId}`;
    try {
      // Use admin auth to get document info (user might not have access)
      const doc = await mayanService.getDocument(documentId, null);
      documentTitle = doc.label || documentTitle;
    } catch (e) {
      // Document might not exist or not accessible
    }

    // Check if user already has access
    const hasAccess = await accessControl.hasPermission(userId, documentId, 'view');
    if (hasAccess) {
      return res.status(400).json({ 
        error: 'You already have access to this document' 
      });
    }

    // Create the request
    const request = await accessControl.createAccessRequest(
      userId,
      userEmail,
      documentId,
      documentTitle,
      reason || '',
      permissions || ['view']
    );

    // Audit log
    await auditService.log('ACCESS_REQUEST', userId, {
      documentId,
      documentTitle,
      userEmail,
      reason,
      requestedPermissions: permissions
    });

    res.status(201).json({
      message: 'Access request submitted successfully',
      request
    });
  } catch (error) {
    console.error('[Documents] Access request error:', error.message);
    next(error);
  }
});

// Get my access requests (for the current user)
router.get('/my/access-requests', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const requests = await accessControl.getUserRequests(userId);
    res.json({ requests });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SEARCH SUGGESTIONS (Autocomplete)
// ============================================================================

router.get('/search/suggestions', authenticate, async (req, res, next) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    const suggestions = await mayanService.getSearchSuggestions(q, 10, req.userContext);
    res.json({ suggestions });
  } catch (error) {
    console.error('[Documents] Suggestions error:', error.message);
    res.json({ suggestions: [] });
  }
});

// ============================================================================
// ADVANCED SEARCH (Combined filters + content search)
// ============================================================================

router.get('/search/advanced', authenticate, async (req, res, next) => {
  try {
    const { 
      q,                    // Search query
      searchType = 'all',   // all, content, title, metadata
      documentTypeId,       // Document type ID filter
      dateFrom,             // Date range start
      dateTo,               // Date range end
      tagId,                // Tag filter
      metadataType,         // Metadata type filter
      metadataValue,        // Metadata value filter
      sortBy = 'date',      // Sort field
      sortOrder = 'desc',   // asc or desc
      page = 1,
      limit = 20
    } = req.query;

    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);
    let results = [];
    let total = 0;

    // If searching by content (OCR), use the search models API
    if (searchType === 'content' && q) {
      const contentResults = await mayanService.searchByContent(q, { page: parseInt(page), limit: parseInt(limit) }, req.userContext);
      results = contentResults.results || [];
      total = contentResults.count || 0;
    } else {
      // Build standard search parameters
      const searchParams = new URLSearchParams();
      searchParams.append('page', page);
      searchParams.append('page_size', limit);

      if (q && q.trim()) {
        searchParams.append('label__icontains', q.trim());
      }
      if (documentTypeId) {
        searchParams.append('document_type_id', documentTypeId);
      }
      if (dateFrom) {
        searchParams.append('datetime_created__gte', dateFrom);
      }
      if (dateTo) {
        searchParams.append('datetime_created__lte', dateTo);
      }

      // Sort mapping
      const sortMap = { date: 'datetime_created', title: 'label', type: 'document_type__label' };
      const orderPrefix = sortOrder === 'desc' ? '-' : '';
      searchParams.append('ordering', `${orderPrefix}${sortMap[sortBy] || 'datetime_created'}`);

      const response = await mayanService.searchDocuments(searchParams.toString(), req.userContext);
      results = response.results || [];
      total = response.count || 0;
    }

    // Get accessible document IDs for non-admin users
    let accessibleDocIds = [];
    if (!userIsAdmin) {
      accessibleDocIds = await accessControl.getAccessibleDocuments(userId);
    }

    // Map documents with access flags
    const documents = results.map(doc => {
      const canView = userIsAdmin || accessibleDocIds.includes(String(doc.id));
      return {
        id: doc.id,
        title: doc.label,
        description: doc.description || '',
        documentType: doc.document_type?.label || 'Unknown',
        documentTypeId: doc.document_type?.id,
        uploadedAt: doc.datetime_created,
        uploadedBy: doc.user?.username || 'system',
        pageCount: doc.pages_count || 0,
        mimeType: doc.file_latest?.mimetype || 'application/octet-stream',
        canView
      };
    });

    // Audit log
    await auditService.log(auditService.AUDIT_ACTIONS.DOCUMENT_SEARCH || 'ADVANCED_SEARCH', userId, {
      query: q,
      searchType,
      filters: { documentTypeId, dateFrom, dateTo, tagId },
      resultsCount: documents.length,
      userEmail: req.user.email
    });

    res.json({
      success: true,
      documents,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('[Documents] Advanced search error:', error.message);
    next(error);
  }
});

// ============================================================================
// ALL TAGS (For filtering)
// ============================================================================

router.get('/tags/all', authenticate, async (req, res, next) => {
  try {
    const tags = await mayanService.getTags(req.userContext);
    res.json({ tags: tags.results || [] });
  } catch (error) {
    console.error('[Documents] Failed to get all tags:', error.message);
    res.json({ tags: [] });
  }
});

// ============================================================================
// CONTENT SEARCH (OCR)
// ============================================================================

// Search documents by OCR content
router.get('/search/content', authenticate, async (req, res, next) => {
  try {
    const { q, page, limit } = req.query;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);

    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    const results = await mayanService.searchByContent(
      q.trim(),
      {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      },
      req.userContext
    );

    // Get accessible document IDs for non-admin users
    let accessibleDocIds = [];
    if (!userIsAdmin) {
      accessibleDocIds = await accessControl.getAccessibleDocuments(userId);
    }

    // Map results with access flags
    const documents = (results.results || []).map(doc => {
      const canView = userIsAdmin || accessibleDocIds.includes(String(doc.id));
      return {
        id: doc.id,
        title: doc.label,
        description: doc.description || '',
        documentType: doc.document_type?.label || 'Unknown',
        documentTypeId: doc.document_type?.id,
        uploadedAt: doc.datetime_created,
        uploadedBy: doc.user?.username || 'system',
        pageCount: doc.pages_count || 0,
        canView
      };
    });

    // Audit log
    await auditService.log(auditService.AUDIT_ACTIONS.DOCUMENT_SEARCH || 'CONTENT_SEARCH', userId, {
      query: q,
      resultsCount: documents.length,
      userEmail: req.user.email,
      searchType: 'content'
    });

    res.json({
      success: true,
      documents,
      total: results.count || documents.length,
      query: results.query,
      hasNext: !!results.next,
      hasPrev: !!results.previous
    });
  } catch (error) {
    console.error('[Documents] Content search error:', error.message);
    next(error);
  }
});

// ============================================================================
// DOCUMENT METADATA
// ============================================================================

// Set document metadata
router.post('/:id/metadata', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);
    const { metadataTypeId, value } = req.body;

    // Only admins can set metadata
    if (!userIsAdmin) {
      return res.status(403).json({
        error: 'Access denied. Only administrators can set document metadata.',
        code: 'ADMIN_REQUIRED'
      });
    }

    if (!metadataTypeId) {
      return res.status(400).json({ error: 'metadataTypeId is required' });
    }
    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'value is required' });
    }

    const result = await mayanService.setDocumentMetadata(documentId, metadataTypeId, value, req.userContext);

    // Audit log
    await auditService.log('METADATA_SET', userId, {
      documentId,
      metadataTypeId,
      value,
      userEmail: req.user.email
    });

    res.status(201).json({
      success: true,
      message: 'Metadata set successfully',
      metadata: result
    });
  } catch (error) {
    console.error('[Documents] Set metadata error:', error.message);
    next(error);
  }
});

module.exports = router;

