const axios = require('axios');
const FormData = require('form-data');
const { MAYAN_URL, getMayanToken } = require('../config/mayan');

class MayanService {
  async makeRequest(method, endpoint, data = null, headers = {}) {
    try {
      const token = await getMayanToken();
      const config = {
        method,
        url: `${MAYAN_URL}${endpoint}`,
        headers: {
          'Authorization': `Token ${token}`,
          ...headers
        }
      };

      if (data) {
        if (data instanceof FormData) {
          config.data = data;
          config.headers = {
            ...config.headers,
            ...data.getHeaders()
          };
        } else {
          config.data = data;
        }
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`Mayan API error (${method} ${endpoint}):`, error.response?.data || error.message);
      throw new Error(`Mayan API request failed: ${error.response?.data?.detail || error.message}`);
    }
  }

  async uploadDocument(file, title, description = '') {
    try {
      // First, get or create a document type
      let documentTypeId;
      try {
        const docTypes = await this.makeRequest('get', '/api/v4/document_types/');
        const generalType = docTypes.results.find(dt => dt.label === 'General Document');
        documentTypeId = generalType ? generalType.id : docTypes.results[0]?.id;
      } catch (error) {
        // If document types endpoint fails, we'll use a default
        documentTypeId = null;
      }

      // Create form data for file upload
      const formData = new FormData();
      formData.append('file', file.buffer, file.originalname);
      if (documentTypeId) {
        formData.append('document_type_id', documentTypeId);
      }
      if (title) {
        formData.append('label', title);
      }
      if (description) {
        formData.append('description', description);
      }

      const result = await this.makeRequest('post', '/api/v4/documents/', formData);
      return result;
    } catch (error) {
      throw new Error(`Failed to upload document to Mayan: ${error.message}`);
    }
  }

  async getDocument(documentId) {
    try {
      const document = await this.makeRequest('get', `/api/v4/documents/${documentId}/`);
      return document;
    } catch (error) {
      throw new Error(`Failed to fetch document from Mayan: ${error.message}`);
    }
  }

  async getDocumentList(page = 1, limit = 10) {
    try {
      const response = await this.makeRequest('get', `/api/v4/documents/?page=${page}&page_size=${limit}`);
      return response;
    } catch (error) {
      throw new Error(`Failed to fetch document list from Mayan: ${error.message}`);
    }
  }

  async getOCRText(documentId) {
    try {
      // Get document pages
      const document = await this.getDocument(documentId);
      const pages = document.pages || [];

      if (pages.length === 0) {
        return '';
      }

      // Get OCR text from all pages
      const ocrTexts = [];
      for (const page of pages) {
        try {
          const ocrData = await this.makeRequest('get', `/api/v4/pages/${page.id}/ocr/`);
          if (ocrData.content) {
            ocrTexts.push(ocrData.content);
          }
        } catch (error) {
          console.warn(`Failed to get OCR for page ${page.id}:`, error.message);
        }
      }

      return ocrTexts.join('\n\n');
    } catch (error) {
      throw new Error(`Failed to get OCR text: ${error.message}`);
    }
  }

  async deleteDocument(documentId) {
    try {
      await this.makeRequest('delete', `/api/v4/documents/${documentId}/`);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete document from Mayan: ${error.message}`);
    }
  }

  async downloadDocument(documentId) {
    try {
      const token = await getMayanToken();
      const response = await axios({
        method: 'get',
        url: `${MAYAN_URL}/api/v4/documents/${documentId}/download/`,
        headers: {
          'Authorization': `Token ${token}`
        },
        responseType: 'stream'
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to download document: ${error.message}`);
    }
  }
}

module.exports = new MayanService();

