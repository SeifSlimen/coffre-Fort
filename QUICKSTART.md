# Quick Start Guide

## Prerequisites (Windows)

Create `C:\Users\<YourUsername>\.wslconfig` for optimal memory:

```ini
[wsl2]
memory=12GB
processors=6
swap=4GB
```

Then run `wsl --shutdown` and restart Docker Desktop.

## One-Command Setup

```bash
# Start all services
docker-compose up -d

# Pull AI model (required - wait for download)
docker exec coffre-fort-ollama ollama pull llama3.2:3b
```

Wait 2-3 minutes for services to initialize.

## Access the Application

| Service | URL | Credentials |
|---------|-----|-------------|
| **Application** | http://localhost:3000 | admin@test.com / admin123 |
| **Keycloak Admin** | http://localhost:8081 | admin / admin |
| **Mayan EDMS** | http://localhost:8000 | admin / (see docker-compose.yml) |

## Test Users

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@test.com | admin123 |
| **User** | user@test.com | user123 |

## Essential Commands

```bash
# View backend logs
docker logs coffre-fort-backend

# Check AI status
docker exec coffre-fort-ollama ollama list

# Check GPU usage
docker exec coffre-fort-ollama nvidia-smi

# Restart a service
docker-compose restart backend

# Stop all services
docker-compose down
```

## Quick Test

1. Go to http://localhost:3000
2. Login with `admin@test.com` / `admin123`
3. Upload a PDF document
4. Wait 30-60 seconds for OCR processing
5. View the document - you should see:
   - Document preview (pages as images)
   - AI-generated summary in French
   - Keywords (mots-clés)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "AI summary unavailable" | Check if model is downloaded: `docker exec coffre-fort-ollama ollama list` |
| Document preview not loading | Wait for OCR processing, check worker logs |
| Can't login | Wait for Keycloak to start, check port 8081 |
| Services not starting | Run `docker-compose up -d` again |

## Next Steps

- See [SETUP.md](SETUP.md) for detailed configuration
- See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system overview
- See [docs/API.md](docs/API.md) for API documentation

