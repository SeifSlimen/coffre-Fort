# Demo Script and Presentation Guide

## Pre-Demo Checklist

- [ ] All services running (`docker-compose up`)
- [ ] Keycloak realm configured with test users
- [ ] Ollama model pulled (`docker exec coffre-fort-ollama ollama pull llama3.2:1b`)
- [ ] Test PDF documents ready
- [ ] Browser cleared of old sessions
- [ ] Screen recording software ready (optional)

## Test Users

- **Admin:** admin@test.com / admin123
- **User:** user@test.com / user123

## 3-5 Minute Demo Script

### Introduction (30 seconds)

"Today I'm presenting **Coffre-Fort Documentaire**, a secure document management system with AI-powered summarization. It's built using a microservices architecture with Docker Compose, featuring Keycloak for authentication, Mayan EDMS for document management, and Ollama for local AI processing."

### Architecture Overview (1 minute)

1. **Show docker-compose.yml**
   - "All services are containerized and orchestrated with Docker Compose"
   - "We have 6 main services: Frontend, Backend, Keycloak, Mayan EDMS, Ollama, and Postgres"

2. **Show running containers**
   ```bash
   docker ps
   ```
   - "All services are running and communicating via a Docker network"

### Authentication Demo (30 seconds)

1. **Open browser to http://localhost:3000**
   - "The frontend automatically redirects to Keycloak for authentication"
   - Show Keycloak login page

2. **Login as admin@test.com**
   - "I'm logging in as an administrator"
   - Show dashboard with admin badge

3. **Mention roles**
   - "The system supports role-based access control with admin and user roles"

### Core Functionality (2 minutes)

1. **Upload Document**
   - Click "Upload Document"
   - Select a PDF file
   - Add title and description
   - Click Upload
   - "The document is uploaded to Mayan EDMS, which processes OCR in the background"

2. **View Document List**
   - Show document in the list
   - "Documents are displayed with metadata"

3. **View Document Details**
   - Click "View" on a document
   - **Highlight OCR Text:**
     - "Mayan EDMS has extracted the text using OCR"
   - **Highlight AI Summary:**
     - "Our local AI service (Ollama) has generated a summary"
   - **Highlight Keywords:**
     - "And extracted key keywords automatically"
   - "All processing happens locally - no external API calls"

4. **Show Multiple Documents** (if time permits)
   - Upload another document
   - Show that summaries are cached for performance

### Admin Features (30 seconds)

1. **Navigate to Admin Panel**
   - "As an administrator, I have access to the admin panel"
   - Show user management
   - Show access control features
   - "Admins can grant time-limited access to documents"

### Closing (30 seconds)

1. **Key Highlights:**
   - "One-command deployment with Docker Compose"
   - "Local AI processing for privacy"
   - "Secure authentication with Keycloak SSO"
   - "OCR + AI integration for intelligent document management"
   - "Microservices architecture for scalability"

2. **Future Enhancements:**
   - "Full SSO integration with Mayan"
   - "Advanced search capabilities"
   - "Document versioning and collaboration"

3. **Q&A**

## Demo Tips

### If Something Goes Wrong

1. **AI Service Slow:**
   - "The AI service is processing... this is normal for the first request"
   - Have pre-processed summaries ready as backup

2. **Keycloak Not Responding:**
   - Restart Keycloak: `docker restart coffre-fort-keycloak`
   - Wait 30 seconds for startup

3. **Mayan Not Processing OCR:**
   - Check Mayan logs: `docker logs coffre-fort-mayan`
   - May need to manually trigger OCR workflow

4. **Frontend Not Loading:**
   - Check backend is running: `curl http://localhost:5000/health`
   - Check frontend logs: `docker logs coffre-fort-frontend`

### Best Practices

1. **Practice the flow** before the actual demo
2. **Have backup screenshots** ready
3. **Keep terminal open** to show docker commands if needed
4. **Test with multiple documents** beforehand
5. **Time yourself** - aim for 4 minutes to leave room for Q&A

## Quick Commands Reference

```bash
# Start all services
docker-compose up -d

# Check service status
docker ps

# View logs
docker logs coffre-fort-backend
docker logs coffre-fort-frontend
docker logs coffre-fort-mayan

# Pull Ollama model
docker exec coffre-fort-ollama ollama pull llama3.2:1b

# Restart a service
docker restart coffre-fort-backend

# Stop all services
docker-compose down
```

## Presentation Slides Outline (Optional)

1. **Title Slide:** Coffre-Fort Documentaire
2. **Problem Statement:** Secure document management with AI
3. **Architecture:** Microservices diagram
4. **Tech Stack:** List of technologies
5. **Key Features:** Authentication, OCR, AI, Access Control
6. **Demo:** Live demonstration
7. **Future Work:** Enhancements and improvements
8. **Q&A**

## Success Metrics

- All services start successfully
- User can authenticate
- Document upload works
- OCR text is extracted
- AI summary is generated
- Keywords are extracted
- Admin features are accessible
- Demo completes in 3-5 minutes

