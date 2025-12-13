/**
 * OCR Polling Service
 * 
 * Polls Mayan EDMS for OCR completion and notifies clients via WebSocket.
 * 
 * WHY POLLING?
 * ------------
 * Mayan EDMS doesn't have built-in webhooks for OCR completion.
 * This service polls for OCR status and broadcasts when complete.
 * 
 * FLOW:
 * 1. Document uploaded → startPolling(documentId)
 * 2. Every 5 seconds, check if OCR text is available
 * 3. When OCR complete → notify via WebSocket → stop polling
 */

const { redis } = require('./redisClient');
const websocketService = require('./websocketService');

// Redis key for tracking documents being polled
const POLLING_KEY = 'ocr:polling';
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLL_ATTEMPTS = 180; // 15 minutes max (180 * 5 seconds) - increased for image processing
const MAX_POLL_ATTEMPTS_IMAGES = 240; // 20 minutes max for image files (240 * 5 seconds)

// Track poll attempts per document
const pollAttempts = new Map();
const documentTypes = new Map(); // Track if document is an image file

// Polling loop interval reference
let pollingInterval = null;

/**
 * Check if polling loop is currently running
 * @returns {boolean}
 */
function isPollingLoopRunning() {
  return pollingInterval !== null;
}

/**
 * Start polling for a document's OCR completion
 * @param {string|number} documentId - Document ID to poll
 * @param {string} mimeType - MIME type of uploaded file (optional, used to adjust timeout)
 */
async function startPolling(documentId, mimeType = null) {
  const docId = String(documentId);
  
  try {
    // Add to polling set
    await redis.sadd(POLLING_KEY, docId);
    pollAttempts.set(docId, 0);
    
    // Auto-start polling loop if not running
    if (!isPollingLoopRunning()) {
      console.log('[OCR Polling] Documents to poll - starting polling loop');
      startPollingLoop();
    }
    
    // Track if this is an image file (needs longer timeout for page generation + OCR)
    const isImage = mimeType && mimeType.startsWith('image/');
    documentTypes.set(docId, { mimeType, isImage });

    websocketService.notifyOCRStatus(docId, 'started', {
      mimeType: mimeType || null,
      isImage,
      pollIntervalMs: POLL_INTERVAL,
      maxAttempts: isImage ? MAX_POLL_ATTEMPTS_IMAGES : MAX_POLL_ATTEMPTS
    });
    
    if (isImage) {
      console.log(`[OCR Polling] Started polling for IMAGE document ${docId} (will wait up to 20 minutes for page generation + OCR)`);
    } else {
      console.log(`[OCR Polling] Started polling for document ${docId}`);
    }
  } catch (error) {
    console.error(`[OCR Polling] Error starting polling for ${docId}:`, error.message);
  }
}

/**
 * Stop polling for a document
 * @param {string|number} documentId - Document ID to stop polling
 */
async function stopPolling(documentId) {
  const docId = String(documentId);
  
  try {
    await redis.srem(POLLING_KEY, docId);
    pollAttempts.delete(docId);
    documentTypes.delete(docId);
    
    console.log(`[OCR Polling] Stopped polling for document ${docId}`);
  } catch (error) {
    console.error(`[OCR Polling] Error stopping polling for ${docId}:`, error.message);
  }
}

/**
 * Check OCR status for a single document
 * @param {string} documentId - Document ID to check
 * @returns {Promise<boolean>} - true if OCR is complete
 */
async function checkDocumentOCR(documentId) {
  // Import here to avoid circular dependency
  const mayanService = require('./mayanService');
  
  try {
    // Use getDocument which has Redis caching (10 min TTL)
    const document = await mayanService.getDocument(documentId);
    
    const version = document.version_active;
    if (!version) {
      return false; // No version yet
    }
    
    // Check if pages exist (this is lightweight, no need to cache)
    const pagesResponse = await mayanService.makeRequest(
      'get', 
      `/api/v4/documents/${documentId}/versions/${version.id}/pages/`
    );
    
    if (!pagesResponse.results || pagesResponse.results.length === 0) {
      // DEBUG: Pages not found yet - this is the critical issue for PNGs
      const docInfo = documentTypes.get(documentId) || {};
      if (docInfo.isImage) {
        // Log image-specific debugging
        console.log(`[OCR Polling] ⏳ IMAGE document ${documentId}: Pages not yet generated. Waiting for Mayan converter worker...`);
      }
      return false; // No pages yet
    }
    
    // Try to get OCR for first page
    const firstPage = pagesResponse.results[0];
    try {
      const ocrResponse = await mayanService.makeRequest(
        'get',
        `/api/v4/documents/${documentId}/versions/${version.id}/pages/${firstPage.id}/ocr/`
      );
      
      // If we get here with content, OCR is complete
      if (ocrResponse.content && ocrResponse.content.trim().length > 0) {
        return true;
      }
    } catch (ocrError) {
      // OCR not ready yet (404 or similar)
      return false;
    }
    
    return false;
  } catch (error) {
    console.error(`[OCR Polling] Error checking document ${documentId}:`, error.message);
    return false;
  }
}

