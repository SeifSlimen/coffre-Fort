# Coffre-Fort Documentaire Sûr et Intelligent

A containerized microservices document management system with AI-powered summarization, OCR capabilities, and SSO authentication.

## 🏗️ Architecture

| Service | Technology | Port | Description |
|---------|------------|------|-------------|
| **Frontend** | React 18 | 3000 | Web client with Keycloak SSO |
| **Backend** | Express/Node.js | 5000 | API gateway with JWT validation |
| **Mayan EDMS** | Python/Django | 8000 | Document management & OCR |
| **Ollama** | Go/LLM | 5001 | AI summarization (GPU accelerated) |
| **Keycloak** | Java | 8081 | Identity provider (SSO) |
| **PostgreSQL** | Database | 5432 | Data storage |
| **Redis** | Cache | 6379 | Task queue for OCR workers |

## ✨ Features

- **📄 Document Management** - Upload, view, and organize documents
- **🔍 OCR Processing** - Automatic text extraction from PDFs/images
- **🤖 AI Summarization** - French summaries with keywords (mots-clés)
- **🔐 SSO Authentication** - Keycloak-based single sign-on
- **👥 Role-Based Access** - Admin and user roles
- **🎮 GPU Acceleration** - NVIDIA GPU support for fast AI inference

## 🚀 Quick Start

### Prerequisites

- Docker Desktop with WSL2 (Windows) or Docker Engine (Linux)
- NVIDIA GPU + NVIDIA Container Toolkit (optional, for GPU acceleration)
- 8GB RAM minimum
- 15GB free disk space

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

