# SSO Integration Guide (Optional Bonus Feature)

## Overview

This document describes how to implement SSO (Single Sign-On) integration between Keycloak and Mayan EDMS, allowing users to access Mayan without re-authenticating after logging into the main application.

## Current Architecture

Currently, users must authenticate separately:
1. Frontend → Keycloak (authentication)
2. Mayan EDMS → Separate login required

## SSO Integration Options

### Option 1: SAML Integration (Recommended for Production)

Mayan EDMS supports SAML authentication. Keycloak can act as a SAML Identity Provider.

#### Steps:

1. **Configure Keycloak SAML Client:**
   - In Keycloak Admin Console, create a new client
   - Set Client Protocol to `saml`
   - Configure SAML settings:
     - Valid Redirect URIs: `http://mayan:8000/*`
     - Base URL: `http://mayan:8000`
     - SAML Assertion Consumer Service POST Binding URL: `http://mayan:8000/authentication/login/saml/`

2. **Install SAML Plugin in Mayan:**
   - Mayan EDMS has built-in SAML support
   - Configure in Mayan settings:
     - SAML Identity Provider URL: `http://keycloak:8080/realms/coffre-fort/protocol/saml`
     - SAML Entity ID: Match Keycloak client ID
     - Certificate: Export from Keycloak

3. **Backend Token Exchange:**
   - Backend can generate SAML assertions
   - Pass assertions to Mayan for authentication

### Option 2: Token Passthrough (Simpler for Hackathon)

A simpler approach for the hackathon is to use token passthrough:

1. **Backend Proxy Endpoint:**
   ```javascript
   // routes/mayan-sso.js
   router.get('/mayan-sso/:documentId', authenticate, async (req, res) => {
     // Get Mayan API token
     const mayanToken = await getMayanToken();
     
     // Create temporary session URL
     const sessionUrl = `${MAYAN_URL}/api/v4/authentication/token/?token=${mayanToken}`;
     
     // Redirect user to Mayan with token
     res.redirect(`${MAYAN_URL}/documents/${documentId}/?token=${mayanToken}`);
   });
   ```

2. **Frontend Integration:**
   ```javascript
   // In DocumentView component
   const openInMayan = async () => {
     const response = await api.get(`/api/mayan-sso/${documentId}`);
     window.open(response.data.url, '_blank');
   };
   ```

### Option 3: OAuth2/OIDC (If Mayan Supports)

If Mayan EDMS supports OAuth2/OIDC:
1. Configure Keycloak as OAuth2 provider
2. Register Mayan as OAuth2 client
3. Use standard OAuth2 flow

## Implementation for Hackathon (Simplified)

For the hackathon demo, we'll implement a simplified version:

### Backend Changes

Add to `backend/routes/documents.js`:

```javascript
// Get Mayan SSO URL
router.get('/:id/mayan-url', authenticate, async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const mayanToken = await getMayanToken();
    
    // Return URL that user can use to access Mayan directly
    res.json({
      url: `${MAYAN_URL}/documents/${documentId}/`,
      token: mayanToken,
      message: 'Use this URL to access document in Mayan'
    });
  } catch (error) {
    next(error);
  }
});
```

### Frontend Changes

Add to `frontend/src/components/DocumentView.jsx`:

```javascript
const [mayanUrl, setMayanUrl] = useState(null);

const getMayanUrl = async () => {
  try {
    const response = await api.get(`/api/documents/${id}/mayan-url`);
    setMayanUrl(response.data);
  } catch (err) {
    setError('Failed to get Mayan URL');
  }
};

// In render:
{mayanUrl && (
  <a 
    href={`${mayanUrl.url}?token=${mayanUrl.token}`}
    target="_blank"
    rel="noopener noreferrer"
    className="button button-primary"
  >
    Open in Mayan EDMS
  </a>
)}
```

## Testing SSO

1. Login to frontend via Keycloak
2. View a document
3. Click "Open in Mayan EDMS"
4. Verify user can access Mayan without re-authentication

## Limitations

- Token-based approach is simpler but less secure
- Full SAML integration requires more configuration
- Mayan SSO plugin may need additional setup
- For hackathon, token passthrough is acceptable

## Production Considerations

- Use proper SAML/OAuth2 integration
- Implement token expiration and refresh
- Add security headers and CSRF protection
- Use HTTPS for all communications
- Implement proper session management

## References

- [Keycloak SAML Documentation](https://www.keycloak.org/docs/latest/server_admin/#_saml_clients)
- [Mayan EDMS Authentication](https://docs.mayan-edms.com/topics/authentication.html)
- [OAuth2/OIDC Standards](https://oauth.net/2/)

