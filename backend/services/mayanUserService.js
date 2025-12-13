const axios = require('axios');
const { MAYAN_URL } = require('../config/mayan');
const { redis } = require('./redisClient');
const mayanAuthService = require('./mayanAuthService');

const MAYAN_USERNAME = process.env.MAYAN_USERNAME || 'admin';
const MAYAN_PASSWORD = process.env.MAYAN_PASSWORD || 'admin123';

// Mayan group names that map to Keycloak roles
const ROLE_TO_GROUP_MAP = {
  'admin': 'Administrators',
  'user': 'Users'
};

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
   * Sync a user from Keycloak to Mayan EDMS (with role sync)
   * @param {object} keycloakUser - User from Keycloak with roles
   * @returns {object} Mayan user object
   */
  async syncUserToMayan(keycloakUser) {
    try {
      console.log('[Mayan User] Syncing user to Mayan:', keycloakUser.email);

      // Check if user already exists in Mayan
      let mayanUser = await this.findUserByUsername(keycloakUser.email);
      
      if (mayanUser) {
        console.log('[Mayan User] User already exists in Mayan:', mayanUser.id);
      } else {
        // Create user in Mayan
        mayanUser = await this.createMayanUser({
          username: keycloakUser.email,
          email: keycloakUser.email,
          first_name: keycloakUser.firstName || '',
          last_name: keycloakUser.lastName || '',
          // Generate a random password - user will authenticate via Keycloak
          password: this.generateRandomPassword()
        });
        console.log('[Mayan User] User created in Mayan:', mayanUser.id);
      }

      // Sync roles to Mayan groups
      if (keycloakUser.roles && keycloakUser.roles.length > 0) {
        await this.syncUserRoles(mayanUser.id, keycloakUser.roles);
      }

      // Cache the Mayan user ID mapping for mayanAuthService
      if (keycloakUser.id) {
        await mayanAuthService.cacheMayanUserId(keycloakUser.id, mayanUser.id);
      }

      return mayanUser;
    } catch (error) {
      console.error('[Mayan User] Failed to sync user:', error.message);
      throw error;
    }
  }

  /**
   * Sync Keycloak roles to Mayan groups
   * @param {number} mayanUserId - Mayan user ID
   * @param {string[]} keycloakRoles - Array of Keycloak role names
   */
  async syncUserRoles(mayanUserId, keycloakRoles) {
    try {
      console.log(`[Mayan User] Syncing roles for user ${mayanUserId}:`, keycloakRoles);

      // Get or create Mayan groups that correspond to Keycloak roles
      const groups = await this.getMayanGroups();
      
      for (const role of keycloakRoles) {
        const groupName = ROLE_TO_GROUP_MAP[role];
        if (!groupName) continue;

        // Find or create the group
        let group = groups.find(g => g.name === groupName);
        if (!group) {
          group = await this.createMayanGroup(groupName);
          if (group) {
            groups.push(group);
          }
        }

        if (group) {
          await this.addUserToGroup(mayanUserId, group.id);
        }
      }

      // If user has admin role, also make them staff/superuser in Mayan
      if (keycloakRoles.includes('admin')) {
        await this.updateMayanUser(mayanUserId, {
          is_staff: true,
          is_superuser: false // Only true for Mayan admin, not Keycloak admin
        });
        console.log(`[Mayan User] Granted staff access to user ${mayanUserId}`);
      }

    } catch (error) {
      console.warn(`[Mayan User] Failed to sync roles for user ${mayanUserId}:`, error.message);
      // Don't throw - role sync failure shouldn't break login
    }
  }

  /**
   * Get all Mayan groups
   */
  async getMayanGroups() {
    try {
      const response = await this.makeRequest('get', '/api/v4/groups/');
      return response.results || [];
    } catch (error) {
      console.warn('[Mayan User] Failed to get groups:', error.message);
      return [];
    }
  }

  /**
   * Create a Mayan group
   */
  async createMayanGroup(name) {
    try {
      const response = await this.makeRequest('post', '/api/v4/groups/', { name });
      console.log(`[Mayan User] Created group: ${name}`);
      return response;
    } catch (error) {
      if (error.response?.status === 400) {
        // Group might already exist
        const groups = await this.getMayanGroups();
        return groups.find(g => g.name === name);
      }
      console.warn(`[Mayan User] Failed to create group ${name}:`, error.message);
      return null;
    }
  }

  /**
   * Add user to a Mayan group
   * Mayan v4 API: Use user endpoint to add groups, not group endpoint to add users
   */
  async addUserToGroup(userId, groupId) {
    try {
      // Mayan v4: PATCH user with groups list, not POST to groups/users
      // First get current user groups
      const user = await this.makeRequest('get', `/api/v4/users/${userId}/`);
      const currentGroups = (user.groups_pk || []).map(g => g.id || g);
      
      if (!currentGroups.includes(groupId)) {
        // Add new group to list
        await this.makeRequest('patch', `/api/v4/users/${userId}/`, {
          groups_pk: [...currentGroups, groupId]
        });
        console.log(`[Mayan User] Added user ${userId} to group ${groupId}`);
      } else {
        console.log(`[Mayan User] User ${userId} already in group ${groupId}`);
      }
    } catch (error) {
      // Ignore errors - group assignment is not critical
      console.warn(`[Mayan User] Failed to add user ${userId} to group ${groupId}:`, error.message);
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
