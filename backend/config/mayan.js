const MAYAN_URL = process.env.MAYAN_URL || 'http://mayan:8000';
const MAYAN_USERNAME = process.env.MAYAN_USERNAME || 'admin';
const MAYAN_PASSWORD = process.env.MAYAN_PASSWORD || 'admin';

let mayanToken = null;
let tokenExpiry = null;

async function getMayanToken() {
  // Return cached token if still valid
  if (mayanToken && tokenExpiry && Date.now() < tokenExpiry) {
    return mayanToken;
  }

  try {
    const axios = require('axios');
    const response = await axios.post(`${MAYAN_URL}/api/v4/authentication/token/`, {
      username: MAYAN_USERNAME,
      password: MAYAN_PASSWORD
    });

    mayanToken = response.data.token;
    // Token expires in 1 hour, refresh 5 minutes before
    tokenExpiry = Date.now() + (55 * 60 * 1000);

    return mayanToken;
  } catch (error) {
    console.error('Failed to get Mayan token:', error.message);
    throw new Error('Failed to authenticate with Mayan EDMS');
  }
}

module.exports = {
  MAYAN_URL,
  getMayanToken
};

