// Use localhost consistently to avoid token issuer mismatch
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
export const KEYCLOAK_URL = process.env.REACT_APP_KEYCLOAK_URL || 'http://localhost:8081';
export const KEYCLOAK_REALM = process.env.REACT_APP_KEYCLOAK_REALM || 'coffre-fort';
export const KEYCLOAK_CLIENT_ID = process.env.REACT_APP_KEYCLOAK_CLIENT_ID || 'coffre-fort-frontend';

