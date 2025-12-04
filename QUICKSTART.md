# Quick Start Guide

## One-Command Setup

```bash
# Start all services
docker-compose up -d

# Pull AI model (required)
docker exec coffre-fort-ollama ollama pull llama3.2:1b

# Access the application
# Frontend: http://localhost:3000
# Keycloak: http://localhost:8080 (admin/admin)
# Mayan: http://localhost:8000 (admin/admin)
```

## Test Users

- **Admin:** admin@test.com / admin123
- **User:** user@test.com / user123

## Key Commands

```bash
# View logs
docker logs coffre-fort-backend
docker logs coffre-fort-frontend

# Restart a service
docker restart coffre-fort-backend

# Stop all services
docker-compose down

# Check service health
curl http://localhost:5000/health
```

## Troubleshooting

1. **Services not starting?** Wait 2-3 minutes for all services to initialize
2. **Keycloak not working?** Check logs: `docker logs coffre-fort-keycloak`
3. **AI not working?** Verify model: `docker exec coffre-fort-ollama ollama list`
4. **OCR not processing?** Wait 30-60 seconds after upload

## Next Steps

- See `SETUP.md` for detailed setup
- See `docs/TESTING.md` for testing guide
- See `docs/DEMO.md` for demo script

