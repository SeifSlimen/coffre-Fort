// Smoke test (run from host): verifies WebSocket OCR progress emits `ocr:status`.
// Run from repo root:
//   cd backend
//   node tests/ws_ocr_progress_smoke_test.js

const { io } = require('socket.io-client');

function tinyPngBuffer() {
  // Valid 1x1 transparent PNG
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5c9WkAAAAASUVORK5CYII=';
  return Buffer.from(base64, 'base64');
}

async function getToken() {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'coffre-fort-backend',
    username: 'admin@test.com',
    password: 'admin123'
  });

  const res = await fetch('http://localhost:8081/realms/coffre-fort/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Token request failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function uploadPng(token) {
  const authHeader = { Authorization: `Bearer ${token}` };

  const form = new FormData();
  const pngBuf = tinyPngBuffer();
  const blob = new Blob([pngBuf], { type: 'image/png' });

  form.append('file', blob, 'ws_smoke.png');
  form.append('title', 'WS Smoke Upload');
  form.append('description', 'WebSocket OCR progress smoke test');

  const res = await fetch('http://localhost:5000/api/documents/upload', {
    method: 'POST',
    headers: authHeader,
    body: form
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}): ${JSON.stringify(json)}`);
  }

  return json.id;
}

async function main() {
  const token = await getToken();

  // Connect to socket.io server
  const socket = io('http://localhost:5000', {
    transports: ['websocket', 'polling'],
    reconnection: false
  });

  const result = {
    connected: false,
    documentId: null,
    receivedStatus: null,
    receivedComplete: null
  };

  const deadlineMs = Date.now() + 25000;

  const waitForConnect = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('WebSocket connect timeout')), 8000);
    socket.on('connect', () => {
      clearTimeout(t);
      result.connected = true;
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(t);
      reject(new Error(`WebSocket connect_error: ${err.message}`));
    });
  });

  await waitForConnect;

  // Upload, then subscribe to OCR room for that doc
  const documentId = await uploadPng(token);
  result.documentId = documentId;

  socket.emit('subscribe:ocr', String(documentId));

  socket.on('ocr:status', (data) => {
    if (String(data?.documentId) === String(documentId) && !result.receivedStatus) {
      result.receivedStatus = data;
    }
  });

  socket.on('ocr:complete', (data) => {
    if (String(data?.documentId) === String(documentId) && !result.receivedComplete) {
      result.receivedComplete = data;
    }
  });

  // Wait until we see at least one ocr:status, or time out.
  while (Date.now() < deadlineMs) {
    if (result.receivedStatus) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  socket.disconnect();

  if (!result.receivedStatus) {
    throw new Error(`Did not receive ocr:status for document ${documentId} within timeout`);
  }

  console.log(JSON.stringify(result, null, 2));
  console.log('OK: WebSocket OCR progress smoke test passed');
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
