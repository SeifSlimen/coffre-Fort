const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, requireRole } = require('../middleware/auth');
const mayanService = require('../services/mayanService');
const aiService = require('../services/aiService');
const accessControl = require('../services/accessControl');

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

// Upload document (Admin only)
router.post('/upload', authenticate, requireRole('admin'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const title = req.body.title || req.file.originalname;
    const description = req.body.description || '';

    const document = await mayanService.uploadDocument(req.file, title, description);

    res.status(201).json({
      id: document.id,
      title: document.label || title,
      uploadedAt: document.datetime_created,
      message: 'Document uploaded successfully'
    });
  } catch (error) {
    next(error);
  }
});

// List documents - FILTERED based on user access
router.get('/', authenticate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const userId = req.user.id;

    const response = await mayanService.getDocumentList(page, 100); // Get more to filter

    // Map all documents
    let documents = response.results.map(doc => ({
      id: doc.id,
      title: doc.label,
      uploadedAt: doc.datetime_created,
      uploadedBy: doc.user__username || 'system'
    }));

    // If not admin, filter to only show documents user has VIEW access to
    if (!isAdmin(req.user)) {
      const accessibleDocIds = accessControl.getAccessibleDocuments(userId);
      console.log(`[Documents] User ${userId} is not admin, filtering documents`);
      console.log(`[Documents] Accessible document IDs: ${accessibleDocIds.join(', ') || 'none'}`);
      
      documents = documents.filter(doc => accessibleDocIds.includes(String(doc.id)));
      console.log(`[Documents] Filtered to ${documents.length} documents`);
    } else {
      console.log(`[Documents] User ${userId} is admin, showing all documents`);
    }

    // Paginate the filtered results
    const startIndex = (page - 1) * limit;
    const paginatedDocs = documents.slice(startIndex, startIndex + limit);

    res.json({
      documents: paginatedDocs,
      total: documents.length,
      page,
      limit
    });
  } catch (error) {
    next(error);
  }
});

// Get document details - with permission checks for each feature
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);

    // Check VIEW permission (admin always has access)
    if (!userIsAdmin && !accessControl.hasPermission(userId, documentId, 'view')) {
      return res.status(403).json({ 
        error: 'Access denied. You do not have permission to view this document.',
        code: 'NO_VIEW_PERMISSION'
      });
    }

    const document = await mayanService.getDocument(documentId);

    // Check OCR permission
    let ocrText = null;
    const hasOcrPermission = userIsAdmin || accessControl.hasPermission(userId, documentId, 'ocr');
    
    if (hasOcrPermission) {
      ocrText = await mayanService.getOCRText(documentId);
    } else {
      ocrText = '[OCR access not granted. Contact administrator for OCR permission.]';
    }

    // Check AI Summary permission
    let summary = null;
    let keywords = [];
    const hasAiPermission = userIsAdmin || accessControl.hasPermission(userId, documentId, 'ai_summary');

    if (hasAiPermission) {
      if (ocrText === 'OCR_PROCESSING') {
        summary = 'OCR processing in progress. Please check back later.';
      } else if (hasOcrPermission && ocrText && ocrText.trim().length > 0 && !ocrText.startsWith('[OCR access')) {
        try {
          const aiResult = await aiService.generateSummary(ocrText);
          summary = aiResult.summary;
          keywords = aiResult.keywords;
        } catch (error) {
          console.error('AI processing error:', error.message);
          summary = 'AI summary unavailable at this time.';
        }
      } else {
        summary = 'No OCR text available for AI summary.';
      }
    } else {
      summary = '[AI Summary access not granted. Contact administrator for AI access.]';
    }

    // Check download permission for the response
    const hasDownloadPermission = userIsAdmin || accessControl.hasPermission(userId, documentId, 'download');

    res.json({
      id: document.id,
      title: document.label,
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
    await mayanService.deleteDocument(documentId);
    res.json({ message: 'Document deleted successfully' });
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
    if (!userIsAdmin && !accessControl.hasPermission(userId, documentId, 'download')) {
      return res.status(403).json({ 
        error: 'Access denied. You do not have permission to download this document.',
        code: 'NO_DOWNLOAD_PERMISSION'
      });
    }

    const document = await mayanService.getDocument(documentId);
    const stream = await mayanService.downloadDocument(documentId);
    
    const filename = document.label || `document-${documentId}.pdf`;
    const mimeType = document.file_latest?.mimetype || 'application/pdf';

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', mimeType);
    
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

