/**
 * Redis Client Service
 * 
 * Provides a centralized Redis connection for:
 * - Access control grants (with auto-expiration)
 * - Document metadata caching
 * - AI summary caching
 * - WebSocket pub/sub for OCR notifications
 * 
 * WHY REDIS?
 * ----------
 * 1. PERSISTENCE: Data survives container restarts (unlike in-memory Map)
 * 2. TTL (Time-To-Live): Redis automatically deletes expired data
 * 3. SPEED: In-memory storage, ~0.1ms reads (vs 10-50ms for database)
 * 4. PUB/SUB: Built-in messaging for real-time WebSocket events
 * 5. ALREADY RUNNING: Mayan uses Redis, so no extra infrastructure
 */

const Redis = require('ioredis');

// Connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  
  // Retry strategy for reconnection
  retryStrategy: (times) => {
    if (times > 10) {
      console.error('[Redis] Max retries reached, giving up');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 100, 3000);
    console.log(`[Redis] Reconnecting in ${delay}ms... (attempt ${times})`);
    return delay;
  },
  
  // Don't block forever on failed requests
  maxRetriesPerRequest: 3,
  
  // Enable offline queue (buffer commands while disconnected)
  enableOfflineQueue: true,
  
  // Connection timeout
  connectTimeout: 10000,
};

// Main Redis client for general operations
const redis = new Redis(redisConfig);

// Separate client for pub/sub (required by ioredis)
const redisPubSub = new Redis(redisConfig);

// Connection event handlers
redis.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

redis.on('ready', () => {
  console.log('[Redis] Ready to accept commands');
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('close', () => {
  console.log('[Redis] Connection closed');
});

redis.on('reconnecting', () => {
  console.log('[Redis] Reconnecting...');
});

/**
 * Non-blocking SCAN helper to replace redis.keys()
 * KEYS is O(N) and blocks Redis - SCAN is incremental and non-blocking
 * 
 * @param {string} pattern - Redis key pattern (e.g., 'grant:*')
 * @param {number} count - Hint for how many keys to return per iteration (default 100)
 * @returns {Promise<string[]>} - Array of matching keys
 */
async function scanKeys(pattern, count = 100) {
  const keys = [];
  let cursor = '0';
  
  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    cursor = nextCursor;
    if (batch && batch.length > 0) {
      keys.push(...batch);
    }
  } while (cursor !== '0');
  
  return keys;
}

/**
 * Batch GET using pipeline (much faster than serial gets)
 * @param {string[]} keys - Array of keys to fetch
 * @returns {Promise<Array<{key: string, value: string|null}>>} - Array of key-value pairs
 */
async function mgetParsed(keys) {
  if (!keys || keys.length === 0) return [];
  
  const pipeline = redis.pipeline();
  keys.forEach(key => pipeline.get(key));
  const results = await pipeline.exec();
  
  return results.map(([err, value], i) => ({
    key: keys[i],
    value: err ? null : value
  }));
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Redis] Shutting down...');
  await redis.quit();
  await redisPubSub.quit();
});

module.exports = {
  redis,
  redisPubSub,
  scanKeys,
  mgetParsed
};
