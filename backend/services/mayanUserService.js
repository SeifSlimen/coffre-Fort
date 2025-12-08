const axios = require('axios');
const { MAYAN_URL } = require('../config/mayan');

const MAYAN_USERNAME = process.env.MAYAN_USERNAME || 'admin';
const MAYAN_PASSWORD = process.env.MAYAN_PASSWORD || 'admin123';

class MayanUserService {
  getAuthHeader() {
    return 'Basic ' + Buffer.from(`${MAYAN_USERNAME}:${MAYAN_PASSWORD}`).toString('base64');
  }

  async makeRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${MAYAN_URL}${endpoint}`,
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`[Mayan User] API error (${method} ${endpoint}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Sync a user from Keycloak to Mayan EDMS
   */
  async syncUserToMayan(keycloakUser) {
    try {
      console.log('[Mayan User] Syncing user to Mayan:', keycloakUser.email);

      // Check if user already exists in Mayan
      const existingUser = await this.findUserByUsername(keycloakUser.email);
      
      if (existingUser) {
        console.log('[Mayan User] User already exists in Mayan:', existingUser.id);
        return existingUser;
      }

      // Create user in Mayan
      const mayanUser = await this.createMayanUser({
        username: keycloakUser.email,
        email: keycloakUser.email,
        first_name: keycloakUser.firstName || '',
        last_name: keycloakUser.lastName || '',
        // Generate a random password - user will authenticate via Keycloak
        password: this.generateRandomPassword()
      });

      console.log('[Mayan User] User created in Mayan:', mayanUser.id);
      return mayanUser;
    } catch (error) {
      console.error('[Mayan User] Failed to sync user:', error.message);
      throw error;
    }
  }

  /**
   * Find a user in Mayan by username
   */
  async findUserByUsername(username) {
    try {
      const response = await this.makeRequest('get', `/api/v4/users/?username=${encodeURIComponent(username)}`);
      
      if (response.results && response.results.length > 0) {
        return response.results[0];
      }
      
      return null;
    } catch (error) {
      console.warn('[Mayan User] Error finding user:', error.message);
      return null;
    }
  }

  /**
   * Create a new user in Mayan
   */
  async createMayanUser(userData) {
    try {
      const response = await this.makeRequest('post', '/api/v4/users/', userData);
      return response;
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.username) {
        // User might already exist
        const existing = await this.findUserByUsername(userData.username);
        if (existing) return existing;
      }
      throw new Error(`Failed to create Mayan user: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Get all users from Mayan
   */
  async getMayanUsers() {
    try {
      const response = await this.makeRequest('get', '/api/v4/users/');
      return response.results || [];
    } catch (error) {
      console.error('[Mayan User] Failed to get users:', error.message);
      return [];
    }
  }

  /**
   * Update a user in Mayan
   */
  async updateMayanUser(userId, userData) {
    try {
      const response = await this.makeRequest('patch', `/api/v4/users/${userId}/`, userData);
      return response;
    } catch (error) {
      throw new Error(`Failed to update Mayan user: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Delete a user from Mayan
   */
  async deleteMayanUser(userId) {
    try {
      await this.makeRequest('delete', `/api/v4/users/${userId}/`);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete Mayan user: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Sync all users from Keycloak to Mayan (bulk sync)
   */
  async syncAllUsers(keycloakUsers) {
    const results = {
      synced: [],
      failed: [],
      skipped: []
    };

    for (const user of keycloakUsers) {
      try {
        const existing = await this.findUserByUsername(user.email);
        if (existing) {
          results.skipped.push({ email: user.email, reason: 'already exists' });
          continue;
        }

        const mayanUser = await this.syncUserToMayan(user);
        results.synced.push({ email: user.email, mayanId: mayanUser.id });
      } catch (error) {
        results.failed.push({ email: user.email, error: error.message });
      }
    }

    return results;
  }

  /**
   * Generate a random password for Mayan users
   * Users authenticate via Keycloak, so this is just for Mayan's internal requirements
   */
  generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 24; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}

module.exports = new MayanUserService();
