const axios = require('axios');
const FormData = require('form-data');
const { MAYAN_URL } = require('../config/mayan');
const cacheService = require('./cacheService');
const mayanAuthService = require('./mayanAuthService');
const { cacheKeys, CACHE_TTL } = cacheService;

const MAYAN_USERNAME = process.env.MAYAN_USERNAME || 'admin';
const MAYAN_PASSWORD = process.env.MAYAN_PASSWORD || 'admin123';

class MayanService {
  /**
   * Get admin auth header (fallback for service operations)
   */
  getAdminAuth() {
    return 'Basic ' + Buffer.from(`${MAYAN_USERNAME}:${MAYAN_PASSWORD}`).toString('base64');
  }

  /**
   * Make request to Mayan API with optional user context for per-user auth
   * 
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {*} data - Request data
   * @param {object} headers - Additional headers
   * @param {object} userContext - User context from req.userContext for per-user auth
   */
  async makeRequest(method, endpoint, data = null, headers = {}, userContext = null) {
    try {
      // Get auth headers - uses per-user token if available, falls back to admin
      const authHeaders = await mayanAuthService.getAuthHeaders(userContext);

      const url = endpoint.startsWith('http') ? endpoint : `${MAYAN_URL}${endpoint}`;

      const config = {
        method,
        url,
        headers: {
          ...authHeaders,
          ...headers
        }
      };

      if (data) {
        if (data instanceof FormData) {
          config.data = data;
          config.headers = {
            ...config.headers,
            ...data.getHeaders()
          };
        } else {
          config.data = data;
        }
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`Mayan API error (${method} ${endpoint}):`, error.response?.data || error.message);
      throw new Error(`Mayan API request failed: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Upload document - uses userContext for audit tracking
   */
  async uploadDocument(file, title, description = '', userContext = null, options = {}) {
    try {
      // Sanitize filename to avoid issues with special characters
      const sanitizedFilename = this.sanitizeFilename(file.originalname);
      const sanitizedTitle = this.sanitizeFilename(title || file.originalname);

      console.log(`[Mayan] Starting upload: ${sanitizedFilename} (${(file.size / 1024).toFixed(2)} KB)`);

      // 1. Create document (metadata only)
      let documentTypeId = null;
      const requestedDocumentTypeId = Number.isFinite(Number(options?.documentTypeId))
        ? Number(options.documentTypeId)
        : null;

      if (requestedDocumentTypeId) {
        documentTypeId = requestedDocumentTypeId;
        console.log(`[Mayan] Using requested document type ID: ${documentTypeId}`);
      } else {
        try {
          const docTypes = await this.makeRequest('get', '/api/v4/document_types/', null, {}, userContext);
          const generalType = docTypes.results.find(dt => dt.label === 'General Document');
          documentTypeId = generalType ? generalType.id : docTypes.results[0]?.id;
          console.log(`[Mayan] Using document type ID: ${documentTypeId}`);
        } catch (error) {
          console.warn('[Mayan] Failed to get document types, using default:', error.message);
          documentTypeId = 1; // Default fallback
        }
      }

      const createData = new FormData();
      if (documentTypeId) createData.append('document_type_id', documentTypeId);
      if (sanitizedTitle) createData.append('label', sanitizedTitle);
      if (description) createData.append('description', description);

      console.log('[Mayan] Creating document metadata...');
      const document = await this.makeRequest('post', '/api/v4/documents/', createData, {}, userContext);
      console.log(`[Mayan] Document created with ID: ${document.id}`);

      // 2. Upload file content to the new document
      console.log(`[Mayan] Uploading file content for document ${document.id}...`);
      const fileData = new FormData();
      fileData.append('file_new', file.buffer, sanitizedFilename);
      fileData.append('action_name', 'replace'); // Required for file upload in some versions

      try {
        const uploadResponse = await this.makeRequest('post', `/api/v4/documents/${document.id}/files/`, fileData, {}, userContext);
        console.log(`[Mayan] File upload API call successful for document ${document.id}`);

        // Verify the file was actually attached by checking the document
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second for processing

        const verifyDoc = await this.makeRequest('get', `/api/v4/documents/${document.id}/`, null, {}, userContext);

        if (!verifyDoc.file_latest && (!verifyDoc.files || verifyDoc.files.length === 0)) {
          throw new Error('File was not attached to document - possible file corruption or size issue');
        }

        console.log(`[Mayan] File verified successfully attached to document ${document.id}`);
      } catch (uploadError) {
        console.error(`[Mayan] File upload failed for document ${document.id}:`, uploadError.message);
        console.error(`[Mayan] File details - name: ${sanitizedFilename}, size: ${file.size} bytes`);

        // Try to delete the incomplete document
        try {
          await this.makeRequest('delete', `/api/v4/documents/${document.id}/`, null, {}, userContext);
          console.log(`[Mayan] Cleaned up incomplete document ${document.id}`);
        } catch (cleanupError) {
          console.warn(`[Mayan] Failed to cleanup document ${document.id}:`, cleanupError.message);
        }
        throw new Error(`File upload failed: ${uploadError.message}. The document has been cleaned up.`);
      }

      // Invalidate document list cache after upload
      await cacheService.invalidatePattern('cache:documents:list:*');

      console.log(`[Mayan] Document uploaded successfully by ${userContext?.email || 'admin'}: ${document.id}`);
      
      // CRITICAL: Trigger page generation for image files (PNG, JPEG, TIFF)
      // Mayan requires explicit page generation task to be queued for images
      // Without this, PNGs will not generate pages and thus cannot be OCRed
      if (this.isImageFile(file.mimetype)) {
        console.log(`[Mayan] Image file detected (${file.mimetype}), triggering page generation for document ${document.id}...`);
        try {
          await this.triggerPageGeneration(document.id, userContext);
        } catch (pageGenError) {
          console.warn(`[Mayan] Failed to trigger page generation: ${pageGenError.message}. Pages may be generated automatically.`);
          // Don't throw - let polling retry
        }
      }
      
      return document;
    } catch (error) {
      console.error('[Mayan] Upload error:', error.message);
      throw new Error(`Failed to upload document to Mayan: ${error.message}`);
    }
  }

  // ============================================================================
  // CABINET PATH HELPERS
  // ============================================================================

  _normalizeCabinetParentId(cabinet) {
    if (!cabinet) return null;
    const parent = cabinet.parent_id ?? cabinet.parent;
    if (parent && typeof parent === 'object') {
      return parent.id ?? null;
    }
    if (parent === 0) return null;
    return parent ?? null;
  }

  _parseCabinetPath(path) {
    if (!path || typeof path !== 'string') return [];
    return path
      .split(/[\\/]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async _getAllCabinets(userContext = null) {
    const all = [];
    let nextUrl = '/api/v4/cabinets/';
    const maxPages = 50;

    for (let i = 0; i < maxPages && nextUrl; i++) {
      const page = await this.makeRequest('get', nextUrl, null, {}, userContext);
      const results = page?.results || [];
      all.push(...results);

      const next = page?.next;
      if (next) {
        // Mayan returns absolute URLs in `next`
        nextUrl = next;
      } else {
        nextUrl = null;
      }
    }

    return all;
  }

  /**
   * Ensure a cabinet path exists (creates missing nodes).
   * Example: "Finance/Invoices/2025".
   * Returns the cabinet ID of the final segment.
   */
  async ensureCabinetPath(cabinetPath, userContext = null) {
    const segments = this._parseCabinetPath(cabinetPath);
    if (segments.length === 0) {
      throw new Error('Invalid cabinetPath');
    }

    let cabinets = await this._getAllCabinets(userContext);
    let parentId = null;
    let currentId = null;

    for (const label of segments) {
      const existing = cabinets.find((c) => {
        const sameLabel = String(c.label || '').trim().toLowerCase() === label.toLowerCase();
        const cParentId = this._normalizeCabinetParentId(c);
        const sameParent = (cParentId ?? null) === (parentId ?? null);
        return sameLabel && sameParent;
      });

      if (existing) {
        currentId = existing.id;
        parentId = existing.id;
        continue;
      }

      const created = await this.createCabinet(label, parentId ?? null, userContext);
      currentId = created.id;
      parentId = created.id;
      cabinets.push(created);
    }

    return currentId;
  }

  /**
   * Sanitize filename to avoid special characters that may cause issues
   * This is a BULLETPROOF sanitization that removes ALL problematic characters
   */
  sanitizeFilename(filename) {
    if (!filename) return 'document.dat';

    // Extract extension first (everything after the last dot)
    const lastDotIndex = filename.lastIndexOf('.');
    let name = filename;
    let extension = '';

    if (lastDotIndex > 0 && lastDotIndex < filename.length - 1) {
      name = filename.substring(0, lastDotIndex);
      extension = filename.substring(lastDotIndex + 1);
    }

    // Normalize and sanitize the name part
    let sanitized = name
      // Normalize unicode (handles accented characters like é → e)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      // Remove parentheses, brackets, braces
      .replace(/[\(\)\[\]\{\}]/g, '')
      // Replace spaces and multiple underscores/hyphens with single underscore
      .replace(/[\s_-]+/g, '_')
      // Remove ALL other special characters (keep only alphanumeric and underscore)
      .replace(/[^a-zA-Z0-9_]/g, '')
      // Remove leading/trailing underscores
      .replace(/^_+|_+$/g, '')
      // Limit length to 200 chars (leaving room for extension)
      .substring(0, 200);

    // Sanitize extension (keep only alphanumeric)
    let sanitizedExt = extension
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase()
      .substring(0, 10); // Max 10 char extension

    // If name is empty after sanitization, generate a safe fallback
    if (!sanitized) {
      sanitized = 'document_' + Date.now();
    }

    // Combine name and extension
    const result = sanitizedExt ? `${sanitized}.${sanitizedExt}` : sanitized;

    console.log(`[Mayan] Filename sanitized: "${filename}" → "${result}"`);
    return result;
  }

  /**
   * Check if file is an image format
   * @param {string} mimeType - MIME type of the file
   * @returns {boolean} - true if image file
   */
  isImageFile(mimeType) {
    const imageMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/tiff',
      'image/x-tiff',
      'image/gif',
      'image/webp',
      'image/bmp'
    ];
    return imageMimes.includes(mimeType?.toLowerCase());
  }

  /**
   * Trigger page generation for a document
   * This queues a converter task in Mayan to generate pages from the file.
   * This is CRITICAL for image files (PNG, JPEG, TIFF) which don't auto-generate pages.
   * Without pages, OCR cannot run.
   * 
   * @param {number} documentId - Document ID
   * @param {object} userContext - User context for auth
   */
  async triggerPageGeneration(documentId, userContext = null) {
    try {
      // Get the document to find its active version
      const document = await this.getDocument(documentId, userContext);
      
      if (!document.version_active) {
        console.warn(`[Mayan] No active version for document ${documentId}, cannot trigger page generation`);
        return;
      }

      const versionId = document.version_active.id;

      // Method 1: Call the converter trigger endpoint (if it exists in this Mayan version)
      try {
        console.log(`[Mayan] Attempting to trigger page generation for document ${documentId}, version ${versionId}...`);
        const result = await this.makeRequest(
          'post',
          `/api/v4/documents/${documentId}/versions/${versionId}/page_count/recalculate/`,
          null,
          {},
          userContext
        );
        console.log(`[Mayan] Page count recalculation triggered successfully`);
        return;
      } catch (method1Error) {
        console.log(`[Mayan] Method 1 (page_count/recalculate) not available: ${method1Error.message}`);
      }

      // Method 2: Try posting empty converter task to trigger page generation
      try {
        console.log(`[Mayan] Attempting alternate page generation via converter endpoint...`);
        const result = await this.makeRequest(
          'post',
          `/api/v4/documents/${documentId}/versions/${versionId}/transformations/`,
          {},
          {},
          userContext
        );
        console.log(`[Mayan] Converter task queued for page generation`);
        return;
      } catch (method2Error) {
        console.log(`[Mayan] Method 2 (transformations) not available: ${method2Error.message}`);
      }

      // Method 3: Try document transformations endpoint
      try {
        console.log(`[Mayan] Attempting document-level transformation trigger...`);
        const result = await this.makeRequest(
          'post',
          `/api/v4/documents/${documentId}/transformations/`,
          {},
          {},
          userContext
        );
        console.log(`[Mayan] Document transformation task queued`);
        return;
      } catch (method3Error) {
        console.warn(`[Mayan] Method 3 (document transformations) failed: ${method3Error.message}`);
      }

      // If all methods failed, page generation may happen automatically
      // The OCR polling service will wait for pages
      console.log(`[Mayan] All page generation trigger methods failed. Pages may be generated automatically by Mayan workers.`);
      
    } catch (error) {
      throw new Error(`Failed to trigger page generation: ${error.message}`);
    }
  }

  /**
   * Get single document - uses userContext for per-user auth
   */
  async getDocument(documentId, userContext = null) {
    try {
      // Check cache first
      const cacheKey = cacheKeys.document(documentId);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Fetch from Mayan with user context
      const document = await this.makeRequest('get', `/api/v4/documents/${documentId}/`, null, {}, userContext);

      // Cache the result
      await cacheService.set(cacheKey, document, CACHE_TTL.DOCUMENT_DETAIL);

      return document;
    } catch (error) {
      throw new Error(`Failed to fetch document from Mayan: ${error.message}`);
    }
  }

  /**
   * Get document list - uses userContext for per-user auth
   */
  async getDocumentList(page = 1, limit = 10, userContext = null) {
    try {
      // Check cache first
      const cacheKey = cacheKeys.documentList(page, limit);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Fetch from Mayan with user context
      const response = await this.makeRequest('get', `/api/v4/documents/?page=${page}&page_size=${limit}`, null, {}, userContext);

      // Cache the result
      await cacheService.set(cacheKey, response, CACHE_TTL.DOCUMENT_LIST);

      return response;
    } catch (error) {
      throw new Error(`Failed to fetch document list from Mayan: ${error.message}`);
    }
  }

  /**
   * Get OCR text - uses userContext for per-user auth
   * OPTIMIZED: Parallel OCR fetching with chunked concurrent requests
   */
  async getOCRText(documentId, userContext = null) {
    try {
      // Check cache first
      const cacheKey = cacheKeys.ocr(documentId);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      // 1. Get document to find the active version
      const document = await this.getDocument(documentId, userContext);

      const version = document.version_active;
      if (!version) {
        console.warn(`No active version found for document ${documentId}`);
        return null;
      }

      // 2. Get version pages
      let allPages = [];
      let pageUrl = `/api/v4/documents/${documentId}/versions/${version.id}/pages/`;

      let loopCount = 0;
      const MAX_LOOPS = 50;

      while (pageUrl && loopCount < MAX_LOOPS) {
        const pagesList = await this.makeRequest('get', pageUrl, null, {}, userContext);
        if (pagesList.results) {
          allPages = allPages.concat(pagesList.results);
        }
        pageUrl = pagesList.next;
        loopCount++;
      }

      if (allPages.length === 0) {
        console.warn(`No pages found for version ${version.id}. Pages might be generating.`);
        return 'OCR_PROCESSING';
      }

      // 3. Get OCR for each page - PARALLELIZED with chunked concurrency
      const CONCURRENCY = 5; // Process 5 pages at a time to avoid overloading Mayan
      const ocrTexts = new Array(allPages.length).fill(null);

      // Helper to fetch OCR for a single page
      const fetchOCR = async (page, index) => {
        try {
          const ocrUrl = `/api/v4/documents/${documentId}/versions/${version.id}/pages/${page.id}/ocr/`;
          const ocrData = await this.makeRequest('get', ocrUrl, null, {}, userContext);
          if (ocrData.content) {
            ocrTexts[index] = ocrData.content;
          }
        } catch (error) {
          console.warn(`Failed to get OCR for page ${page.id}:`, error.message);
        }
      };

      // Process pages in chunks for controlled concurrency
      for (let i = 0; i < allPages.length; i += CONCURRENCY) {
        const chunk = allPages.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map((page, idx) => fetchOCR(page, i + idx)));
      }

      // Filter out nulls and join
      const validOcrTexts = ocrTexts.filter(t => t !== null);

      if (validOcrTexts.length === 0) {
        // If we have pages but no text, it might be empty or processing
        return 'OCR_PROCESSING';
      }

      const ocrText = validOcrTexts.join('\n\n');

      // Cache the OCR result (only if not processing)
      await cacheService.set(cacheKey, ocrText, CACHE_TTL.OCR_TEXT);

      console.log(`[Mayan] OCR fetched for doc ${documentId}: ${allPages.length} pages in parallel (${CONCURRENCY} concurrent)`);
      return ocrText;
    } catch (error) {
      console.warn(`Error getting OCR text for document ${documentId}:`, error.message);
      return null;
    }
  }

  /**
   * Get OCR status (fast)
   *
   * Avoids fetching OCR for all pages, which is expensive and blocks document open.
   * Returns one of: 'ready' | 'processing'
   */
  async getOCRStatus(documentId, userContext = null) {
    try {
      const cacheKey = cacheKeys.ocrStatus(documentId);
      const cachedStatus = await cacheService.get(cacheKey);
      if (cachedStatus) {
        return cachedStatus;
      }

      // If OCR text is already cached, status is ready.
      const cachedOcrText = await cacheService.get(cacheKeys.ocr(documentId));
      if (cachedOcrText) {
        await cacheService.set(cacheKey, 'ready', CACHE_TTL.OCR_STATUS);
        return 'ready';
      }

      // Probe a single page OCR to decide readiness.
      const document = await this.getDocument(documentId, userContext);
      const version = document.version_active;
      if (!version) {
        await cacheService.set(cacheKey, 'processing', CACHE_TTL.OCR_STATUS);
        return 'processing';
      }

      const pagesList = await this.makeRequest(
        'get',
        `/api/v4/documents/${documentId}/versions/${version.id}/pages/?page_size=1`,
        null,
        {},
        userContext
      );
      const firstPage = pagesList?.results?.[0];
      if (!firstPage) {
        await cacheService.set(cacheKey, 'processing', CACHE_TTL.OCR_STATUS);
        return 'processing';
      }

      let status = 'processing';
      try {
        const ocrUrl = `/api/v4/documents/${documentId}/versions/${version.id}/pages/${firstPage.id}/ocr/`;
        const ocrData = await this.makeRequest('get', ocrUrl, null, {}, userContext);
        if (typeof ocrData?.content === 'string' && ocrData.content.trim().length > 0) {
          status = 'ready';
        }
      } catch (error) {
        // If OCR endpoint errors, assume still processing.
      }

      await cacheService.set(cacheKey, status, CACHE_TTL.OCR_STATUS);
      return status;
    } catch (error) {
      // Be conservative: don't break document open.
      return 'processing';
    }
  }

  /**
   * Delete document - uses userContext for audit tracking
   */
  async deleteDocument(documentId, userContext = null) {
    try {
      await this.makeRequest('delete', `/api/v4/documents/${documentId}/`, null, {}, userContext);

      // Invalidate caches for this document
      await cacheService.del(cacheKeys.document(documentId));
      await cacheService.del(cacheKeys.ocr(documentId));
      await cacheService.invalidatePattern('cache:documents:list:*');

      console.log(`[Mayan] Document deleted by ${userContext?.email || 'admin'}: ${documentId}`);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete document from Mayan: ${error.message}`);
    }
  }

