# Setup

## Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux)
- 8GB RAM minimum (12GB recommended)
- Optional: NVIDIA GPU + NVIDIA Container Toolkit (for faster Ollama)

## Start (Local)

From the repo root:

```bash
docker-compose up -d
```

Pull an Ollama model (required for AI summaries):

```bash
docker exec coffre-fort-ollama ollama pull llama3.2:3b
```

## URLs

- App: http://localhost:3000
- Backend: http://localhost:5000
- Mayan: http://localhost:8000
- Keycloak: http://localhost:8081

## Mayan Admin Password Drift (If DB Volume Reused)

If Mayan admin credentials get out of sync with `docker-compose.yml`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ensure_mayan_admin_password.ps1
```

## Smoke Tests

From the repo root:

```bash
cd backend
npm install

# Upload + cabinet placement
node tests/upload_place_smoke_test.js

# Cabinet browse
node tests/cabinet_smoke_test.js

# DOCX preview pages/images
node tests/docx_preview_smoke_test.js

# WebSocket OCR progress
node tests/ws_ocr_progress_smoke_test.js

# AI summary (requires at least one document with OCR text)
node tests/ai_summary_smoke_test.js
```

## Production Notes (Important)

If users access the UI from another machine/hostname, you must set browser-visible URLs:

- Frontend build-time:
  - `REACT_APP_API_URL` (example: `https://app.yourdomain.com` or `https://api.yourdomain.com`)
  - `REACT_APP_KEYCLOAK_URL`
  - `REACT_APP_MAYAN_URL` (fixes “Mayan doesn’t open” when not on localhost)
- Docker runtime:
  - `OIDC_OP_AUTHORIZATION_ENDPOINT` (must be browser-accessible Keycloak URL)
  - `FRONTEND_URL` (backend CORS/WebSocket)
