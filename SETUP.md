# Setup Instructions

## Prerequisites

- **Docker Desktop** (Windows/Mac) or Docker Engine + Docker Compose (Linux)
- **NVIDIA GPU** (optional) - For GPU-accelerated AI inference
- **NVIDIA Container Toolkit** (if using GPU)
- At least **12GB RAM** recommended (8GB minimum)
- **15GB free disk space**

## Windows WSL2 Configuration

For optimal performance on Windows, create `C:\Users\<YourUsername>\.wslconfig`:

```ini
[wsl2]
memory=12GB
processors=6
swap=4GB
```

Then restart WSL:
```bash
wsl --shutdown
```
And restart Docker Desktop.

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/SeifSlimen/coffre-Fort.git
cd coffre-Fort
```

### 2. Start All Services

```bash
docker-compose up -d
```

Wait 2-3 minutes for all services to initialize.

### 3. Pull the AI Model

```bash
# Recommended model for RTX 3000/4000 series (8GB VRAM)
docker exec coffre-fort-ollama ollama pull llama3.2:3b

# Alternative lightweight model (4GB VRAM or less)
docker exec coffre-fort-ollama ollama pull llama3.2:1b
```

### 4. Access the Application

| Service | URL | Username | Password |
|---------|-----|----------|----------|
| **Application** | http://localhost:3000 | admin@test.com | admin123 |
| **Keycloak Admin** | http://localhost:8081 | admin | admin |
| **Mayan EDMS** | http://localhost:8000 | admin | (see docker-compose.yml) |

## Service Ports

| Service | External Port | Internal Port |
|---------|---------------|---------------|
| Frontend | 3000 | 80 |
| Backend | 5000 | 5000 |
| Mayan EDMS | 8000 | 8000 |
| Keycloak | 8081 | 8080 |
| Ollama | 11434 | 11434 |

## GPU Configuration

### With NVIDIA GPU (Recommended)

The `docker-compose.yml` is configured for NVIDIA GPU by default:

```yaml
ollama:
  runtime: nvidia
  environment:
    - NVIDIA_VISIBLE_DEVICES=all
```

Requirements:
1. NVIDIA GPU (GTX 1060+ / RTX series)
2. NVIDIA drivers installed
3. NVIDIA Container Toolkit installed

### Without GPU

Comment out the GPU lines in `docker-compose.yml`:

```yaml
ollama:
  # runtime: nvidia
  # environment:
  #   - NVIDIA_VISIBLE_DEVICES=all
```

Note: CPU inference will be slower (10-30x).

## Changing the AI Model

Edit `docker-compose.yml` and change `OLLAMA_MODEL`:

```yaml
backend:
  environment:
    OLLAMA_MODEL: llama3.2:3b  # Change this
```

Then restart the backend:

```bash
docker-compose up -d backend
```

### Available Models

| Model | Size | VRAM Required | Speed |
|-------|------|---------------|-------|
| llama3.2:1b | 1.3GB | ~2GB | Very Fast |
| llama3.2:3b | 2GB | ~3.5GB | Fast |
| mistral:7b | 4GB | ~5.5GB | Medium |
| llama3.1:8b | 4.7GB | ~6.5GB | Slower |

## Test Users

Pre-configured in Keycloak:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@test.com | admin123 |
| User | user@test.com | user123 |

## Common Commands

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker logs coffre-fort-backend
docker logs coffre-fort-mayan
docker logs coffre-fort-ollama

# Restart a service
docker-compose restart backend

# Check Ollama models
docker exec coffre-fort-ollama ollama list

# Check GPU usage
docker exec coffre-fort-ollama nvidia-smi
```

## Troubleshooting

### Services Not Starting

```bash
# Check container status
docker ps -a

# View detailed logs
docker logs coffre-fort-mayan
docker logs coffre-fort-keycloak
```

### AI Summary Not Working

1. Check if model is downloaded:
   ```bash
   docker exec coffre-fort-ollama ollama list
   ```

2. Check backend logs:
   ```bash
   docker logs coffre-fort-backend | tail -20
   ```

3. Verify model name matches `OLLAMA_MODEL` in docker-compose.yml

### OCR Not Processing

Wait 30-60 seconds after upload. Check worker logs:

```bash
docker logs coffre-fort-worker-fast
```

### Port Conflicts

If a port is already in use, modify the external port in `docker-compose.yml`:

```yaml
ports:
  - "3001:80"  # Changed from 3000 to 3001
```

### GPU Not Detected

1. Check NVIDIA drivers: `nvidia-smi`
2. Check Container Toolkit: `docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi`
3. Restart Docker Desktop

## Volume Persistence

Data is persisted in Docker volumes:

- `postgres_data` - Mayan database
- `mayan_media` - Uploaded documents
- `keycloak_db_data` - Keycloak database
- `ollama_data` - AI models
- `redis_data` - Task queue

To reset all data:

```bash
docker-compose down -v
```

⚠️ This will delete all documents and users!

