// Smoke test: verify AI summary endpoint works when OCR text exists.
// Run from repo root:
//   cd backend
//   node tests/ai_summary_smoke_test.js
//
// This script:
// 1) Obtains an admin token from Keycloak
// 2) Lists documents
// 3) Finds the first document that has OCR text available
// 4) Calls the explicit AI summary endpoint
//
// Requirements:
// - docker-compose stack running
// - at least one document with OCR text already available

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8081';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function getAdminToken() {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'coffre-fort-backend',
    username: 'admin@test.com',
    password: 'admin123'
  });

  const res = await fetch(`${KEYCLOAK_URL}/realms/coffre-fort/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Admin token failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function listDocuments(token) {
  const res = await fetch(`${BACKEND_URL}/api/documents?page=1&limit=10`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`List documents failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.documents || [];
}

async function tryGetOcrStatus(token, documentId) {
  // Hit the explicit OCR endpoint, which returns status + ocrText (or null)
  const res = await fetch(`${BACKEND_URL}/api/ai/ocr/${documentId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`OCR check failed (${res.status}) for doc ${documentId}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function generateSummary(token, documentId) {
  // AI generation can take 60-120s on CPU; use AbortController for 180s timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);

  console.log('  (waiting for AI model response – this may take up to 3 minutes)');

  try {
    const res = await fetch(`${BACKEND_URL}/api/ai/summary/${documentId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ forceRefresh: true }),
      signal: controller.signal
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(`AI summary failed (${res.status}) for doc ${documentId}: ${JSON.stringify(json)}`);
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log('=== AI Summary Smoke Test ===');
  console.log(`Keycloak: ${KEYCLOAK_URL}`);
  console.log(`Backend:  ${BACKEND_URL}`);

  const token = await getAdminToken();
  console.log('✓ Got admin token');

  const docs = await listDocuments(token);
  console.log(`✓ Listed ${docs.length} documents`);

  if (docs.length === 0) {
    console.log('No documents found. Upload a document and wait for OCR, then re-run.');
    process.exit(0);
  }

  let chosen = null;
  for (const doc of docs) {
    const id = doc.id;
    const ocr = await tryGetOcrStatus(token, id);

    if (ocr.status === 'processing') {
      console.log(`- doc ${id}: OCR processing`);
      continue;
    }

    if (ocr.status === 'empty' || !ocr.ocrText || !String(ocr.ocrText).trim()) {
      console.log(`- doc ${id}: no OCR text`);
      continue;
    }

    console.log(`✓ doc ${id}: OCR text available (${String(ocr.ocrText).length} chars)`);
    chosen = id;
    break;
  }

  if (!chosen) {
    console.log('No document with OCR text found in first page of results.');
    console.log('Tip: upload a PDF with selectable text, wait for OCR completion, then re-run.');
    process.exit(0);
  }

  const summary = await generateSummary(token, chosen);

  if (!summary.success || !summary.summary) {
    throw new Error(`Unexpected AI response: ${JSON.stringify(summary)}`);
  }

  console.log('✓ AI summary generated');
  console.log(`Document: ${chosen}`);
  console.log(`Summary (preview): ${String(summary.summary).slice(0, 200)}...`);
  console.log(`Keywords: ${(summary.keywords || []).join(', ')}`);
  console.log('=== OK ===');
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
