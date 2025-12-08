# Demo Script and Presentation Guide

## Pre-Demo Checklist

- [ ] All services running (`docker-compose up -d`)
- [ ] Keycloak realm configured with test users
- [ ] Ollama model pulled (`docker exec coffre-fort-ollama ollama pull llama3.2:3b`)
- [ ] Test PDF documents ready (preferably in French)
- [ ] Browser cleared of old sessions
- [ ] Screen recording software ready

## Test Users

| Email | Password | Role |
|-------|----------|------|
| admin@test.com | admin123 | Admin |
| user@test.com | user123 | User |

## 3-5 Minute Video Demo Script

### 1. Installation Docker (30 secondes)

```bash
# Show the single command deployment
git clone https://github.com/SeifSlimen/coffre-Fort.git
cd coffre-Fort
docker-compose up -d
```

"Le projet se lance avec une seule commande. Docker Compose orchestre tous les services."

```bash
# Show running containers
docker ps
```

### 2. Démonstration Client / IA (2-3 minutes)

**Login Admin:**
1. Ouvrir `http://localhost:3000`
2. Connexion avec `admin@test.com` / `admin123`
3. "L'authentification passe par Keycloak (SSO OIDC)"

**Upload Document:**
1. Cliquer "Upload Document" (visible uniquement pour Admin)
2. Sélectionner un PDF français
3. Ajouter titre et description
4. "Le document est envoyé à Mayan EDMS pour OCR"

**Voir Résumé IA:**
1. Cliquer "View" sur le document
2. Attendre le chargement
3. **Montrer le Résumé** - "L'IA locale (Ollama) génère un résumé en français"
4. **Montrer les Mots-clés** - "Extraction automatique des mots-clés"
5. "Tout le traitement est local - aucune donnée ne sort du serveur"

**Gestion des Accès Temporaires:**
1. Aller dans "Admin Panel"
2. Montrer la liste des utilisateurs
3. Accorder un accès temporaire à un document
4. "L'admin peut définir des fenêtres de temps pour l'accès"

**Test Utilisateur Simple:**
1. Se déconnecter
2. Se connecter avec `user@test.com` / `user123`
3. "L'utilisateur simple ne peut pas uploader"
4. "Il peut seulement consulter les documents autorisés"

### 3. Architecture SSO (30 secondes)

1. Montrer le diagramme d'architecture
2. "L'authentification passe par Keycloak (OIDC)"
3. "Le backend valide les tokens JWT"
4. "Le backend communique avec Mayan via un compte de service sécurisé"
5. "Aucune donnée sensible n'est exposée au client"

### 4. Conclusion (30 secondes)

**Points Clés:**
- ✅ Déploiement one-command avec Docker Compose
- ✅ IA locale (privacy-first) avec résumés et mots-clés
- ✅ Gestion des rôles (Admin / Utilisateur)
- ✅ Accès temporaires (fenêtres de temps)
- ✅ SSO OIDC avec Keycloak
- ✅ Recherche OCR intégrée

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

