const express = require('express');
const cors = require('cors');
const http = require('http');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const aiRoutes = require('./routes/ai');
const adminRoutes = require('./routes/admin');
const auditRoutes = require('./routes/audit');

// Services
const websocketService = require('./services/websocketService');
const ocrPollingService = require('./services/ocrPollingService');

const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server for both Express and Socket.io
const server = http.createServer(app);

// Initialize WebSocket
websocketService.initialize(server);

// OCR polling service: Do NOT start loop on boot - it auto-starts when documents are added
// This saves CPU when no documents need OCR polling
console.log('[Server] OCR polling service ready (will start when documents need polling)');

// Middleware
app.use(cors({
  origin: true, // Allow all origins (or specify http://localhost:3000)
  credentials: true,
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'coffre-fort-backend',
    websocket: websocketService.isInitialized(),
    timestamp: new Date().toISOString()
  });
});

// WebSocket status endpoint
app.get('/api/websocket/status', (req, res) => {
  res.json(websocketService.getStats());
});

// OCR polling status endpoint
app.get('/api/ocr-polling/status', async (req, res) => {
  res.json(await ocrPollingService.getStatus());
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/audit', auditRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Use server.listen instead of app.listen for WebSocket support
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`WebSocket server initialized`);
  console.log(`OCR polling service started`);
});

