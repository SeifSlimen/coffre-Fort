const MAYAN_URL = process.env.MAYAN_URL || 'http://localhost:8000';
const MAYAN_USERNAME = process.env.MAYAN_USERNAME || 'admin';
const MAYAN_PASSWORD = process.env.MAYAN_PASSWORD || 'admin123';

const axios = require('axios');

async function makeMayanRequest(endpoint, method = 'GET', data = null) {
  // Add logging to debug Mayan EDMS requests
  console.log('Making Mayan request to:', `${MAYAN_URL}${endpoint}`);
  console.log('Using creds:', MAYAN_USERNAME);

  try {
    const response = await axios({
      url: `${MAYAN_URL}${endpoint}`,
      method,
      auth: {
        username: MAYAN_USERNAME,
        password: MAYAN_PASSWORD
      },
      data
    });
    return response.data;
  } catch (error) {
    console.error(`Failed to make request to Mayan endpoint ${endpoint}:`, error.response ? error.response.data : error.message);
    throw new Error('Failed to communicate with Mayan EDMS');
  }
}

module.exports = {
  MAYAN_URL,
  makeMayanRequest
};

