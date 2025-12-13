const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const aiService = require('../services/aiService');
const mayanService = require('../services/mayanService');
const accessControl = require('../services/accessControl');
const auditService = require('../services/auditService');

// Helper to check admin
const isAdmin = (user) => user?.roles?.includes('admin') || false;

// ============================================================================
// EXPLICIT OCR ACTION - Trigger OCR refresh/re-extraction
// ============================================================================

router.post('/ocr/:documentId', authenticate, async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);

    // Check OCR permission
    if (!userIsAdmin && !await accessControl.hasPermission(userId, documentId, 'ocr')) {
      return res.status(403).json({ 
        error: 'Access denied. OCR permission required.',
        code: 'NO_OCR_PERMISSION'
      });
    }

    // Get current OCR text
    const ocrText = await mayanService.getOCRText(documentId, req.userContext);

    // Log the explicit OCR action
    await auditService.log('OCR_EXPLICIT_REQUEST', userId, {
      documentId,
      userEmail: req.user.email,
      ocrStatus: ocrText === 'OCR_PROCESSING' ? 'processing' : ocrText ? 'available' : 'none'
    });

    if (ocrText === 'OCR_PROCESSING') {
      return res.json({
        success: true,
        status: 'processing',
        message: 'OCR is currently processing. Please check back later.',
        ocrText: null
      });
    }

    res.json({
      success: true,
      status: ocrText ? 'complete' : 'empty',
      message: ocrText ? 'OCR text retrieved successfully' : 'No OCR text available',
      ocrText: ocrText || null
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// EXPLICIT AI SUMMARY ACTION - Generate summary on demand
// ============================================================================

router.post('/summary/:documentId', authenticate, async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { forceRefresh } = req.body;
    const userId = req.user.id;
    const userIsAdmin = isAdmin(req.user);

    // Check AI permission
    if (!userIsAdmin && !await accessControl.hasPermission(userId, documentId, 'ai_summary')) {
      return res.status(403).json({ 
        error: 'Access denied. AI Summary permission required.',
        code: 'NO_AI_PERMISSION'
      });
    }

    // Get OCR text first
    const ocrText = await mayanService.getOCRText(documentId, req.userContext);

    if (ocrText === 'OCR_PROCESSING') {
      return res.json({
        success: false,
        status: 'ocr_processing',
        message: 'Cannot generate AI summary while OCR is still processing.',
        summary: null,
        keywords: []
      });
    }

    if (!ocrText || ocrText.trim().length === 0) {
      return res.json({
        success: false,
        status: 'no_ocr',
        message: 'No OCR text available to generate summary.',
        summary: null,
        keywords: []
      });
    }

    // Log the explicit AI action
    await auditService.log('AI_SUMMARY_EXPLICIT_REQUEST', userId, {
      documentId,
      userEmail: req.user.email,
      forceRefresh: !!forceRefresh,
      textLength: ocrText.length
    });

    // Generate summary (uses cache unless forceRefresh) - pass documentId for cache key
    const result = await aiService.generateSummary(ocrText, forceRefresh, documentId);

    res.json({
      success: true,
      status: 'complete',
      message: 'AI summary generated successfully',
      ...result
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// LEGACY ENDPOINTS (kept for backward compatibility)
// ============================================================================

// Get AI summary for a document (legacy)
router.post('/summarize', authenticate, async (req, res, next) => {
  try {
    const { documentId } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: 'Document ID is required' });
    }

    // Get OCR text from Mayan
    const ocrText = await mayanService.getOCRText(documentId);

    if (ocrText === 'OCR_PROCESSING') {
      return res.json({
        summary: 'OCR processing in progress. Please check back later.',
        keywords: []
      });
    }

    if (!ocrText || ocrText.trim().length === 0) {
      return res.json({
        summary: 'No OCR text available for this document.',
        keywords: []
      });
    }

    // Generate summary - pass documentId for cache key
    const result = await aiService.generateSummary(ocrText, false, documentId);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get cached summary (if available)
router.get('/summary/:documentId', authenticate, async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const ocrText = await mayanService.getOCRText(documentId);

    if (ocrText === 'OCR_PROCESSING') {
      return res.json({
        summary: 'OCR processing in progress. Please check back later.',
        keywords: []
      });
    }

    if (!ocrText || ocrText.trim().length === 0) {
      return res.json({
        summary: 'No OCR text available for this document.',
        keywords: []
      });
    }

    // This will use cache if available - pass documentId for cache key
    const result = await aiService.generateSummary(ocrText, false, documentId);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