  /**
   * Download document - uses userContext for audit tracking
   */
  async downloadDocument(documentId, userContext = null) {
    try {
      // Get document to find the latest file ID
      const document = await this.getDocument(documentId, userContext);
      let file = document.file_latest;

      if (!file) {
        // Check file list if file_latest is missing
        const fileList = await this.makeRequest('get', `/api/v4/documents/${documentId}/files/`, null, {}, userContext);
        if (fileList.results && fileList.results.length > 0) {
          file = fileList.results[0];
        }
      }

      if (!file) {
        throw new Error('No file found for this document');
      }

      // Get auth headers for the download request
      const authHeaders = await mayanAuthService.getAuthHeaders(userContext);

      const response = await axios({
        method: 'get',
        url: `${MAYAN_URL}/api/v4/documents/${documentId}/files/${file.id}/download/`,
        headers: authHeaders,
        responseType: 'stream'
      });

      console.log(`[Mayan] Document downloaded by ${userContext?.email || 'admin'}: ${documentId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to download document: ${error.message}`);
    }
  }

  /**
   * Get Mayan events for a document (for audit purposes)
   */
  async getDocumentEvents(documentId, userContext = null) {
    try {
      return await this.makeRequest('get', `/api/v4/documents/${documentId}/events/`, null, {}, userContext);
    } catch (error) {
      console.warn(`Failed to get events for document ${documentId}:`, error.message);
      return { results: [] };
    }
  }

