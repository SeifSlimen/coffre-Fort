const axios = require('axios');
const FormData = require('form-data');
const { MAYAN_URL } = require('../config/mayan');

const MAYAN_USERNAME = process.env.MAYAN_USERNAME || 'admin';
const MAYAN_PASSWORD = process.env.MAYAN_PASSWORD || 'eGnMEAatPd';

class MayanService {
  async makeRequest(method, endpoint, data = null, headers = {}) {
    try {
      const auth = 'Basic ' + Buffer.from(`${MAYAN_USERNAME}:${MAYAN_PASSWORD}`).toString('base64');

      const url = endpoint.startsWith('http') ? endpoint : `${MAYAN_URL}${endpoint}`;

      const config = {
        method,
        url,
        headers: {
          'Authorization': auth,
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
      // 1. Create document (metadata only)
      let documentTypeId;
      try {
        const docTypes = await this.makeRequest('get', '/api/v4/document_types/');
        const generalType = docTypes.results.find(dt => dt.label === 'General Document');
        documentTypeId = generalType ? generalType.id : docTypes.results[0]?.id;
      } catch (error) {
        documentTypeId = 1; // Default fallback
      }

      const createData = new FormData();
      if (documentTypeId) createData.append('document_type_id', documentTypeId);
      if (title) createData.append('label', title);
      if (description) createData.append('description', description);

      const document = await this.makeRequest('post', '/api/v4/documents/', createData);

      // 2. Upload file content to the new document
      const fileData = new FormData();
      fileData.append('file_new', file.buffer, file.originalname);
      fileData.append('action_name', 'replace'); // Required for file upload in some versions

      await this.makeRequest('post', `/api/v4/documents/${document.id}/files/`, fileData);

      return document;
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
      // 1. Get document to find the latest file
      const document = await this.getDocument(documentId);

      let file = document.file_latest;

      // If no latest file, check the file list
      if (!file) {
        const fileList = await this.makeRequest('get', `/api/v4/documents/${documentId}/files/`);
        if (fileList.results && fileList.results.length > 0) {
          file = fileList.results[0];
        }
      }

      if (!file) {
        console.warn(`No file found for document ${documentId}`);
        return null;
      }

      // 2. Get pages for the file (with pagination)
      let allPages = [];
      let pageUrl = file.page_list_url || `/api/v4/documents/${documentId}/files/${file.id}/pages/`;
      
      // Limit to avoid infinite loops, though unlikely with Mayan's pagination
      let loopCount = 0;
      const MAX_LOOPS = 50; 

      while (pageUrl && loopCount < MAX_LOOPS) {
          const pagesList = await this.makeRequest('get', pageUrl);
          if (pagesList.results) {
              allPages = allPages.concat(pagesList.results);
          }
          pageUrl = pagesList.next;
          loopCount++;
      }

      if (allPages.length === 0) {
        console.warn(`No pages found for file ${file.id}. Pages might be generating.`);
        return 'OCR_PROCESSING';
      }

      // 3. Get the document version for OCR (OCR is on version pages, not file pages)
      const versions = await this.makeRequest('get', `/api/v4/documents/${documentId}/versions/`);
      if (!versions.results || versions.results.length === 0) {
        console.warn(`No versions found for document ${documentId}`);
        return 'OCR_PROCESSING';
      }
      const latestVersion = versions.results.find(v => v.active) || versions.results[0];

      // 4. Get OCR for each page using the version page OCR endpoint
      const ocrTexts = [];

      for (const page of allPages) {
        try {
          // OCR endpoint is: /api/v4/documents/{doc_id}/versions/{version_id}/pages/{page_id}/ocr/
          const ocrUrl = `/api/v4/documents/${documentId}/versions/${latestVersion.id}/pages/${page.id}/ocr/`;
          const ocrData = await this.makeRequest('get', ocrUrl);
          if (ocrData.content) {
            ocrTexts.push(ocrData.content);
          }
        } catch (error) {
          console.warn(`Failed to get OCR for page ${page.id}:`, error.message);
        }
      }

      if (ocrTexts.length === 0) {
          // If we have pages but no text, it might be empty or processing
          return 'OCR_PROCESSING';
      }

      return ocrTexts.join('\n\n');
    } catch (error) {
      console.warn(`Error getting OCR text for document ${documentId}:`, error.message);
      return null;
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
      // Get document to find the latest file ID
      const document = await this.getDocument(documentId);
      let file = document.file_latest;

      if (!file) {
        // Check file list if file_latest is missing
        const fileList = await this.makeRequest('get', `/api/v4/documents/${documentId}/files/`);
        if (fileList.results && fileList.results.length > 0) {
          file = fileList.results[0];
        }
      }

      if (!file) {
        throw new Error('No file found for this document');
      }

      const auth = 'Basic ' + Buffer.from(`${MAYAN_USERNAME}:${MAYAN_PASSWORD}`).toString('base64');
      const response = await axios({
        method: 'get',
        url: `${MAYAN_URL}/api/v4/documents/${documentId}/files/${file.id}/download/`,
        headers: {
          'Authorization': auth
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
