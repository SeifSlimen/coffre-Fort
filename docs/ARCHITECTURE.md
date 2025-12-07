# Architecture Documentation

## System Overview

Coffre-Fort Documentaire is a microservices-based document management system with AI capabilities, built using Docker Compose for orchestration.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ HTTP (Port 3000)
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                    Frontend (React)                              │
│                    Container: coffre-fort-frontend               │
│  • Keycloak JS Adapter (SSO)                                     │
│  • React Router                                                  │
│  • Document Upload/View UI                                       │
│  • Admin Panel                                                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ REST API + JWT (Port 5000)
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                   Backend (Express/Node.js)                      │
│                   Container: coffre-fort-backend                 │
│  • JWT Validation (Keycloak)                                     │
│  • Document Management API                                       │
│  • AI Service Integration                                        │
│  • Access Control                                                │
└──────┬──────────────┬──────────────┬──────────────┬─────────────┘
       │              │              │              │
       │              │              │              │
┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
│  Keycloak   │ │   Mayan   │ │  Ollama   │ │ PostgreSQL│
│   (SSO)     │ │   EDMS    │ │   (AI)    │ │ (Keycloak)│
│  Port 8081  │ │ Port 8000 │ │ Port 5001 │ │           │
└──────┬──────┘ └─────┬─────┘ └─────┬─────┘ └───────────┘
       │              │              │
       │              │              │
┌──────▼──────┐ ┌─────▼─────┐       │
│ PostgreSQL  │ │PostgreSQL │       │ GPU (RTX 4060)
│ (Keycloak)  │ │  (Mayan)  │       │ NVIDIA Container
└─────────────┘ └─────┬─────┘       │ Toolkit
                      │              │
                ┌─────▼─────┐       │
                │   Redis   │◄──────┘
                │  (Queue)  │
                └─────┬─────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
  ┌─────▼─────┐              ┌─────▼─────┐
  │  Worker   │              │  Worker   │
  │   Fast    │              │   Slow    │
  │(OCR, etc) │              │(Indexing) │
  └───────────┘              └───────────┘
```

## Service Details

### 1. Frontend (React)
- **Container:** coffre-fort-frontend
- **Technology:** React 18, React Router, Keycloak JS
- **Port:** 3000 (external) → 80 (internal/nginx)
- **Responsibilities:**
  - User interface
  - SSO authentication flow
  - Document upload/view
  - Admin panel for user management
- **Key Files:**
  - `src/App.jsx` - Main application
  - `src/services/auth.js` - Keycloak integration
  - `src/components/` - React components

### 2. Backend (Express/Node.js)
- **Container:** coffre-fort-backend
- **Technology:** Express, JWT, Axios
- **Port:** 5000
- **Responsibilities:**
  - API gateway
  - JWT validation via Keycloak
  - Document orchestration with Mayan
  - AI service integration with Ollama
  - Role-based access control
- **Key Files:**
  - `server.js` - Express server
  - `services/mayanService.js` - Mayan API client
  - `services/aiService.js` - Ollama integration
  - `middleware/auth.js` - JWT validation

### 3. Keycloak
- **Container:** coffre-fort-keycloak
- **Technology:** Keycloak (Identity Provider)
- **Port:** 8081 (external) → 8080 (internal)
- **Database:** PostgreSQL (coffre-fort-keycloak-db)
- **Responsibilities:**
  - User authentication (SSO)
  - JWT token issuance
  - Role management (admin, user)
- **Configuration:**
  - Realm: `coffre-fort`
  - Client: `coffre-fort-frontend`
  - Pre-configured via `keycloak/realm-config/coffre-fort-realm.json`

### 4. Mayan EDMS
- **Container:** coffre-fort-mayan
- **Technology:** Python/Django
- **Port:** 8000
- **Database:** PostgreSQL (coffre-fort-postgres)
- **Responsibilities:**
  - Document storage and management
  - OCR processing (Tesseract)
  - Document metadata
  - Full-text search
- **Workers:**
  - `coffre-fort-worker-fast` - OCR, parsing, uploads
  - `coffre-fort-worker-slow` - Indexing, maintenance

### 5. Ollama (AI Service)
- **Container:** coffre-fort-ollama
- **Technology:** Ollama (Local LLM runtime)
- **Port:** 5001 (external) → 11434 (internal)
- **GPU:** NVIDIA RTX 4060 (via Container Toolkit)
- **Model:** llama3.2:3b (configurable)
- **Responsibilities:**
  - Document summarization (French)
  - Keyword extraction (mots-clés)
  - Local AI processing (privacy-preserving)
- **Features:**
  - GPU acceleration (~50+ tokens/sec)
  - No external API calls
  - Models stored in `ollama_data` volume

### 6. PostgreSQL (x2)
- **coffre-fort-postgres:** Mayan EDMS database
- **coffre-fort-keycloak-db:** Keycloak database
- **Technology:** PostgreSQL 15 Alpine
- **Data:** Persisted in Docker volumes

### 7. Redis
- **Container:** coffre-fort-redis
- **Technology:** Redis 7 Alpine
- **Responsibilities:**
  - Celery task queue for Mayan
  - Background job processing (OCR, indexing)

## Data Flow

### Document Upload Flow
```
1. User → Frontend: Upload PDF
2. Frontend → Backend: POST /api/documents/upload + JWT
3. Backend → Keycloak: Validate JWT
4. Backend → Mayan: Upload document via REST API
5. Mayan → Redis: Queue OCR task
6. Worker → Mayan: Process OCR (Tesseract)
7. Backend → Frontend: Return document ID
```

### Document View with AI Summary
```
1. User → Frontend: View document
2. Frontend → Backend: GET /api/documents/:id + JWT
3. Backend → Keycloak: Validate JWT
4. Backend → Mayan: Get document + pages + OCR text
5. Backend → Ollama: Send OCR text for summarization
6. Ollama → Backend: Return French summary + keywords
7. Backend → Frontend: Return document + AI analysis
```

### Authentication Flow
```
1. User → Frontend: Access application
2. Frontend → Keycloak: Redirect to login
3. User → Keycloak: Enter credentials
4. Keycloak → Frontend: Return JWT token
5. Frontend → Backend: API calls with JWT in header
6. Backend → Keycloak: Validate JWT signature
7. Backend → Frontend: Return authorized data
```

## Network Configuration

All containers are connected to `coffre-fort-network` (bridge driver).

Internal communication uses container names as hostnames:
- `http://mayan:8000`
- `http://keycloak:8080`
- `http://ollama:11434`
- `http://postgres:5432`
- `http://redis:6379`

## Volume Persistence

| Volume | Purpose |
|--------|---------|
| `postgres_data` | Mayan database |
| `mayan_media` | Uploaded documents |
| `keycloak_db_data` | Keycloak database |
| `ollama_data` | AI models (~2-5GB) |
| `redis_data` | Task queue data |

## Security Considerations

1. **JWT Validation:** All API requests validated via Keycloak
2. **Role-Based Access:** Admin vs User permissions
3. **Internal Network:** Services not exposed except through defined ports
4. **Local AI:** No external API calls for document processing

## Production Recommendations

1. Use HTTPS with proper SSL certificates
2. Change all default passwords
3. Configure Keycloak in production mode
4. Set up database backups
5. Use secrets management for credentials
6. Enable container health checks
7. Configure logging aggregation

