// Smoke test: upload a PNG with cabinetPath + docType + tags, then confirm placement.
// Usage: node scripts/upload_place_smoke_test.js

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

async function main() {
  const token = await getToken();
  const authHeader = { Authorization: `Bearer ${token}` };

  // Fetch options
  const [typesRes, tagsRes] = await Promise.all([
    fetch('http://localhost:5000/api/documents/types', { headers: authHeader }),
    fetch('http://localhost:5000/api/documents/tags/all', { headers: authHeader })
  ]);

  const typesJson = await typesRes.json();
  const tagsJson = await tagsRes.json();

  const documentTypeId = (typesJson.types && typesJson.types[0] && typesJson.types[0].id) || null;
  const tagId = (tagsJson.tags && tagsJson.tags[0] && tagsJson.tags[0].id) || null;

  const cabinetPath = 'Finance/Invoices/2025';

  // Build upload multipart
  const form = new FormData();
  const pngBuf = tinyPngBuffer();

  let filePart;
  if (typeof File !== 'undefined') {
    filePart = new File([pngBuf], 'smoke.png', { type: 'image/png' });
    form.append('file', filePart);
  } else {
    const blob = new Blob([pngBuf], { type: 'image/png' });
    form.append('file', blob, 'smoke.png');
  }

  form.append('title', 'Smoke Upload - CabinetPath');
  form.append('description', 'Upload placement smoke test');
  form.append('cabinetPath', cabinetPath);
  if (documentTypeId) form.append('documentTypeId', String(documentTypeId));
  if (tagId) form.append('tagIds', JSON.stringify([tagId]));

  const uploadRes = await fetch('http://localhost:5000/api/documents/upload', {
    method: 'POST',
    headers: authHeader,
    body: form
  });

  const uploadJson = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error(`Upload failed (${uploadRes.status}): ${JSON.stringify(uploadJson)}`);
  }

  const documentId = uploadJson.id;
  const destCabinetId = uploadJson.cabinet?.id;

  // Verify cabinet placement using admin cabinet docs endpoint
  let cabinetDocs = null;
  if (destCabinetId) {
    const cabinetDocsRes = await fetch(`http://localhost:5000/api/admin/cabinets/${destCabinetId}/documents?page=1&limit=50`, {
      headers: authHeader
    });
    cabinetDocs = await cabinetDocsRes.json();
    if (!cabinetDocsRes.ok) {
      throw new Error(`Cabinet docs fetch failed (${cabinetDocsRes.status}): ${JSON.stringify(cabinetDocs)}`);
    }
  }

  // Verify document type echoed in document details
  const docRes = await fetch(`http://localhost:5000/api/documents/${documentId}`, { headers: authHeader });
  const docJson = await docRes.json();
  if (!docRes.ok) {
    throw new Error(`Doc details failed (${docRes.status}): ${JSON.stringify(docJson)}`);
  }

  // Verify tags
  const docTagsRes = await fetch(`http://localhost:5000/api/documents/${documentId}/tags`, { headers: authHeader });
  const docTagsJson = await docTagsRes.json();

  console.log(
    JSON.stringify(
      {
        uploaded: uploadJson,
        verify: {
          cabinetPath,
          destinationCabinetId: destCabinetId,
          cabinetContainsDocument:
            !!destCabinetId &&
            Array.isArray(cabinetDocs?.documents) &&
            cabinetDocs.documents.some((d) => String(d.id) === String(documentId)),
          documentType: { id: docJson.documentTypeId, label: docJson.documentType },
          tagCount: Array.isArray(docTagsJson?.tags) ? docTagsJson.tags.length : null
        }
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
