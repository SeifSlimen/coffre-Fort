/**
 * Cache Service
 * 
 * Provides Redis-based caching for:
 * - Document metadata (5 min TTL)
 * - Document lists (1 min TTL)
 * - OCR text (1 hour TTL)
 * - AI summaries (24 hour TTL)
 * 
 * WHY CACHING?
 * ------------
 * 1. SPEED: Redis reads are ~0.1ms vs 50-200ms for Mayan API calls
 * 2. REDUCE LOAD: Less requests to Mayan = faster for everyone
 * 3. COST: AI summaries are expensive, cache them for 24h
 * 4. PERSISTENCE: Survives backend restarts (unlike in-memory Map)
 */

const { redis } = require('./redisClient');

// Cache TTL values in seconds - OPTIMIZED for performance
const CACHE_TTL = {
  DOCUMENT_LIST: 300,     // 5 minutes - reasonable refresh rate
  DOCUMENT_DETAIL: 600,   // 10 minutes - document details are stable
  OCR_TEXT: 3600,         // 1 hour - OCR doesn't change once complete
  OCR_STATUS: 60,         // 1 minute - cheap status cache to speed up document open
  AI_SUMMARY: 86400,      // 24 hours - AI summaries are expensive to generate
  PREVIEW: 3600,          // 1 hour - preview content cached for faster viewing
  THUMBNAIL: 7200,        // 2 hours - thumbnails rarely change
  CABINETS: 600,          // 10 minutes - cabinet structure is stable
  AUTH_FALLBACK: 3600,    // 1 hour - cache auth method decision
  DOCUMENT_TYPES: 600,    // 10 minutes - document types rarely change
  TAGS: 600,              // 10 minutes - tags list is stable
  PAGES: 30,              // 30 seconds - short TTL for OCR polling (reduces API calls)
};

/**
 * Get cached value
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} - Parsed JSON value or null if not found
 */
async function get(key) {
  try {
    const data = await redis.get(key);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error(`[Cache] Error getting ${key}:`, error.message);
    return null;
  }
}

/**
 * Set cached value with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache (will be JSON stringified)
 * @param {number} ttlSeconds - Time to live in seconds
 */
async function set(key, value, ttlSeconds) {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
    // Only log SET for debugging when needed
    // console.log(`[Cache] SET: ${key} (TTL: ${ttlSeconds}s)`);
  } catch (error) {
    console.error(`[Cache] Error setting ${key}:`, error.message);
  }
}

/**
 * Delete a cached value
 * @param {string} key - Cache key
 */
async function del(key) {
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`[Cache] Error deleting ${key}:`, error.message);
  }
}

/**
 * Delete all keys matching a pattern
 * Used for cache invalidation (e.g., after document upload)
 * @param {string} pattern - Redis key pattern (e.g., "cache:documents:*")
 */
async function invalidatePattern(pattern) {
  try {
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = nextCursor;

      if (keys && keys.length > 0) {
        deleted += await redis.del(...keys);
      }
    } while (cursor !== '0');

    if (deleted > 0) {
      console.log(`[Cache] INVALIDATE: ${pattern} (${deleted} keys)`);
    }
  } catch (error) {
    console.error(`[Cache] Error invalidating ${pattern}:`, error.message);
  }
}

/**
 * Get cache statistics
 * @returns {Promise<object>} - Cache stats
 */
async function getStats() {
  try {
    const info = await redis.info('memory');
    const keys = await redis.dbsize();
    return {
      keyCount: keys,
      memoryInfo: info
    };
  } catch (error) {
    console.error('[Cache] Error getting stats:', error.message);
    return { error: error.message };
  }
}

// Cache key generators for consistency
const cacheKeys = {
  documentList: (page, limit) => `cache:documents:list:${page}:${limit}`,
  document: (id) => `cache:document:${id}`,
  ocr: (documentId) => `cache:ocr:${documentId}`,
  ocrStatus: (documentId) => `cache:ocr_status:${documentId}`,
  aiSummary: (documentId, textHash) => `cache:ai:${documentId}:${textHash}`,
  preview: (documentId) => `cache:preview:${documentId}`,
  thumbnail: (documentId, size) => `cache:thumbnail:${documentId}:${size || 'default'}`,
  cabinets: () => 'cache:cabinets:all',
  cabinetDocuments: (cabinetId, page, limit) => `cache:cabinets:${cabinetId}:documents:${page}:${limit}`,
  documentTypes: () => 'cache:document_types',
  tags: () => 'cache:tags',
  pages: (documentId, versionId) => `cache:pages:${documentId}:${versionId}`,
};

/**
 * Set binary/Buffer data in cache (for previews/thumbnails)
 * @param {string} key - Cache key
 * @param {Buffer} buffer - Binary data
 * @param {string} contentType - MIME type
 * @param {number} ttlSeconds - Time to live in seconds
 */
async function setBinary(key, buffer, contentType, ttlSeconds) {
  try {
    const data = {
      data: buffer.toString('base64'),
      contentType,
      cached: true
    };
    await redis.setex(key, ttlSeconds, JSON.stringify(data));
    console.log(`[Cache] SET BINARY: ${key} (${buffer.length} bytes, TTL: ${ttlSeconds}s)`);
  } catch (error) {
    console.error(`[Cache] Error setting binary ${key}:`, error.message);
  }
}

/**
 * Get binary/Buffer data from cache
 * @param {string} key - Cache key
 * @returns {Promise<{buffer: Buffer, contentType: string}|null>}
 */
async function getBinary(key) {
  try {
    const data = await redis.get(key);
    if (data) {
      const parsed = JSON.parse(data);
      console.log(`[Cache] HIT BINARY: ${key}`);
      return {
        buffer: Buffer.from(parsed.data, 'base64'),
        contentType: parsed.contentType,
        cached: true
      };
    }
    console.log(`[Cache] MISS BINARY: ${key}`);
    return null;
  } catch (error) {
    console.error(`[Cache] Error getting binary ${key}:`, error.message);
    return null;
  }
}

module.exports = {
  get,
  set,
  del,
  getBinary,
  setBinary,
  invalidatePattern,
  getStats,
  cacheKeys,
  CACHE_TTL
};
