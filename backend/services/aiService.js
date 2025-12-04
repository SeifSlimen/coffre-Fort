const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:1b';

// In-memory cache for AI responses
const aiCache = new Map();

class AIService {
  async checkModelAvailable() {
    try {
      const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
      const models = response.data.models || [];
      return models.some(model => model.name === OLLAMA_MODEL || model.name.includes(OLLAMA_MODEL.split(':')[0]));
    } catch (error) {
      console.warn('Ollama service not available:', error.message);
      return false;
    }
  }

  async pullModel() {
    try {
      await axios.post(`${OLLAMA_URL}/api/pull`, {
        name: OLLAMA_MODEL
      }, { timeout: 300000 }); // 5 minutes timeout for model pull
      return true;
    } catch (error) {
      console.error('Failed to pull model:', error.message);
      return false;
    }
  }

  async generateSummary(text) {
    if (!text || text.trim().length === 0) {
      return {
        summary: 'No text content available for summarization.',
        keywords: []
      };
    }

    // Check cache
    const cacheKey = `summary_${this.hashText(text.substring(0, 500))}`;
    if (aiCache.has(cacheKey)) {
      return aiCache.get(cacheKey);
    }

    try {
      const prompt = `Summarize the following document in 3-4 sentences and extract 5 key keywords.

Document:
${text.substring(0, 4000)} 

Format your response as:
Summary: [your summary here]
Keywords: [keyword1, keyword2, keyword3, keyword4, keyword5]`;

      const response = await axios.post(
        `${OLLAMA_URL}/api/generate`,
        {
          model: OLLAMA_MODEL,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 500
          }
        },
        { timeout: 60000 } // 60 seconds timeout
      );

      const result = this.parseAIResponse(response.data.response || '');
      
      // Cache the result
      aiCache.set(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('AI service error:', error.message);
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return {
          summary: 'AI service is currently unavailable. Please try again later.',
          keywords: []
        };
      }
      throw new Error(`AI processing failed: ${error.message}`);
    }
  }

  parseAIResponse(response) {
    const summaryMatch = response.match(/Summary:\s*(.+?)(?=Keywords:|$)/is);
    const keywordsMatch = response.match(/Keywords:\s*(.+?)$/is);

    let summary = summaryMatch ? summaryMatch[1].trim() : response.split('\n')[0].trim();
    let keywords = [];

    if (keywordsMatch) {
      const keywordsStr = keywordsMatch[1].trim();
      // Extract keywords from comma-separated or line-separated list
      keywords = keywordsStr
        .split(/[,\n]/)
        .map(k => k.trim().replace(/^[-•]\s*/, ''))
        .filter(k => k.length > 0)
        .slice(0, 5);
    }

    // If no keywords found, try to extract from summary
    if (keywords.length === 0) {
      const words = summary.toLowerCase().match(/\b\w{4,}\b/g) || [];
      keywords = [...new Set(words)].slice(0, 5);
    }

    return {
      summary: summary || 'Unable to generate summary.',
      keywords: keywords.length > 0 ? keywords : ['document', 'text', 'content']
    };
  }

  hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  clearCache() {
    aiCache.clear();
  }
}

module.exports = new AIService();

