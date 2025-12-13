// Smoke test: create parent/child cabinets via backend and list them.
// Usage: node scripts/cabinet_smoke_test.js

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
  if (!json.access_token) {
    throw new Error(`No access_token in response: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function main() {
  const token = await getToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const parentRes = await fetch('http://localhost:5000/api/admin/cabinets', {
    method: 'POST',
    headers,
    body: JSON.stringify({ label: 'Finance', parentId: null })
  });
  const parentJson = await parentRes.json();
  if (!parentRes.ok) {
    throw new Error(`Parent create failed (${parentRes.status}): ${JSON.stringify(parentJson)}`);
  }
  const parentId = parentJson?.cabinet?.id;

  const childRes = await fetch('http://localhost:5000/api/admin/cabinets', {
    method: 'POST',
    headers,
    body: JSON.stringify({ label: 'Invoices', parentId })
  });
  const childJson = await childRes.json();
  if (!childRes.ok) {
    throw new Error(`Child create failed (${childRes.status}): ${JSON.stringify(childJson)}`);
  }
  const childId = childJson?.cabinet?.id;

  const listRes = await fetch('http://localhost:5000/api/admin/cabinets', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const listJson = await listRes.json();
  if (!listRes.ok) {
    throw new Error(`List failed (${listRes.status}): ${JSON.stringify(listJson)}`);
  }

  const subset = (listJson.cabinets || []).filter((c) => c.id === parentId || c.id === childId);
  console.log(JSON.stringify({ parentId, childId, subset }, null, 2));
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
