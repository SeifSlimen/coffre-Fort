# Testing Guide

## Manual Testing Checklist

### Prerequisites
- All services running: `docker-compose up -d`
- Ollama model pulled: `docker exec coffre-fort-ollama ollama pull llama3.2:3b`
- Keycloak realm configured with test users

### 1. Service Health Checks

```bash
# Check all services are running
docker ps

# Check backend health
curl http://localhost:5000/health

# Check Keycloak
curl http://localhost:8080/health/ready

# Check Mayan
curl http://localhost:8000/api/

# Check Ollama
curl http://localhost:11434/api/tags
```

**Expected:** All services return 200 OK or valid JSON responses.

### 2. Authentication Flow

**Test Steps:**
1. Open browser to http://localhost:3000
2. Should redirect to Keycloak login
3. Login as `admin@test.com` / `admin123`
4. Should redirect back to dashboard
5. Verify user info shows in navbar
6. Verify "Admin" badge appears

**Test as User:**
1. Logout
2. Login as `user@test.com` / `user123`
3. Verify no "Admin" badge
4. Verify admin panel link is not visible

**Expected:** Authentication works, roles are correctly displayed.

### 3. Document Upload

**Test Steps:**
1. Login as admin
2. Click "Upload Document"
3. Select a PDF file
4. Enter title and description
5. Click Upload
6. Verify document appears in list

**Test Edge Cases:**
- Upload without file (should show error)
- Upload invalid file type (should show error)
- Upload large file (>50MB should fail)

**Expected:** Document uploads successfully, appears in list with correct metadata.

### 4. Document View with OCR

**Test Steps:**
1. Click "View" on uploaded document
2. Wait for page to load
3. Verify document title is displayed
4. Verify OCR text section shows extracted text
5. Verify metadata is displayed

**Expected:** OCR text is extracted and displayed (may take a few seconds for processing).

### 5. AI Summary and Keywords

**Test Steps:**
1. View a document with OCR text
2. Wait 2-5 seconds for AI processing
3. Verify "AI Summary" section appears
4. Verify summary is coherent and relevant
5. Verify "Keywords" section shows 3-5 keywords
6. Verify keywords are displayed as tags

**Test Edge Cases:**
- Document with no OCR text (should show "No OCR text available")
- Very short document (should still generate summary)
- Document with special characters (should handle gracefully)

**Expected:** AI summary and keywords are generated and displayed.

### 6. Role-Based Access Control

**Test as Admin:**
1. Login as admin
2. Verify "Delete" button appears on documents
3. Verify "Admin Panel" link is visible
4. Click "Admin Panel"
5. Verify admin features are accessible

**Test as User:**
1. Login as user
2. Verify "Delete" button does NOT appear
3. Verify "Admin Panel" link is NOT visible
4. Try to access `/admin` directly (should be blocked or redirect)

**Expected:** Admin features only accessible to admin role.

### 7. Document Deletion (Admin Only)

**Test Steps:**
1. Login as admin
2. Upload a test document
3. Click "Delete" on the document
4. Confirm deletion
5. Verify document is removed from list

**Test as User:**
1. Login as user
2. Verify "Delete" button is not visible
3. Try to call delete API directly (should return 403)

**Expected:** Only admins can delete documents.

### 8. Admin Panel Features

**Test Steps:**
1. Login as admin
2. Navigate to Admin Panel
3. Verify user list is displayed
4. Click "Grant Document Access"
5. Fill in form:
   - User ID: `user@test.com` user ID
   - Document ID: Existing document ID
   - Expires At: Future date
6. Submit form
7. Verify success message

**Expected:** Admin can grant time-limited access to documents.

### 9. API Endpoint Testing

**Test with curl:**

```bash
# Get Keycloak token (requires manual login first)
TOKEN="your-jwt-token"

# Validate token
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/auth/validate

# Get documents
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/documents

# Get document details
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/documents/1
```

**Expected:** All endpoints return valid JSON responses.

### 10. Error Handling

**Test Scenarios:**
1. Access protected endpoint without token (should return 401)
2. Access admin endpoint as user (should return 403)
3. Access non-existent document (should return 404)
4. Upload invalid file type (should return 400)
5. AI service unavailable (should show graceful error message)

**Expected:** All errors are handled gracefully with appropriate status codes and messages.

### 11. Performance Testing

**Test Scenarios:**
1. Upload multiple documents in sequence
2. View document immediately after upload (OCR may not be ready)
3. Request AI summary for large document
4. Load dashboard with many documents

**Expected:** System handles load reasonably, shows loading states appropriately.

### 12. End-to-End Flow

**Complete User Journey:**
1. User logs in via Keycloak
2. User uploads a PDF document
3. User views the document
4. System shows OCR text
5. System shows AI summary and keywords
6. User navigates back to dashboard
7. User logs out

**Expected:** Complete flow works without errors.

## Automated Testing (If Time Permits)

### Backend Unit Tests

Smoke tests live in `backend/tests/` and are designed to be run locally against the Docker stack.

For deeper automated coverage, you can later add unit tests here (JWT validation, document service, AI service, access control).

### Integration Tests

Test API endpoints with:
- Supertest (for Express)
- Mock Keycloak responses
- Mock Mayan responses
- Mock Ollama responses

## Known Issues and Workarounds

### Issue: OCR Not Processing
**Workaround:** Wait 30-60 seconds after upload, or manually trigger OCR in Mayan UI.

### Issue: AI Service Slow
**Workaround:** Pre-process summaries for demo documents, or use smaller model.

### Issue: Keycloak Not Starting
**Workaround:** Wait 60 seconds for Keycloak to fully start, check logs: `docker logs coffre-fort-keycloak`

### Issue: Token Expired
**Workaround:** Frontend should auto-refresh, but if not, logout and login again.

## Test Data

### Sample PDFs
- Small PDF (< 1MB) for quick testing
- Medium PDF (1-5MB) with text content
- Large PDF (> 5MB) for performance testing

### Test Users
- Admin: admin@test.com / admin123
- User: user@test.com / user123

## Reporting Issues

When reporting issues, include:
1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Error messages
5. Service logs
6. Browser console errors (if frontend)

## Success Criteria

All tests should pass:
- [x] Services start successfully
- [x] Authentication works
- [x] Document upload works
- [x] OCR extraction works
- [x] AI summarization works
- [x] Role-based access works
- [x] Admin features work
- [x] Error handling works
- [x] End-to-end flow works

