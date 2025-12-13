/**
 * WebSocket Service
 * 
 * Provides real-time notifications via Socket.io:
 * - OCR completion notifications
 * - User-specific notifications
 * - Document update broadcasts
 * 
 * Uses Redis pub/sub for multi-instance support.
 * 
 * ARCHITECTURE:
 * ┌──────────┐   WebSocket    ┌──────────┐   Redis Pub/Sub   ┌───────┐
 * │ Frontend │◄──────────────►│ Backend  │◄─────────────────►│ Redis │
 * └──────────┘                └──────────┘                   └───────┘
 */

const { Server } = require('socket.io');
const { redis, redisPubSub } = require('./redisClient');

let io = null;
const connectedUsers = new Map(); // userId -> Set of socket IDs

/**
 * Initialize WebSocket server
 * @param {http.Server} httpServer - HTTP server instance
 * @returns {Server} - Socket.io server instance
 */
function initialize(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    },
    // Connection settings
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.on('connection', (socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);
    
    // Join user-specific room
    socket.on('join', (userId) => {
      if (!userId) return;
      
      socket.join(`user:${userId}`);
      socket.userId = userId;
      
      // Track connected users
      if (!connectedUsers.has(userId)) {
        connectedUsers.set(userId, new Set());
      }
      connectedUsers.get(userId).add(socket.id);
      
      console.log(`[WebSocket] User ${userId} joined (socket: ${socket.id})`);
      
      // Send confirmation
      socket.emit('joined', { userId, socketId: socket.id });
    });
    
    // Subscribe to document OCR updates
    socket.on('subscribe:ocr', (documentId) => {
      if (!documentId) return;
      
      socket.join(`ocr:${documentId}`);
      console.log(`[WebSocket] Socket ${socket.id} subscribed to OCR updates for document ${documentId}`);
      
      // Confirm subscription
      socket.emit('subscribed:ocr', { documentId });
    });
    
    // Unsubscribe from document OCR updates
    socket.on('unsubscribe:ocr', (documentId) => {
      if (!documentId) return;
      
      socket.leave(`ocr:${documentId}`);
      console.log(`[WebSocket] Socket ${socket.id} unsubscribed from OCR updates for document ${documentId}`);
    });
    
    // Subscribe to document updates
    socket.on('subscribe:document', (documentId) => {
      if (!documentId) return;
      
      socket.join(`document:${documentId}`);
      console.log(`[WebSocket] Socket ${socket.id} subscribed to updates for document ${documentId}`);
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
      
      // Clean up user tracking
      if (socket.userId && connectedUsers.has(socket.userId)) {
        connectedUsers.get(socket.userId).delete(socket.id);
        if (connectedUsers.get(socket.userId).size === 0) {
          connectedUsers.delete(socket.userId);
        }
      }
    });
    
    // Handle errors
    socket.on('error', (error) => {
      console.error(`[WebSocket] Socket error (${socket.id}):`, error.message);
    });
  });

  // Set up Redis pub/sub for multi-instance support
  setupRedisPubSub();

  console.log('[WebSocket] Server initialized');
  return io;
}

/**
 * Set up Redis pub/sub for broadcasting across instances
 */
function setupRedisPubSub() {
  // Subscribe to channels
  redisPubSub.subscribe('ocr:complete', 'ocr:status', 'document:update', 'user:notification', (err) => {
    if (err) {
      console.error('[WebSocket] Redis subscribe error:', err);
    } else {
      console.log('[WebSocket] Subscribed to Redis pub/sub channels');
    }
  });

  // Handle incoming messages
  redisPubSub.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message);
      
      switch (channel) {
        case 'ocr:complete':
          if (io) {
            io.to(`ocr:${data.documentId}`).emit('ocr:complete', data);
            console.log(`[WebSocket] Broadcasted OCR complete for document ${data.documentId}`);
          }
          break;

        case 'ocr:status':
          if (io) {
            io.to(`ocr:${data.documentId}`).emit('ocr:status', data);
          }
          break;
          
        case 'document:update':
          if (io) {
            io.to(`document:${data.documentId}`).emit('document:update', data);
          }
          break;
          
        case 'user:notification':
          if (io && data.userId) {
            io.to(`user:${data.userId}`).emit('notification', data);
          }
          break;
      }
    } catch (error) {
      console.error('[WebSocket] Error processing pub/sub message:', error.message);
    }
  });
}

