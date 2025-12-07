const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, requireRole } = require('../middleware/auth');
const mayanService = require('../services/mayanService');
const aiService = require('../services/aiService');
const accessControl = require('../services/accessControl');

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

// Upload document
router.post('/upload', authenticate, upload.single('file'), async (req, res, next) => {
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

// List documents
router.get('/', authenticate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const response = await mayanService.getDocumentList(page, limit);

    // Filter documents based on user access
    const documents = response.results.map(doc => ({
      id: doc.id,
      title: doc.label,
      uploadedAt: doc.datetime_created,
      uploadedBy: doc.user__username || 'system'
    }));

    res.json({
      documents,
      total: response.count,
      page,
      limit
    });
  } catch (error) {
    next(error);
  }
});

// Get document details with OCR and AI summary
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;

    // Check access control (admin has full access)
    const isAdmin = req.user.roles.includes('admin');
    if (!isAdmin && !accessControl.hasAccess(userId, documentId)) {
      return res.status(403).json({ error: 'Access denied to this document' });
    }

    const document = await mayanService.getDocument(documentId);
    const ocrText = await mayanService.getOCRText(documentId);

    // Get AI summary (with caching)
    let summary = null;
    let keywords = [];

    if (ocrText === 'OCR_PROCESSING') {
      summary = 'OCR processing in progress. Please check back later.';
    } else if (ocrText && ocrText.trim().length > 0) {
      try {
        const aiResult = await aiService.generateSummary(ocrText);
        summary = aiResult.summary;
        keywords = aiResult.keywords;
      } catch (error) {
        console.error('AI processing error:', error.message);
        summary = 'AI summary unavailable at this time.';
      }
    } else {
      summary = 'No OCR text available for this document yet.';
    }

    res.json({
      id: document.id,
      title: document.label,
      ocrText: ocrText,
      summary,
      keywords,
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

// Download document
router.get('/:id/download', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;

    // Check access control
    const isAdmin = req.user.roles.includes('admin');
    if (!isAdmin && !accessControl.hasAccess(userId, documentId)) {
      return res.status(403).json({ error: 'Access denied to this document' });
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