/**
 * Poll all documents in the polling set
 */
async function pollOnce() {
  try {
    const documentIds = await redis.smembers(POLLING_KEY);
    
    if (documentIds.length === 0) {
      // Auto-stop polling loop when no documents to poll (save CPU)
      if (isPollingLoopRunning()) {
        console.log('[OCR Polling] No documents to poll - stopping polling loop');
        stopPollingLoop();
      }
      return; // Nothing to poll
    }
    
    console.log(`[OCR Polling] Checking ${documentIds.length} document(s)...`);
    
    for (const documentId of documentIds) {
      // Increment attempt counter
      const attempts = (pollAttempts.get(documentId) || 0) + 1;
      pollAttempts.set(documentId, attempts);
      
      // Get document type info to determine timeout
      const docInfo = documentTypes.get(documentId) || {};
      const isImage = docInfo.isImage || false;
      const maxAttempts = isImage ? MAX_POLL_ATTEMPTS_IMAGES : MAX_POLL_ATTEMPTS;
      
      // Check if max attempts reached
      if (attempts > maxAttempts) {
        console.log(`[OCR Polling] Max attempts (${attempts}/${maxAttempts}) reached for ${isImage ? 'IMAGE ' : ''}document ${documentId}, stopping`);
        await stopPolling(documentId);

        websocketService.notifyOCRStatus(documentId, 'timeout', {
          attempts,
          maxAttempts,
          isImage
        });
        
        // Notify that OCR may have failed or is taking too long
        websocketService.notifyOCRComplete(documentId, null);
        continue;
      }
      
      // Check OCR status
      const isComplete = await checkDocumentOCR(documentId);
      
      if (isComplete) {
        console.log(`[OCR Polling] ✓ OCR complete for ${isImage ? 'IMAGE ' : ''}document ${documentId} (${attempts} attempts)`);
        
        // Get the full OCR text for notification
        const mayanService = require('./mayanService');
        let ocrText = null;
        try {
          // Clear cache first to get fresh data
          const cacheService = require('./cacheService');
          await cacheService.del(cacheService.cacheKeys.ocr(documentId));
          
          ocrText = await mayanService.getOCRText(documentId);
        } catch (error) {
          console.error(`[OCR Polling] Error getting OCR text:`, error.message);
        }
        
        // Notify via WebSocket
        websocketService.notifyOCRComplete(documentId, ocrText);
        
        // Stop polling this document
        await stopPolling(documentId);
      } else {
        const timeElapsed = ((attempts * POLL_INTERVAL) / 1000).toFixed(1);
        const timeoutMinutes = Math.round((maxAttempts * POLL_INTERVAL) / 60000);
        console.log(`[OCR Polling] Document ${documentId} - ${isImage ? 'IMAGE, ' : ''}OCR processing (${attempts}/${maxAttempts} attempts, ${timeElapsed}s elapsed, ${timeoutMinutes} min timeout)`);

        // Throttle status pushes to avoid spamming clients.
        if (attempts === 1 || attempts % 5 === 0) {
          websocketService.notifyOCRStatus(documentId, 'processing', {
            attempts,
            maxAttempts,
            elapsedSeconds: Number((attempts * POLL_INTERVAL) / 1000),
            timeoutMinutes,
            isImage
          });
        }
      }
    }
  } catch (error) {
    console.error(`[OCR Polling] Error in poll cycle:`, error.message);
  }
}

/**
 * Start the polling loop
 */
function startPollingLoop() {
  if (pollingInterval) {
    console.log('[OCR Polling] Polling loop already running');
    return;
  }
  
  pollingInterval = setInterval(pollOnce, POLL_INTERVAL);
  console.log(`[OCR Polling] Polling loop started (interval: ${POLL_INTERVAL}ms)`);
}

/**
 * Stop the polling loop
 */
function stopPollingLoop() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('[OCR Polling] Polling loop stopped');
  }
}

/**
 * Get polling status
 * @returns {Promise<object>} - Polling status
 */
async function getStatus() {
  try {
    const documentIds = await redis.smembers(POLLING_KEY);
    
    return {
      isRunning: pollingInterval !== null,
      pollInterval: POLL_INTERVAL,
      maxAttempts: MAX_POLL_ATTEMPTS,
      documentsPolling: documentIds.length,
      documents: documentIds.map(id => ({
        documentId: id,
        attempts: pollAttempts.get(id) || 0
      }))
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Clear all polling (for cleanup/restart)
 */
async function clearAllPolling() {
  try {
    await redis.del(POLLING_KEY);
    pollAttempts.clear();
    documentTypes.clear();
    console.log('[OCR Polling] Cleared all polling');
  } catch (error) {
    console.error('[OCR Polling] Error clearing polling:', error.message);
  }
}

module.exports = {
  startPolling,
  stopPolling,
  pollOnce,
  startPollingLoop,
  stopPollingLoop,
  isPollingLoopRunning,
  getStatus,
  clearAllPolling,
  checkDocumentOCR
};
