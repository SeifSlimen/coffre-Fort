// Smoke test: upload a minimal DOCX and verify page preview endpoints.
// Usage: node scripts/docx_preview_smoke_test.js

function crc32(buf) {
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function dosDateTime(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const min = date.getMinutes();
  const sec = Math.floor(date.getSeconds() / 2);

  const dosTime = (hour << 11) | (min << 5) | sec;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n & 0xffff, 0);
  return b;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function buildZipStore(entries) {
  // entries: [{ name: 'path', data: Buffer }]
  const now = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];

  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const dataBuf = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const crc = crc32(dataBuf);

    // Local file header
    const localHeader = Buffer.concat([
      u32(0x04034b50), // signature
      u16(20), // version needed
      u16(0), // flags
      u16(0), // compression (store)
      u16(now.dosTime),
      u16(now.dosDate),
      u32(crc),
      u32(dataBuf.length),
      u32(dataBuf.length),
      u16(nameBuf.length),
      u16(0), // extra len
      nameBuf
    ]);

    localParts.push(localHeader, dataBuf);

    // Central directory header
    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20), // version made by
      u16(20), // version needed
      u16(0), // flags
      u16(0), // compression
      u16(now.dosTime),
      u16(now.dosDate),
      u32(crc),
      u32(dataBuf.length),
      u32(dataBuf.length),
      u16(nameBuf.length),
      u16(0), // extra
      u16(0), // comment
      u16(0), // disk
      u16(0), // int attrs
      u32(0), // ext attrs
      u32(offset),
      nameBuf
    ]);

    centralParts.push(centralHeader);

    offset += localHeader.length + dataBuf.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const centralOffset = offset;
  const centralSize = centralDir.length;

  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(centralOffset),
    u16(0)
  ]);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

function tinyDocxBuffer() {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>DOCX smoke test</w:t></w:r>
    </w:p>
    <w:sectPr />
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const entries = [
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, 'utf8') },
    { name: "_rels/.rels", data: Buffer.from(rels, 'utf8') },
    { name: "word/document.xml", data: Buffer.from(documentXml, 'utf8') }
  ];

  return buildZipStore(entries);
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

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const token = await getToken();
  const authHeader = { Authorization: `Bearer ${token}` };

  const form = new FormData();
  const docxBuf = tinyDocxBuffer();

  // Node 18+ has Blob
  const blob = new Blob([docxBuf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  form.append('file', blob, 'smoke.docx');
  form.append('title', 'Smoke DOCX Preview');
  form.append('description', 'DOCX preview smoke test');

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
  console.log(JSON.stringify({ uploaded: uploadJson }, null, 2));

  // Poll for pages
  const started = Date.now();
  const timeoutMs = 4 * 60 * 1000;

  let pages = [];
  let lastError = null;

  while (Date.now() - started < timeoutMs) {
    try {
      const pagesRes = await fetch(`http://localhost:5000/api/documents/${documentId}/pages`, { headers: authHeader });
      const pagesJson = await pagesRes.json();

      if (!pagesRes.ok) {
        lastError = pagesJson;
      } else {
        pages = pagesJson.pages || [];
        if (pages.length > 0) break;
      }
    } catch (e) {
      lastError = { error: String(e) };
    }

    process.stdout.write('.');
    await sleep(5000);
  }

  console.log('');

  if (!pages || pages.length === 0) {
    throw new Error(`Pages not ready within timeout for document ${documentId}. Last error: ${JSON.stringify(lastError)}`);
  }

  const pageId = pages[0].id;
  const imgRes = await fetch(`http://localhost:5000/api/documents/${documentId}/pages/${pageId}/image`, { headers: authHeader });
  if (!imgRes.ok) {
    const t = await imgRes.text();
    throw new Error(`Page image fetch failed (${imgRes.status}): ${t}`);
  }

  const contentType = imgRes.headers.get('content-type');
  const buf = Buffer.from(await imgRes.arrayBuffer());

  console.log(
    JSON.stringify(
      {
        documentId,
        pagesCount: pages.length,
        firstPageId: pageId,
        image: { contentType, bytes: buf.length, signatureHex: buf.slice(0, 8).toString('hex') }
      },
      null,
      2
    )
  );

  if (!contentType || !contentType.startsWith('image/')) {
    throw new Error(`Expected image/* content-type, got: ${contentType}`);
  }
  if (buf.length < 100) {
    // Docx preview images should be non-trivial; a too-small buffer often indicates an error payload.
    throw new Error(`Image payload too small (${buf.length} bytes).`);
  }

  console.log('OK: DOCX preview smoke test passed');
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
