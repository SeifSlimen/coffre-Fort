import Keycloak from 'keycloak-js';
import { KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID } from '../utils/constants';

const keycloak = new Keycloak({
  url: KEYCLOAK_URL,
  realm: KEYCLOAK_REALM,
  clientId: KEYCLOAK_CLIENT_ID
});

let initOptions = {
  onLoad: 'login-required',
  checkLoginIframe: false,
  pkceMethod: 'S256'
};

let keycloakInstance = null;

export const initKeycloak = () => {
  return new Promise((resolve, reject) => {
    keycloak.init(initOptions)
      .then((authenticated) => {
        keycloakInstance = keycloak;
        if (authenticated) {
          console.log('User is authenticated');
          resolve(keycloak);
        } else {
          console.log('User is not authenticated');
          reject(new Error('User not authenticated'));
        }
      })
      .catch((error) => {
        console.error('Keycloak initialization failed:', error);
        reject(error);
      });
  });
};

export const getKeycloak = () => {
  return keycloakInstance;
};

export const getToken = () => {
  return keycloakInstance?.token;
};

export const isAuthenticated = () => {
  return keycloakInstance?.authenticated || false;
};

export const getUserInfo = () => {
  if (!keycloakInstance) return null;
  return {
    id: keycloakInstance.tokenParsed?.sub,
    email: keycloakInstance.tokenParsed?.email,
    username: keycloakInstance.tokenParsed?.preferred_username,
    roles: keycloakInstance.tokenParsed?.realm_access?.roles || []
  };
};

export const logout = () => {
  if (keycloakInstance) {
    keycloakInstance.logout();
  }
};

export const updateToken = () => {
  return new Promise((resolve, reject) => {
    if (keycloakInstance) {
      keycloakInstance.updateToken(70)
        .then((refreshed) => {
          if (refreshed) {
            console.log('Token refreshed');
          }
          resolve(keycloakInstance.token);
        })
        .catch((error) => {
          console.error('Failed to refresh token:', error);
          reject(error);
        });
    } else {
      reject(new Error('Keycloak not initialized'));
    }
  });
};

// Set up token refresh interval
if (typeof window !== 'undefined') {
  setInterval(() => {
    if (keycloakInstance?.authenticated) {
      updateToken().catch(() => {
        // Token refresh failed, user will need to re-authenticate
      });
    }
  }, 60000); // Check every minute
}

