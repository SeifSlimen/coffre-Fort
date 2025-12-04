# Coffre-Fort Documentaire Sûr et Intelligent

A containerized microservices document management system with AI-powered summarization, OCR capabilities, and SSO authentication.

## Architecture

- **Frontend**: React web client (Port 3000)
- **Backend**: Express/Node.js API gateway (Port 5000)
- **Mayan EDMS**: Document management and OCR (Port 8000)
- **Postgres**: Database for Mayan EDMS (Port 5432)
- **Ollama**: Local AI/LLM service for summarization (Port 11434)
- **Keycloak**: Identity provider for SSO (Port 8080)

## Quick Start

1. Clone the repository
2. Copy `.env.example` to `.env` (optional, defaults are set)
3. Run the entire stack:

```bash
docker-compose up
```

4. Access the services:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000
   - Mayan EDMS: http://localhost:8000 (admin/admin)
   - Keycloak: http://localhost:8080 (admin/admin)

## Initial Setup

### Keycloak Configuration

1. Access Keycloak admin console: http://localhost:8080
2. Login with admin/admin
3. Create realm: `coffre-fort`
4. Create client: `coffre-fort-backend` (Public client)
5. Create roles: `admin`, `user`
6. Create test users:
   - admin@test.com / admin123 (with admin role)
   - user@test.com / user123 (with user role)

### Mayan EDMS Configuration

1. Access Mayan: http://localhost:8000
2. Login with admin/admin
3. Create API token for backend authentication
4. Enable OCR workflow

### Ollama Model Setup

The first time you run, pull the AI model:

```bash
docker exec coffre-fort-ollama ollama pull llama3.2:1b
```

## Development

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

## API Endpoints

See `docs/API.md` for complete API documentation.

## Demo

See `docs/DEMO.md` for demo script and presentation checklist.

## License

MIT