  /**
   * Get all document types from Mayan (cached for 10 minutes)
   */
  async getDocumentTypes(userContext = null) {
    try {
      // Check cache first
      const cacheKey = cacheKeys.documentTypes();
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        console.log('[Mayan] Document types from cache');
        return cached;
      }

      const result = await this.makeRequest('get', '/api/v4/document_types/', null, {}, userContext);
      
      // Cache for 10 minutes
      await cacheService.set(cacheKey, result, CACHE_TTL.DOCUMENT_TYPES);
      console.log('[Mayan] Document types cached');
      
      return result;
    } catch (error) {
      console.warn('Failed to get document types:', error.message);
      return { results: [] };
    }
  }

  /**
   * Search documents with query parameters
   * @param {string} queryString - URL query string with search params
   * @param {object} userContext - User context for auth
   */
  async searchDocuments(queryString, userContext = null) {
    try {
      return await this.makeRequest('get', `/api/v4/documents/?${queryString}`, null, {}, userContext);
    } catch (error) {
      console.error('Failed to search documents:', error.message);
      throw error;
    }
  }

  /**
   * Get document metadata
   */
  async getDocumentMetadata(documentId, userContext = null) {
    try {
      return await this.makeRequest('get', `/api/v4/documents/${documentId}/metadata/`, null, {}, userContext);
    } catch (error) {
      console.warn(`Failed to get metadata for document ${documentId}:`, error.message);
      return { results: [] };
    }
  }

  /**
   * Advanced search with OCR content support
   * @param {object} options - Search options
   * @param {string} options.query - Search text (searches labels and OCR content)
   * @param {string} options.titleContains - Search in document title only
   * @param {number} options.documentTypeId - Filter by document type
   * @param {string} options.dateFrom - Filter by creation date (from)
   * @param {string} options.dateTo - Filter by creation date (to)
   * @param {number} options.page - Page number
   * @param {number} options.limit - Results per page
   * @param {string} options.sortBy - Sort field
   * @param {string} options.sortOrder - Sort order (asc/desc)
   * @param {boolean} options.searchContent - Search in OCR content
   */
  async advancedSearch(options = {}, userContext = null) {
    try {
      const params = new URLSearchParams();

      // Full-text search (searches labels and content)
      if (options.query) {
        params.append('q', options.query);
      }

      // Title-specific search
      if (options.titleContains) {
        params.append('label__icontains', options.titleContains);
      }

      // Document type filter
      if (options.documentTypeId) {
        params.append('document_type_id', options.documentTypeId);
      }

      // Date range filters
      if (options.dateFrom) {
        params.append('datetime_created__gte', options.dateFrom);
      }
      if (options.dateTo) {
        params.append('datetime_created__lte', options.dateTo);
      }

      // Pagination
      params.append('page', options.page || 1);
      params.append('page_size', options.limit || 20);

      // Sorting
      const orderPrefix = options.sortOrder === 'asc' ? '' : '-';
      const sortField = options.sortBy === 'title' ? 'label' : 'datetime_created';
      params.append('ordering', `${orderPrefix}${sortField}`);

      // Make the search request
      const response = await this.makeRequest('get', `/api/v4/documents/?${params}`, null, {}, userContext);

      return response;
    } catch (error) {
      console.error('Advanced search failed:', error.message);
      throw error;
    }
  }

  /**
   * Get document thumbnail/preview image
   * @param {number} documentId - Document ID
   * @param {number} page - Page number (default 1)
   * @param {string} size - Thumbnail size (width in pixels)
   */
  async getDocumentThumbnail(documentId, page = 1, size = 200, userContext = null) {
    try {
      // Check cache first (1 hour TTL for thumbnails)
      const cacheKey = `cache:thumbnail:${documentId}:${size}`;
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Get document to find the active version
      const document = await this.getDocument(documentId, userContext);
      const version = document.version_active;

      if (!version) {
        return null;
      }

      // Get pages for this version
      const pagesResponse = await this.makeRequest(
        'get',
        `/api/v4/documents/${documentId}/versions/${version.id}/pages/?page_size=1`,
        null, {}, userContext
      );

      const firstPage = pagesResponse.results?.[0];
      if (!firstPage) {
        return null;
      }

      // Get the thumbnail image URL
      // Mayan provides image endpoint: /api/v4/documents/{id}/versions/{version}/pages/{page}/image/
      const thumbnailUrl = `/api/v4/documents/${documentId}/versions/${version.id}/pages/${firstPage.id}/image/?width=${size}`;

      // Get auth headers for the image request
      const authHeaders = await mayanAuthService.getAuthHeaders(userContext);

      const response = await axios({
        method: 'get',
        url: `${MAYAN_URL}${thumbnailUrl}`,
        headers: authHeaders,
        responseType: 'arraybuffer'
      });

      const thumbnail = {
        data: Buffer.from(response.data).toString('base64'),
        contentType: response.headers['content-type'] || 'image/png'
      };

      // Cache the thumbnail for 1 hour (3600 seconds)
      await cacheService.set(cacheKey, thumbnail, 3600);

      return thumbnail;
    } catch (error) {
      console.warn(`Failed to get thumbnail for document ${documentId}:`, error.message);
      return null;
    }
  }

  /**
   * Get all Mayan system events (for audit)
   * @param {object} options - Filter options
   */
  async getSystemEvents(options = {}, userContext = null) {
    try {
      const params = new URLSearchParams();

      if (options.limit) {
        params.append('page_size', options.limit);
      }
      if (options.page) {
        params.append('page', options.page);
      }
      if (options.actionName) {
        params.append('action__name__icontains', options.actionName);
      }
      if (options.dateFrom) {
        params.append('timestamp__gte', options.dateFrom);
      }
      if (options.dateTo) {
        params.append('timestamp__lte', options.dateTo);
      }

      params.append('ordering', '-timestamp');

      return await this.makeRequest('get', `/api/v4/events/?${params}`, null, {}, userContext);
    } catch (error) {
      console.warn('Failed to get system events:', error.message);
      return { results: [], count: 0 };
    }
  }

  /**
   * Get event types from Mayan
   */
  async getEventTypes(userContext = null) {
    try {
      return await this.makeRequest('get', '/api/v4/events/types/', null, {}, userContext);
    } catch (error) {
      console.warn('Failed to get event types:', error.message);
      return { results: [] };
    }
  }

  /**
   * Get all tags from Mayan (cached for 10 minutes)
   */
  async getTags(userContext = null) {
    try {
      // Check cache first
      const cacheKey = cacheKeys.tags();
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        console.log('[Mayan] Tags from cache');
        return cached;
      }

      const result = await this.makeRequest('get', '/api/v4/tags/', null, {}, userContext);
      
      // Cache for 10 minutes
      await cacheService.set(cacheKey, result, CACHE_TTL.TAGS);
      console.log('[Mayan] Tags cached');
      
      return result;
    } catch (error) {
      console.warn('Failed to get tags:', error.message);
      return { results: [] };
    }
  }

  /**
   * Get tags for a specific document
   */
  async getDocumentTags(documentId, userContext = null) {
    try {
      return await this.makeRequest('get', `/api/v4/documents/${documentId}/tags/`, null, {}, userContext);
    } catch (error) {
      console.warn(`Failed to get tags for document ${documentId}:`, error.message);
      return { results: [] };
    }
  }

  /**
   * Add tag to a document
   */
  async addTagToDocument(documentId, tagId, userContext = null) {
    try {
      return await this.makeRequest('post', `/api/v4/documents/${documentId}/tags/`, { tag: tagId }, {}, userContext);
    } catch (error) {
      console.warn(`Failed to add tag to document ${documentId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get document version history
   */
  async getDocumentVersions(documentId, userContext = null) {
    try {
      return await this.makeRequest('get', `/api/v4/documents/${documentId}/versions/`, null, {}, userContext);
    } catch (error) {
      console.warn(`Failed to get versions for document ${documentId}:`, error.message);
      return { results: [] };
    }
  }

  /**
   * Get cabinets (folders) from Mayan
   */
  async getCabinets(userContext = null) {
    try {
      const cached = await cacheService.get(cacheKeys.cabinets());
      if (cached) {
        return cached;
      }

      const response = await this.makeRequest('get', '/api/v4/cabinets/', null, {}, userContext);
      await cacheService.set(cacheKeys.cabinets(), response, CACHE_TTL.DOCUMENT_LIST);
      return response;
    } catch (error) {
      console.warn('Failed to get cabinets:', error.message);
      return { results: [] };
    }
  }

  /**
   * Get cabinets for a specific document
   */
  async getDocumentCabinets(documentId, userContext = null) {
    try {
      return await this.makeRequest('get', `/api/v4/documents/${documentId}/cabinets/`, null, {}, userContext);
    } catch (error) {
      console.warn(`Failed to get cabinets for document ${documentId}:`, error.message);
      return { results: [] };
    }
  }

  /**
   * Get search suggestions (autocomplete)
   */
  async getSearchSuggestions(prefix, limit = 10, userContext = null) {
    try {
      if (!prefix || prefix.length < 2) {
        return [];
      }

      const response = await this.makeRequest(
        'get',
        `/api/v4/documents/?label__icontains=${encodeURIComponent(prefix)}&page_size=${limit}`,
        null, {}, userContext
      );

      return (response.results || []).map(doc => ({
        id: doc.id,
        label: doc.label,
        type: doc.document_type?.label || 'Document'
      }));
    } catch (error) {
      console.warn('Failed to get search suggestions:', error.message);
      return [];
    }
  }

  // ============================================================================
  // CABINETS/FOLDERS CRUD
  // ============================================================================

  /**
   * Create a new cabinet (folder)
   * @param {string} label - Cabinet name
   * @param {number|null} parentId - Parent cabinet ID (null for root)
   * @param {object} userContext - User context for auth
   */
  async createCabinet(label, parentId = null, userContext = null) {
    try {
      const data = { label, parent: parentId ?? null };
      const result = await this.makeRequest('post', '/api/v4/cabinets/', data, {}, userContext);
      await cacheService.del(cacheKeys.cabinets());
      await cacheService.invalidatePattern('cache:cabinets:*:documents:*');
      console.log(`[Mayan] Cabinet created by ${userContext?.email || 'admin'}: ${result.id}`);
      return result;
    } catch (error) {
      throw new Error(`Failed to create cabinet: ${error.message}`);
    }
  }

  /**
   * Update a cabinet
   * @param {number} cabinetId - Cabinet ID
   * @param {string} label - New cabinet name
   * @param {object} userContext - User context for auth
   */
  async updateCabinet(cabinetId, label, userContext = null) {
    try {
      const result = await this.makeRequest('patch', `/api/v4/cabinets/${cabinetId}/`, { label }, {}, userContext);
      await cacheService.del(cacheKeys.cabinets());
      console.log(`[Mayan] Cabinet updated by ${userContext?.email || 'admin'}: ${cabinetId}`);
      return result;
    } catch (error) {
      throw new Error(`Failed to update cabinet: ${error.message}`);
    }
  }

  /**
   * Delete a cabinet
   * @param {number} cabinetId - Cabinet ID
   * @param {object} userContext - User context for auth
   */
  async deleteCabinet(cabinetId, userContext = null) {
    try {
      await this.makeRequest('delete', `/api/v4/cabinets/${cabinetId}/`, null, {}, userContext);
      await cacheService.del(cacheKeys.cabinets());
      await cacheService.invalidatePattern(`cache:cabinets:${cabinetId}:documents:*`);
      console.log(`[Mayan] Cabinet deleted by ${userContext?.email || 'admin'}: ${cabinetId}`);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete cabinet: ${error.message}`);
    }
  }

  /**
   * Get documents in a cabinet
   * @param {number} cabinetId - Cabinet ID
   * @param {number} page - Page number
   * @param {number} limit - Results per page
   * @param {object} userContext - User context for auth
   */
  async getCabinetDocuments(cabinetId, page = 1, limit = 20, userContext = null) {
    try {
      const cacheKey = cacheKeys.cabinetDocuments(cabinetId, page, limit);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await this.makeRequest(
        'get',
        `/api/v4/cabinets/${cabinetId}/documents/?page=${page}&page_size=${limit}`,
        null, {}, userContext
      );

      await cacheService.set(cacheKey, response, CACHE_TTL.DOCUMENT_LIST);
      return response;
    } catch (error) {
      throw new Error(`Failed to get cabinet documents: ${error.message}`);
    }
  }

  /**
   * Add a document to a cabinet
   * @param {number} cabinetId - Cabinet ID
   * @param {number} documentId - Document ID
   * @param {object} userContext - User context for auth
   */
  async addDocumentToCabinet(cabinetId, documentId, userContext = null) {
    const attempts = [
      // Mayan action endpoint (works on builds where /documents/ is read-only)
      { method: 'post', endpoint: `/api/v4/cabinets/${cabinetId}/documents/add/`, data: { document: documentId } },

      // Some Mayan builds manage membership from the document side
      { method: 'post', endpoint: `/api/v4/documents/${documentId}/cabinets/`, data: { cabinet: cabinetId } },
      { method: 'post', endpoint: `/api/v4/documents/${documentId}/cabinets/`, data: { id: cabinetId } },

      // Others accept membership creation from the cabinet side
      { method: 'post', endpoint: `/api/v4/cabinets/${cabinetId}/documents/`, data: { document: documentId } },
      { method: 'post', endpoint: `/api/v4/cabinets/${cabinetId}/documents/`, data: { document_id: documentId } },

      // Fallback: resource-style membership endpoints
      { method: 'put', endpoint: `/api/v4/cabinets/${cabinetId}/documents/${documentId}/`, data: {} },
      { method: 'patch', endpoint: `/api/v4/cabinets/${cabinetId}/documents/${documentId}/`, data: {} }
    ];

    const errors = [];
    for (const attempt of attempts) {
      try {
        const result = await this.makeRequest(
          attempt.method,
          attempt.endpoint,
          attempt.data,
          {},
          userContext
        );

        console.log(`[Mayan] Document ${documentId} added to cabinet ${cabinetId} by ${userContext?.email || 'admin'} (${attempt.method.toUpperCase()} ${attempt.endpoint})`);

        // Invalidate cabinet/doc list caches so UI reflects placement quickly.
        await cacheService.invalidatePattern(`cache:cabinets:${cabinetId}:documents:*`);
        await cacheService.invalidatePattern('cache:documents:list:*');
        return result;
      } catch (error) {
        errors.push(`${attempt.method.toUpperCase()} ${attempt.endpoint}: ${error.message}`);
      }
    }

    throw new Error(`Failed to add document to cabinet: ${errors.join(' | ')}`);
  }

  /**
   * Remove a document from a cabinet
   * @param {number} cabinetId - Cabinet ID
   * @param {number} documentId - Document ID
   * @param {object} userContext - User context for auth
   */
  async removeDocumentFromCabinet(cabinetId, documentId, userContext = null) {
    try {
      // Mayan action endpoint (works on builds where /documents/ is read-only)
      try {
        await this.makeRequest(
          'post',
          `/api/v4/cabinets/${cabinetId}/documents/remove/`,
          { document: documentId },
          {},
          userContext
        );
      } catch (actionError) {
        await this.makeRequest(
          'delete',
          `/api/v4/cabinets/${cabinetId}/documents/${documentId}/`,
          null,
          {},
          userContext
        );
      }
      console.log(`[Mayan] Document ${documentId} removed from cabinet ${cabinetId} by ${userContext?.email || 'admin'}`);
      return true;
    } catch (error) {
      throw new Error(`Failed to remove document from cabinet: ${error.message}`);
    }
  }

  // ============================================================================
  // METADATA TYPES
  // ============================================================================

  /**
   * Get all metadata types
   * @param {object} userContext - User context for auth
   */
  async getMetadataTypes(userContext = null) {
    try {
      return await this.makeRequest('get', '/api/v4/metadata_types/', null, {}, userContext);
    } catch (error) {
      console.warn('Failed to get metadata types:', error.message);
      return { results: [] };
    }
  }

  /**
   * Create a new metadata type
   * @param {string} name - Internal name (slug)
   * @param {string} label - Display label
   * @param {object} userContext - User context for auth
   */
  async createMetadataType(name, label, userContext = null) {
    try {
      const result = await this.makeRequest(
        'post',
        '/api/v4/metadata_types/',
        { name, label },
        {}, userContext
      );
      console.log(`[Mayan] Metadata type created by ${userContext?.email || 'admin'}: ${result.id}`);
      return result;
    } catch (error) {
      throw new Error(`Failed to create metadata type: ${error.message}`);
    }
  }

  /**
   * Set metadata on a document
   * @param {number} documentId - Document ID
   * @param {number} metadataTypeId - Metadata type ID
   * @param {string} value - Metadata value
   * @param {object} userContext - User context for auth
   */
  async setDocumentMetadata(documentId, metadataTypeId, value, userContext = null) {
    try {
      const result = await this.makeRequest(
        'post',
        `/api/v4/documents/${documentId}/metadata/`,
        { metadata_type: metadataTypeId, value },
        {}, userContext
      );
      console.log(`[Mayan] Metadata set on document ${documentId} by ${userContext?.email || 'admin'}`);
      return result;
    } catch (error) {
      throw new Error(`Failed to set document metadata: ${error.message}`);
    }
  }

  // ============================================================================
  // REAL STATISTICS
  // ============================================================================

  /**
   * Get comprehensive statistics about the document management system
   * @param {object} userContext - User context for auth
   */
  async getStatistics(userContext = null) {
    try {
      // 1. Get total document count
      const docsResponse = await this.makeRequest(
        'get',
        '/api/v4/documents/?page_size=1',
        null, {}, userContext
      );
      const totalDocuments = docsResponse.count || 0;

      // 2. Get document types with counts
      const docTypesResponse = await this.getDocumentTypes(userContext);
      const documentTypes = docTypesResponse.results || [];

      // 3. Get sample of documents to calculate storage
      const sampleResponse = await this.makeRequest(
        'get',
        '/api/v4/documents/?page_size=100&ordering=-datetime_created',
        null, {}, userContext
      );
      const sampleDocs = sampleResponse.results || [];

      // Calculate storage from sample
      let totalStorageBytes = 0;
      let processedOcr = 0;
      let pendingOcr = 0;
      const storageByType = {};

      for (const doc of sampleDocs) {
        const fileSize = doc.file_latest?.size || 0;
        totalStorageBytes += fileSize;

        // Track by document type
        const typeLabel = doc.document_type?.label || 'Unknown';
        if (!storageByType[typeLabel]) {
          storageByType[typeLabel] = { count: 0, size: 0 };
        }
        storageByType[typeLabel].count++;
        storageByType[typeLabel].size += fileSize;

        // OCR status based on pages count
        if (doc.pages_count && doc.pages_count > 0) {
          processedOcr++;
        } else {
          pendingOcr++;
        }
      }

      // 4. Estimate total storage
      const sampleSize = sampleDocs.length;
      let estimatedTotalStorage = totalStorageBytes;
      if (sampleSize > 0 && totalDocuments > sampleSize) {
        const avgFileSize = totalStorageBytes / sampleSize;
        estimatedTotalStorage = avgFileSize * totalDocuments;
      }

      // 5. Get cabinets count
      const cabinetsResponse = await this.getCabinets(userContext);
      const totalCabinets = cabinetsResponse.count || (cabinetsResponse.results?.length || 0);

      // 6. Get tags count
      const tagsResponse = await this.getTags(userContext);
      const totalTags = tagsResponse.count || (tagsResponse.results?.length || 0);

      return {
        documents: {
          total: totalDocuments,
          sampled: sampleSize
        },
        storage: {
          estimatedTotalBytes: Math.round(estimatedTotalStorage),
          sampledBytes: totalStorageBytes,
          byType: Object.entries(storageByType).map(([label, stats]) => ({
            label,
            count: stats.count,
            sizeBytes: stats.size
          }))
        },
        ocr: {
          processed: processedOcr,
          pending: pendingOcr,
          processedPercent: sampleSize > 0 ? Math.round((processedOcr / sampleSize) * 100) : 0
        },
        organization: {
          documentTypes: documentTypes.length,
          cabinets: totalCabinets,
          tags: totalTags
        },
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get statistics:', error.message);
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }

  // ============================================================================
  // CONTENT SEARCH (OCR)
  // ============================================================================

  /**
   * Search documents by OCR content using Mayan's search model API
   * @param {string} query - Search query
   * @param {object} options - Search options (page, limit)
   * @param {object} userContext - User context for auth
   */
  async searchByContent(query, options = {}, userContext = null) {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;

      // Use Mayan's search model API for full-text search including OCR content
      const searchUrl = `/api/v4/search_models/documents.documentsearchresult/search/?q=${encodeURIComponent(query)}&page=${page}&page_size=${limit}`;

      const response = await this.makeRequest('get', searchUrl, null, {}, userContext);

      return {
        results: response.results || [],
        count: response.count || 0,
        next: response.next,
        previous: response.previous,
        query
      };
    } catch (error) {
      console.error('Content search failed:', error.message);
      throw new Error(`Content search failed: ${error.message}`);
    }
  }

  // ============================================================================
  // ENHANCED EVENTS
  // ============================================================================

  /**
   * Get filtered events from Mayan
   * @param {object} options - Filter options
   * @param {string} options.userId - Filter by user ID
   * @param {string} options.eventType - Filter by event type name
   * @param {number} options.documentId - Filter by document ID
   * @param {string} options.dateFrom - Filter from date (ISO string)
   * @param {string} options.dateTo - Filter to date (ISO string)
   * @param {number} options.page - Page number
   * @param {number} options.limit - Results per page
   * @param {object} userContext - User context for auth
   */
  async getEventsFiltered(options = {}, userContext = null) {
    try {
      const params = new URLSearchParams();

      // Pagination
      params.append('page', options.page || 1);
      params.append('page_size', options.limit || 50);

      // Filters
      if (options.userId) {
        params.append('actor__id', options.userId);
      }
      if (options.eventType) {
        params.append('action__name__icontains', options.eventType);
      }
      if (options.documentId) {
        params.append('target_object_id', options.documentId);
      }
      if (options.dateFrom) {
        params.append('timestamp__gte', options.dateFrom);
      }
      if (options.dateTo) {
        params.append('timestamp__lte', options.dateTo);
      }

      // Always order by newest first
      params.append('ordering', '-timestamp');

      const response = await this.makeRequest('get', `/api/v4/events/?${params}`, null, {}, userContext);

      return {
        results: response.results || [],
        count: response.count || 0,
        next: response.next,
        previous: response.previous
      };
    } catch (error) {
      console.warn('Failed to get filtered events:', error.message);
      return { results: [], count: 0 };
    }
  }
}

module.exports = new MayanService();
