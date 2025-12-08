const axios = require('axios');

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'coffre-fort';
const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN || 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

class KeycloakAdminService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAdminToken() {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      console.log('[Keycloak Admin] Getting admin token from:', `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`);
      
      const response = await axios.post(
        `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
        new URLSearchParams({
          client_id: 'admin-cli',
          username: KEYCLOAK_ADMIN_USER,
          password: KEYCLOAK_ADMIN_PASSWORD,
          grant_type: 'password'
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiry to 90% of the actual expiry time
      this.tokenExpiry = Date.now() + (response.data.expires_in * 900);
      
      console.log('[Keycloak Admin] Successfully obtained admin token');
      return this.accessToken;
    } catch (error) {
      console.error('[Keycloak Admin] Failed to get admin token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Keycloak admin');
    }
  }

  async getUsers() {
    try {
      const token = await this.getAdminToken();
      
      console.log('[Keycloak Admin] Fetching users from realm:', KEYCLOAK_REALM);
      
      const response = await axios.get(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      console.log(`[Keycloak Admin] Found ${response.data.length} users`);

      // Get role mappings for each user
      const usersWithRoles = await Promise.all(
        response.data.map(async (user) => {
          const roles = await this.getUserRoles(user.id);
          return {
            id: user.id,
            username: user.username,
            email: user.email || '',
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            enabled: user.enabled,
            roles: roles
          };
        })
      );

      return usersWithRoles;
    } catch (error) {
      console.error('[Keycloak Admin] Failed to get users:', error.response?.data || error.message);
      throw new Error('Failed to fetch users from Keycloak');
    }
  }

  async getUserRoles(userId) {
    try {
      const token = await this.getAdminToken();
      
      const response = await axios.get(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}/role-mappings/realm`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      return response.data.map(role => role.name);
    } catch (error) {
      console.error('[Keycloak Admin] Failed to get user roles:', error.response?.data || error.message);
      return [];
    }
  }

  async getUserById(userId) {
    try {
      const token = await this.getAdminToken();
      
      const response = await axios.get(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const roles = await this.getUserRoles(userId);
      
      return {
        id: response.data.id,
        username: response.data.username,
        email: response.data.email || '',
        firstName: response.data.firstName || '',
        lastName: response.data.lastName || '',
        enabled: response.data.enabled,
        roles: roles
      };
    } catch (error) {
      console.error('[Keycloak Admin] Failed to get user:', error.response?.data || error.message);
      throw new Error('User not found');
    }
  }

  async getAvailableRoles() {
    try {
      const token = await this.getAdminToken();
      
      const response = await axios.get(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      return response.data.map(role => ({
        id: role.id,
        name: role.name,
        description: role.description
      }));
    } catch (error) {
      console.error('[Keycloak Admin] Failed to get roles:', error.response?.data || error.message);
      return [];
    }
  }

  async createUser(userData) {
    try {
      const token = await this.getAdminToken();
      
      console.log('[Keycloak Admin] Creating user:', userData.email);
      
      // 1. Create the user
      const createResponse = await axios.post(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`,
        {
          username: userData.username || userData.email,
          email: userData.email,
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          enabled: true,
          emailVerified: true,
          credentials: [{
            type: 'password',
            value: userData.password,
            temporary: false
          }]
        },
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Get user ID from Location header
      const locationHeader = createResponse.headers.location || createResponse.headers['location'];
      const userId = locationHeader ? locationHeader.split('/').pop() : null;

      if (!userId) {
        // Try to find the user by username
        const users = await axios.get(
          `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users?username=${encodeURIComponent(userData.username || userData.email)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (users.data && users.data.length > 0) {
          const newUser = users.data[0];
          await this.assignRoleToUser(newUser.id, userData.role || 'user');
          return newUser;
        }
        throw new Error('Could not find created user');
      }

      // 2. Assign role to user
      if (userData.role) {
        await this.assignRoleToUser(userId, userData.role);
      }

      console.log('[Keycloak Admin] User created successfully:', userId);

      return { id: userId, email: userData.email, username: userData.username || userData.email };
    } catch (error) {
      console.error('[Keycloak Admin] Failed to create user:', error.response?.data || error.message);
      
      if (error.response?.status === 409) {
        throw new Error('User with this email or username already exists');
      }
      
      throw new Error(error.response?.data?.errorMessage || 'Failed to create user');
    }
  }

  async assignRoleToUser(userId, roleName) {
    try {
      const token = await this.getAdminToken();
      
      // Get the role by name
      const roleResponse = await axios.get(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles/${roleName}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const role = roleResponse.data;

      // Assign role to user
      await axios.post(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}/role-mappings/realm`,
        [{ id: role.id, name: role.name }],
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`[Keycloak Admin] Assigned role ${roleName} to user ${userId}`);
    } catch (error) {
      console.error('[Keycloak Admin] Failed to assign role:', error.response?.data || error.message);
      // Don't throw - user is created even if role assignment fails
    }
  }

  async updateUser(userId, userData) {
    try {
      const token = await this.getAdminToken();
      
      const updateData = {};
      if (userData.firstName) updateData.firstName = userData.firstName;
      if (userData.lastName) updateData.lastName = userData.lastName;
      if (userData.email) updateData.email = userData.email;
      if (userData.enabled !== undefined) updateData.enabled = userData.enabled;

      await axios.put(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}`,
        updateData,
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Update password if provided
      if (userData.password) {
        await axios.put(
          `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}/reset-password`,
          {
            type: 'password',
            value: userData.password,
            temporary: false
          },
          {
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
      }

      console.log('[Keycloak Admin] User updated:', userId);
      return true;
    } catch (error) {
      console.error('[Keycloak Admin] Failed to update user:', error.response?.data || error.message);
      throw new Error('Failed to update user');
    }
  }

  async deleteUser(userId) {
    try {
      const token = await this.getAdminToken();
      
      await axios.delete(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('[Keycloak Admin] User deleted:', userId);
      return true;
    } catch (error) {
      console.error('[Keycloak Admin] Failed to delete user:', error.response?.data || error.message);
      throw new Error('Failed to delete user');
    }
  }
}

module.exports = new KeycloakAdminService();
