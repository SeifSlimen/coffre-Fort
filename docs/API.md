# API Documentation

## Base URL
`http://localhost:5000`

All endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Authentication Endpoints

### Validate Token
- **GET** `/api/auth/validate`
- **Description:** Validate JWT token and get user info
- **Response:**
```json
{
  "valid": true,
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "username": "user",
    "roles": ["user"]
  }
}
```

### Get Current User
- **GET** `/api/auth/user`
- **Description:** Get current authenticated user information
- **Response:**
```json
{
  "id": "user-id",
  "email": "user@example.com",
  "username": "user",
  "roles": ["user"]
}
```

### Logout
- **POST** `/api/auth/logout`
- **Description:** Logout endpoint (frontend handles Keycloak logout)

## Document Endpoints

### Upload Document
- **POST** `/api/documents/upload`
- **Content-Type:** `multipart/form-data`
- **Body:**
  - `file` (required): File to upload
  - `title` (optional): Document title
  - `description` (optional): Document description
- **Response:**
```json
{
  "id": 123,
  "title": "Document Title",
  "uploadedAt": "2024-01-01T00:00:00Z",
  "message": "Document uploaded successfully"
}
```

### List Documents
- **GET** `/api/documents?page=1&limit=10`
- **Query Parameters:**
  - `page` (optional): Page number (default: 1)
  - `limit` (optional): Items per page (default: 10)
- **Response:**
```json
{
  "documents": [
    {
      "id": 123,
      "title": "Document Title",
      "uploadedAt": "2024-01-01T00:00:00Z",
      "uploadedBy": "user"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 10
}
```

### Get Document Details
- **GET** `/api/documents/:id`
- **Description:** Get document with OCR text, AI summary, and keywords
- **Response:**
```json
{
  "id": 123,
  "title": "Document Title",
  "ocrText": "Extracted OCR text...",
  "summary": "AI-generated summary...",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "metadata": {
    "uploadedAt": "2024-01-01T00:00:00Z",
    "uploadedBy": "user",
    "fileType": "application/pdf"
  }
}
```

### Delete Document
- **DELETE** `/api/documents/:id`
- **Description:** Delete a document (admin only)
- **Response:**
```json
{
  "message": "Document deleted successfully"
}
```

### Download Document
- **GET** `/api/documents/:id/download`
- **Description:** Download the original document file
- **Response:** File stream

## AI Endpoints

### Get AI Summary
- **POST** `/api/ai/summarize`
- **Body:**
```json
{
  "documentId": 123
}
```
- **Response:**
```json
{
  "summary": "AI-generated summary...",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}
```

### Get Cached Summary
- **GET** `/api/ai/summary/:documentId`
- **Description:** Get cached AI summary if available
- **Response:** Same as `/api/ai/summarize`

## Admin Endpoints

### List Users
- **GET** `/api/admin/users`
- **Description:** List all users (admin only)
- **Response:**
```json
{
  "users": [
    {
      "id": "user-id",
      "email": "user@example.com",
      "roles": ["user"]
    }
  ]
}
```

### Grant Document Access
- **POST** `/api/admin/access`
- **Description:** Grant time-limited access to a document (admin only)
- **Body:**
```json
{
  "userId": "user-id",
  "documentId": 123,
  "expiresAt": "2024-01-08T00:00:00Z"
}
```
- **Response:**
```json
{
  "message": "Access granted successfully",
  "userId": "user-id",
  "documentId": 123,
  "expiresAt": "2024-01-08T00:00:00Z"
}
```

### Revoke Document Access
- **DELETE** `/api/admin/access/:userId/:documentId`
- **Description:** Revoke document access (admin only)
- **Response:**
```json
{
  "message": "Access revoked successfully"
}
```

### Force Mayan ACL Sync
- **POST** `/api/admin/acl-sync/trigger`
- **Description:** Immediately mirror Redis grants into Mayan ACLs (admin only). Useful to avoid waiting for the periodic sync.

## Error Responses

All errors follow this format:
```json
{
  "error": "Error message",
  "details": "Additional error details (in development mode)"
}
```

### Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error
- `503` - Service Unavailable

