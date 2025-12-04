# Setup Instructions

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine + Docker Compose (Linux)
- At least 8GB RAM recommended
- 10GB free disk space

## Quick Start

1. **Clone or download the project**

2. **Start all services:**
   ```bash
   docker-compose up -d
   ```

3. **Wait for services to start** (2-3 minutes):
   - Keycloak: http://localhost:8080
   - Mayan EDMS: http://localhost:8000
   - Backend: http://localhost:5000
   - Frontend: http://localhost:3000

4. **Pull Ollama model** (required for AI features):
   ```bash
   # Windows PowerShell
   .\scripts\pull-ollama-model.ps1
   
   # Linux/Mac
   chmod +x scripts/pull-ollama-model.sh
   ./scripts/pull-ollama-model.sh
   ```

5. **Configure Keycloak** (if realm import didn't work):
   - Access http://localhost:8080
   - Login with admin/admin
   - Create realm: `coffre-fort`
   - Create clients: `coffre-fort-backend` and `coffre-fort-frontend`
   - Create roles: `admin`, `user`
   - Create test users:
     - admin@test.com / admin123 (with admin role)
     - user@test.com / user123 (with user role)

6. **Configure Mayan EDMS**:
   - Access http://localhost:8000
   - Login with admin/admin
   - Create API token for backend (Settings → API)
   - Enable OCR workflow

7. **Access the application:**
   - Open http://localhost:3000
   - Login with test credentials

## Manual Configuration

### Keycloak Setup

1. Access Keycloak Admin Console: http://localhost:8080
2. Login: admin / admin
3. Create Realm:
   - Click "Create Realm"
   - Name: `coffre-fort`
4. Create Client (Backend):
   - Clients → Create Client
   - Client ID: `coffre-fort-backend`
   - Client Protocol: `openid-connect`
   - Access Type: `public`
   - Valid Redirect URIs: `http://localhost:3000/*`, `http://localhost:5000/*`
   - Web Origins: `http://localhost:3000`, `http://localhost:5000`
5. Create Client (Frontend):
   - Same as above, Client ID: `coffre-fort-frontend`
6. Create Roles:
   - Realm Roles → Create Role
   - Roles: `admin`, `user`
7. Create Users:
   - Users → Add User
   - Username: `admin@test.com`
   - Email: `admin@test.com`
   - Credentials → Set Password: `admin123`
   - Role Mappings → Assign `admin` and `user` roles
   - Repeat for `user@test.com` with only `user` role

### Mayan EDMS Setup

1. Access Mayan: http://localhost:8000
2. Login: admin / admin
3. Create API Token:
   - Settings → REST API → API Tokens
   - Create Token
   - Copy token (update backend .env if needed)
4. Enable OCR:
   - Documents → Document Types
   - Create or edit document type
   - Enable OCR workflow

## Troubleshooting

### Services Not Starting

```bash
# Check service status
docker ps

# Check logs
docker logs coffre-fort-backend
docker logs coffre-fort-frontend
docker logs coffre-fort-keycloak
docker logs coffre-fort-mayan
docker logs coffre-fort-ollama
```

### Keycloak Not Accessible

- Wait 60 seconds for Keycloak to fully start
- Check: `docker logs coffre-fort-keycloak`
- Verify database connection

### Mayan Not Processing OCR

- Check Celery workers: `docker logs coffre-fort-mayan`
- Manually trigger OCR in Mayan UI
- Wait 30-60 seconds after upload

### AI Service Not Working

- Verify Ollama model is pulled: `docker exec coffre-fort-ollama ollama list`
- Check Ollama logs: `docker logs coffre-fort-ollama`
- Pull model manually: `docker exec coffre-fort-ollama ollama pull llama3.2:1b`

### Frontend Not Loading

- Check backend is running: `curl http://localhost:5000/health`
- Check browser console for errors
- Verify environment variables in frontend/.env

### Port Conflicts

If ports are already in use, modify `docker-compose.yml`:
- Change port mappings (e.g., `3001:3000`)

## Development Mode

### Backend Development

```bash
cd backend
npm install
npm run dev
```

### Frontend Development

```bash
cd frontend
npm install
npm start
```

## Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v
```

## Reset Everything

```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v

# Remove images (optional)
docker-compose down --rmi all

# Start fresh
docker-compose up -d
```

## Next Steps

- See `docs/TESTING.md` for testing guide
- See `docs/DEMO.md` for demo script
- See `docs/API.md` for API documentation

