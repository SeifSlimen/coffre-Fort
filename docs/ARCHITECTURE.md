# Architecture Documentation

## System Overview

Coffre-Fort Documentaire is a microservices-based document management system with AI capabilities, built using Docker Compose for orchestration.

## Architecture Diagram

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       │ HTTP/HTTPS
       │
┌──────▼─────────────────────────────────────────────┐
│              Frontend (React)                      │
│              Port: 3000                            │
│  - Keycloak JS Adapter                             │
│  - React Router                                    │
│  - API Client                                      │
└──────┬─────────────────────────────────────────────┘
       │
       │ REST API (JWT)
       │
┌──────▼─────────────────────────────────────────────┐
│            Backend (Express/Node.js)               │
│            Port: 5000                              │
│  - JWT Validation                                  │
│  - Document Management                             │
│  - AI Service Integration                          │
└──┬──────────┬──────────────┬──────────────┬───────┘
   │          │              │              │
   │          │              │              │
   │          │              │              │
┌──▼──┐  ┌────▼────┐  ┌─────▼─────┐  ┌────▼─────┐
│Key- │  │ Mayan   │  │  Ollama   │  │ Postgres │
│cloak│  │  EDMS   │  │   (AI)    │  │          │
│8080 │  │  8000   │  │  11434    │  │  5432    │
└─────┘  └────┬────┘  └───────────┘  └────┬─────┘
             │                            │
             │                            │
             └────────────┬───────────────┘
                          │
                    ┌─────▼─────┐
                    │  Redis    │
                    │  (Celery) │
                    └───────────┘
```

## Service Details

### 1. Frontend (React)
- **Technology:** React 18, React Router, Keycloak JS
- **Port:** 3000
- **Responsibilities:**
  - User interface
  - Authentication flow (Keycloak redirect)
  - Document upload/view
  - Admin panel
- **Key Features:**
  - JWT token management
  - Automatic token refresh
  - Role-based UI rendering

### 2. Backend (Express/Node.js)
- **Technology:** Express, JWT, Axios
- **Port:** 5000
- **Responsibilities:**
  - API gateway
  - JWT validation
  - Document orchestration
  - AI service integration
  - Access control
- **Key Features:**
  - RESTful API
  - JWT middleware
  - Role-based authorization
  - Error handling

### 3. Keycloak
- **Technology:** Keycloak (Identity Provider)
- **Port:** 8080
- **Responsibilities:**
  - User authentication
  - SSO (Single Sign-On)
  - Role management
  - JWT token issuance
- **Configuration:**
  - Realm: `coffre-fort`
  - Clients: `coffre-fort-backend`, `coffre-fort-frontend`
  - Roles: `admin`, `user`

### 4. Mayan EDMS
- **Technology:** Mayan EDMS (Document Management)
- **Port:** 8000
- **Responsibilities:**
  - Document storage
  - OCR processing
  - Document metadata
  - Search functionality
- **Database:** Postgres (separate instance)
- **Features:**
  - REST API
  - OCR workflow
  - Document versioning

### 5. Ollama (AI Service)
- **Technology:** Ollama (Local LLM)
- **Port:** 11434
- **Responsibilities:**
  - Document summarization
  - Keyword extraction
  - Local AI processing
- **Model:** llama3.2:1b (lightweight, fast)
- **Features:**
  - No external API calls
  - Privacy-preserving
  - Fast inference

### 6. Postgres
- **Technology:** PostgreSQL 15
- **Port:** 5432 (internal)
- **Responsibilities:**
  - Mayan EDMS database
  - Document metadata storage
- **Volumes:** Persistent storage

### 7. Redis
- **Technology:** Redis 7
- **Port:** 6379 (internal)
- **Responsibilities:**
  - Celery task queue for Mayan
  - Background job processing

## Data Flow

### Document Upload Flow
1. User uploads file via Frontend
2. Frontend sends file + JWT to Backend
3. Backend validates JWT with Keycloak
4. Backend uploads file to Mayan EDMS
5. Mayan processes OCR (background task via Celery)
6. Backend returns document ID to Frontend

### Document View Flow
1. User requests document via Frontend
2. Frontend sends request + JWT to Backend
3. Backend validates JWT and checks access permissions
4. Backend fetches document from Mayan
5. Backend retrieves OCR text from Mayan
6. Backend calls Ollama for AI summary
7. Backend returns: document, OCR text, summary, keywords
8. Frontend displays all information

### Authentication Flow
1. User accesses Frontend
2. Frontend redirects to Keycloak login
3. User authenticates with Keycloak
4. Keycloak returns JWT token
5. Frontend stores token and includes in API requests
6. Backend validates JWT with Keycloak public key

## Security

### Authentication
- JWT tokens issued by Keycloak
- Token validation using public key (JWKS)
- Automatic token refresh
- Secure token storage (in-memory)

### Authorization
- Role-based access control (RBAC)
- Admin vs User roles
- Time-limited document access
- API endpoint protection

### Network Security
- Internal Docker network
- Service-to-service communication
- External ports only for necessary services

## Scalability Considerations

### Current Architecture (Hackathon MVP)
- Single instance of each service
- In-memory caching
- No load balancing
- No horizontal scaling

### Production Enhancements
- Add Redis for distributed caching
- Implement API gateway with rate limiting
- Add load balancers
- Horizontal scaling with Kubernetes
- Database connection pooling
- CDN for static assets

## Deployment

### Development
```bash
docker-compose up
```

### Production Considerations
- Use environment-specific configurations
- Enable HTTPS/TLS
- Set up monitoring and logging
- Implement backup strategies
- Use secrets management
- Configure resource limits

## Technology Stack Summary

| Component | Technology | Version |
|-----------|-----------|---------|
| Frontend | React | 18.2.0 |
| Backend | Node.js/Express | 18/4.18.2 |
| Identity | Keycloak | Latest |
| Document Management | Mayan EDMS | Latest |
| AI | Ollama | Latest |
| Database | PostgreSQL | 15 |
| Cache/Queue | Redis | 7 |
| Containerization | Docker Compose | 3.8 |