/**
 * Notify that OCR processing is complete
 * @param {string|number} documentId - Document ID
 * @param {string} ocrText - Extracted OCR text (optional, can be truncated)
 */
function notifyOCRComplete(documentId, ocrText = null) {
  const data = {
    documentId: String(documentId),
    status: 'complete',
    timestamp: new Date().toISOString(),
    hasText: !!ocrText && ocrText.length > 0,
    textPreview: ocrText ? ocrText.substring(0, 200) : null
  };
  
  // Emit locally
  if (io) {
    io.to(`ocr:${documentId}`).emit('ocr:complete', data);
  }
  
  // Publish to Redis for other instances
  redis.publish('ocr:complete', JSON.stringify(data));
  
  console.log(`[WebSocket] OCR complete notification sent for document ${documentId}`);
}

/**
 * Notify OCR status/progress updates.
 * @param {string|number} documentId - Document ID
 * @param {'started'|'processing'|'timeout'|'complete'} status - Status value
 * @param {object} details - Additional details (attempts, elapsed, etc.)
 */
function notifyOCRStatus(documentId, status, details = {}) {
  const data = {
    documentId: String(documentId),
    status,
    timestamp: new Date().toISOString(),
    ...details
  };

  if (io) {
    io.to(`ocr:${documentId}`).emit('ocr:status', data);
  }

  redis.publish('ocr:status', JSON.stringify(data));
}

/**
 * Notify a specific user
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
function notifyUser(userId, event, data) {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...data
  };
  
  // Emit locally
  if (io) {
    io.to(`user:${userId}`).emit(event, payload);
  }
  
  // Publish to Redis
  redis.publish('user:notification', JSON.stringify({ userId, ...payload }));
  
  console.log(`[WebSocket] Notification sent to user ${userId}: ${event}`);
}

/**
 * Notify about document update
 * @param {string|number} documentId - Document ID
 * @param {string} updateType - Type of update (e.g., 'metadata', 'file', 'deleted')
 * @param {object} details - Update details
 */
function notifyDocumentUpdate(documentId, updateType, details = {}) {
  const data = {
    documentId: String(documentId),
    updateType,
    timestamp: new Date().toISOString(),
    ...details
  };
  
  // Emit locally
  if (io) {
    io.to(`document:${documentId}`).emit('document:update', data);
  }
  
  // Publish to Redis
  redis.publish('document:update', JSON.stringify(data));
  
  console.log(`[WebSocket] Document update notification sent: ${documentId} (${updateType})`);
}

/**
 * Get connection statistics
 * @returns {object} - Connection stats
 */
function getStats() {
  if (!io) {
    return { initialized: false };
  }
  
  return {
    initialized: true,
    totalConnections: io.engine.clientsCount,
    connectedUsers: connectedUsers.size,
    userDetails: Array.from(connectedUsers.entries()).map(([userId, sockets]) => ({
      userId,
      socketCount: sockets.size
    }))
  };
}

/**
 * Check if WebSocket is initialized
 * @returns {boolean}
 */
function isInitialized() {
  return io !== null;
}

/**
 * Get the Socket.io server instance
 * @returns {Server|null}
 */
function getIO() {
  return io;
}

module.exports = {
  initialize,
  notifyOCRComplete,
  notifyOCRStatus,
  notifyUser,
  notifyDocumentUpdate,
  getStats,
  isInitialized,
  getIO
};
