# Coffre-Fort Documentaire Sûr et Intelligent

A containerized microservices document management system with AI-powered summarization, OCR capabilities, and SSO authentication.

## 🏗️ Architecture

| Service | Technology | Port | Description |
|---------|------------|------|-------------|
| **Frontend** | React 18 | 3000 | Web client with Keycloak SSO |
| **Backend** | Express/Node.js | 5000 | API gateway with JWT validation |
| **Mayan EDMS** | Python/Django | 8000 | Document management & OCR |
| **Ollama** | Go/LLM | 11434 | AI summarization (GPU accelerated) |
| **Keycloak** | Java | 8081 | Identity provider (SSO) |
| **PostgreSQL** | Database | 5432 | Optimized data storage |
| **Redis** | Cache | 6379 | Task queue with LRU eviction |

## ✨ Features

- **📄 Document Management** - Upload, view, and organize documents
- **🔍 OCR Processing** - Automatic text extraction from PDFs/images
- **🤖 AI Summarization** - French summaries with keywords (mots-clés) powered by Ollama
- **🔐 SSO Authentication** - Keycloak OIDC-based single sign-on
- **👥 Granular Access Control** - View, Download, OCR, AI, Upload permissions per user
- **⏰ Time-Limited Access** - Admins can grant temporary document access with expiry
- **🎮 GPU Acceleration** - NVIDIA GPU support for fast AI inference
- **⚡ Performance Optimized** - Redis caching, PostgreSQL tuning, memory limits

## 🚀 Quick Start

### Prerequisites

- Docker Desktop with WSL2 (Windows) or Docker Engine (Linux)
- NVIDIA GPU + NVIDIA Container Toolkit (optional, for GPU acceleration)
- 12GB RAM recommended (8GB minimum)
- 15GB free disk space

### Windows WSL2 Memory Configuration

For optimal performance on Windows, create `C:\Users\<YourUsername>\.wslconfig`:

```ini
[wsl2]
memory=12GB
processors=6
swap=4GB
```

Then restart WSL: `wsl --shutdown` and restart Docker Desktop.

### Start the Application

```bash
# Clone the repository
git clone https://github.com/SeifSlimen/coffre-Fort.git
cd coffre-Fort

# Start all services
docker-compose up -d

# Wait 2-3 minutes for services to initialize

# Pull the AI model (required for summarization)
docker exec coffre-fort-ollama ollama pull llama3.2:3b
```

### Access the Application

| Service | URL | Credentials |
|---------|-----|-------------|
| **Application** | http://localhost:3000 | admin@test.com / admin123 |
| **Keycloak Admin** | http://localhost:8081 | admin / admin |
| **Mayan EDMS** | http://localhost:8000 | admin / (see docker-compose.yml) |

## 📖 Documentation

- [SETUP.md](SETUP.md) - Detailed setup instructions
- [QUICKSTART.md](QUICKSTART.md) - Quick start guide
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture
- [docs/API.md](docs/API.md) - API documentation
- [docs/TESTING.md](docs/TESTING.md) - Testing guide
- [docs/DEMO.md](docs/DEMO.md) - Demo script

## 👥 Access Control & Permissions

### Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: upload, view all documents, manage users, grant/revoke permissions |
| **User** | View authorized documents only, based on granted permissions |

### Granular Permissions

Admins can grant specific permissions per document per user:

| Permission | Description |
|------------|-------------|
| **View** | See the document in the list and open it |
| **Download** | Download the original file |
| **OCR** | View extracted text from document |
| **AI Summary** | Access AI-generated summary and keywords |
| **Upload** | Allow user to upload new documents |

### Time-Limited Access (Fenêtres de Temps)

Admins can grant temporary access to specific documents:

1. Login as Admin → Go to **Admin Panel**
2. Select a user and document
3. Choose permissions (view, download, OCR, AI)
4. Set expiration date/time
5. User can access the document until expiration

Access is automatically revoked after the expiration time.

### Test Accounts

| Email | Password | Role |
|-------|----------|------|
| admin@test.com | admin123 | Admin |
| user@test.com | user123 | User |

## 🔗 SSO Architecture (Bonus)

The system implements OIDC-based Single Sign-On with Keycloak:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│    Keycloak     │◀────│   Mayan EDMS    │
│  (React App)    │     │  (OIDC Provider)│     │  (OIDC Client)  │
└────────┬────────┘     └─────────────────┘     └─────────────────┘
         │                       │
         ▼                       │
┌─────────────────┐              │
│    Backend      │──────────────┘
│   (Node.js)     │   JWT Validation
└─────────────────┘
```

**SSO Flow:**
1. User logs in via Frontend → Keycloak
2. Frontend receives JWT token
3. Backend validates JWT for API calls
4. User clicks "Open in Mayan" → Seamless SSO redirect (same Keycloak session)

## 🛠️ Development

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

## 🔧 Configuration

### GPU Support (NVIDIA)

GPU acceleration is enabled by default for Ollama. Requirements:
- NVIDIA GPU (RTX 3000/4000 series recommended)
- NVIDIA Container Toolkit installed
- Docker Desktop with GPU support enabled

If you don't have a GPU, comment out the `runtime: nvidia` line in `docker-compose.yml`.

### AI Model Options

| Model | VRAM | Speed | Quality |
|-------|------|-------|---------|
| llama3.2:1b | ~2GB | Fast | Good |
| llama3.2:3b | ~3.5GB | Medium | Better |
| mistral:7b | ~5.5GB | Slower | Best |

Change the model in `docker-compose.yml` under `OLLAMA_MODEL`.

## 📁 Project Structure

```
coffre-Fort/
├── backend/           # Node.js API server
│   ├── config/        # Configuration files
│   ├── middleware/    # Auth middleware
│   ├── routes/        # API routes
│   ├── services/      # Business logic
│   └── utils/         # Utilities
├── frontend/          # React web client
│   ├── public/        # Static files
│   └── src/           # React components
├── keycloak/          # Keycloak realm config
├── scripts/           # Utility scripts
├── docs/              # Documentation
└── docker-compose.yml # Container orchestration
```

## 🔒 Security Notes

⚠️ **For Production Deployment:**
- Change all default passwords
- Use HTTPS with proper certificates
- Configure Keycloak for production mode
- Set up proper backup for volumes
- Review and restrict CORS settings

## 📄 License

MIT License

## 👤 Author

Seif Slimen

