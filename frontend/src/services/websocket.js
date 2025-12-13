/**
 * WebSocket Service (Frontend)
 * 
 * Manages Socket.io connection to backend for real-time updates:
 * - OCR completion notifications
 * - Document updates
 * - User-specific notifications
 */

import { io } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

const statusListeners = new Set();

function emitStatus(event, details = {}) {
  const payload = {
    connected: socket?.connected || false,
    event,
    timestamp: new Date().toISOString(),
    ...details
  };

  statusListeners.forEach((cb) => {
    try {
      cb(payload);
    } catch (e) {
      // ignore listener errors
    }
  });
}

/**
 * Connect to WebSocket server
 * @param {string} userId - User ID to join user-specific room
 * @returns {Socket} - Socket.io client instance
 */
export function connect(userId) {
  if (socket?.connected) {
    console.log('[WebSocket] Already connected');
    return socket;
  }
  
  console.log('[WebSocket] Connecting to', SOCKET_URL);
  
  socket = io(SOCKET_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });
  
  socket.on('connect', () => {
    console.log('[WebSocket] Connected:', socket.id);
    reconnectAttempts = 0;

    emitStatus('connect', { socketId: socket.id });
    
    // Join user-specific room
    if (userId) {
      socket.emit('join', userId);
    }
  });
  
  socket.on('joined', (data) => {
    console.log('[WebSocket] Joined room:', data);
  });
  
  socket.on('disconnect', (reason) => {
    console.log('[WebSocket] Disconnected:', reason);

    emitStatus('disconnect', { reason });
  });
  
  socket.on('connect_error', (error) => {
    console.error('[WebSocket] Connection error:', error.message);
    reconnectAttempts++;

    emitStatus('connect_error', { message: error.message });
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[WebSocket] Max reconnect attempts reached');
    }
  });
  
  socket.on('reconnect', (attemptNumber) => {
    console.log('[WebSocket] Reconnected after', attemptNumber, 'attempts');
    reconnectAttempts = 0;

    emitStatus('reconnect', { attemptNumber, socketId: socket?.id });
    
    // Re-join user room after reconnect
    if (userId) {
      socket.emit('join', userId);
    }
  });
  
  return socket;
}

/**
 * Subscribe to connection status updates.
 * @param {(status: {connected: boolean, event: string, timestamp: string}) => void} callback
 * @returns {() => void}
 */
export function subscribeToConnectionStatus(callback) {
  if (typeof callback !== 'function') return () => {};
  statusListeners.add(callback);

  // Emit current status immediately
  callback({
    connected: socket?.connected || false,
    event: 'status',
    timestamp: new Date().toISOString(),
    socketId: socket?.id || null
  });

  return () => {
    statusListeners.delete(callback);
  };
}

/**
 * Subscribe to OCR completion updates for a document
 * @param {string|number} documentId - Document ID to subscribe to
 * @param {function} callback - Callback when OCR completes
 * @returns {function} - Unsubscribe function
 */
export function subscribeToOCR(documentId, callback) {
  if (!socket) {
    console.error('[WebSocket] Not connected. Call connect() first.');
    return () => {};
  }
  
  const docId = String(documentId);
  
  // Subscribe to OCR updates for this document
  socket.emit('subscribe:ocr', docId);
  console.log('[WebSocket] Subscribed to OCR updates for document', docId);
  
  // Listen for OCR complete event
  const handler = (data) => {
    if (String(data.documentId) === docId) {
      console.log('[WebSocket] OCR complete for document', docId, data);
      callback(data);
    }
  };
  
  socket.on('ocr:complete', handler);
  
  // Return unsubscribe function
  return () => {
    socket.off('ocr:complete', handler);
    socket.emit('unsubscribe:ocr', docId);
    console.log('[WebSocket] Unsubscribed from OCR updates for document', docId);
  };
}

/**
 * Subscribe to OCR status/progress updates for a document
 * @param {string|number} documentId
 * @param {(data: any) => void} callback
 * @returns {() => void}
 */
export function subscribeToOCRStatus(documentId, callback) {
  if (!socket) {
    console.error('[WebSocket] Not connected. Call connect() first.');
    return () => {};
  }

  const docId = String(documentId);

  socket.emit('subscribe:ocr', docId);
  console.log('[WebSocket] Subscribed to OCR status updates for document', docId);

  const handler = (data) => {
    if (String(data.documentId) === docId) {
      callback(data);
    }
  };

  socket.on('ocr:status', handler);

  return () => {
    socket.off('ocr:status', handler);
    socket.emit('unsubscribe:ocr', docId);
    console.log('[WebSocket] Unsubscribed from OCR status updates for document', docId);
  };
}

/**
 * Subscribe to document updates
 * @param {string|number} documentId - Document ID to subscribe to
 * @param {function} callback - Callback when document updates
 * @returns {function} - Unsubscribe function
 */
export function subscribeToDocument(documentId, callback) {
  if (!socket) {
    console.error('[WebSocket] Not connected');
    return () => {};
  }
  
  const docId = String(documentId);
  
  socket.emit('subscribe:document', docId);
  
  const handler = (data) => {
    if (String(data.documentId) === docId) {
      callback(data);
    }
  };
  
  socket.on('document:update', handler);
  
  return () => {
    socket.off('document:update', handler);
  };
}

/**
 * Subscribe to user notifications
 * @param {function} callback - Callback for notifications
 * @returns {function} - Unsubscribe function
 */
export function subscribeToNotifications(callback) {
  if (!socket) {
    console.error('[WebSocket] Not connected');
    return () => {};
  }
  
  socket.on('notification', callback);
  
  return () => {
    socket.off('notification', callback);
  };
}

/**
 * Disconnect from WebSocket server
 */
export function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log('[WebSocket] Disconnected');

    emitStatus('disconnect');
  }
}

/**
 * Check if connected
 * @returns {boolean}
 */
export function isConnected() {
  return socket?.connected || false;
}

/**
 * Get socket instance
 * @returns {Socket|null}
 */
export function getSocket() {
  return socket;
}

export default {
  connect,
  disconnect,
  subscribeToOCR,
  subscribeToOCRStatus,
  subscribeToDocument,
  subscribeToNotifications,
  subscribeToConnectionStatus,
  isConnected,
  getSocket
};
