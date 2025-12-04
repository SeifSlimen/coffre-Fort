const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const aiService = require('../services/aiService');
const mayanService = require('../services/mayanService');

// Get AI summary for a document
router.post('/summarize', authenticate, async (req, res, next) => {
  try {
    const { documentId } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: 'Document ID is required' });
    }

    // Get OCR text from Mayan
    const ocrText = await mayanService.getOCRText(documentId);

    if (!ocrText || ocrText.trim().length === 0) {
      return res.json({
        summary: 'No OCR text available for this document.',
        keywords: []
      });
    }

    // Generate summary
    const result = await aiService.generateSummary(ocrText);

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

    if (!ocrText || ocrText.trim().length === 0) {
      return res.json({
        summary: 'No OCR text available for this document.',
        keywords: []
      });
    }

    // This will use cache if available
    const result = await aiService.generateSummary(ocrText);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

