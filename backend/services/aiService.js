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
        summary: 'Aucun contenu textuel disponible pour le résumé.',
        keywords: []
      };
    }

    // Check cache
    const cacheKey = `summary_${this.hashText(text.substring(0, 500))}`;
    if (aiCache.has(cacheKey)) {
      return aiCache.get(cacheKey);
    }

    try {
      const prompt = `Tu es un assistant spécialisé dans l'analyse de documents. Analyse le document suivant et fournis:
1. Un résumé concis en 3-4 phrases décrivant le contenu principal du document
2. Les 5 mots-clés les plus importants qui caractérisent ce document

Document:
${text.substring(0, 4000)}

Réponds EXACTEMENT dans ce format:
Résumé: [ton résumé ici]
Mots-clés: [mot1, mot2, mot3, mot4, mot5]`;

      const response = await axios.post(
        `${OLLAMA_URL}/api/generate`,
        {
          model: OLLAMA_MODEL,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_predict: 500
          }
        },
        { timeout: 120000 } // 120 seconds timeout for slower models
      );

      const result = this.parseAIResponse(response.data.response || '');
      
      // Cache the result
      aiCache.set(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('AI service error:', error.message);
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return {
          summary: 'Le service IA est temporairement indisponible. Veuillez réessayer plus tard.',
          keywords: []
        };
      }
      throw new Error(`AI processing failed: ${error.message}`);
    }
  }

  parseAIResponse(response) {
    // Support both French and English formats
    const summaryMatch = response.match(/(?:Résumé|Summary):\s*(.+?)(?=(?:Mots-clés|Keywords):|$)/is);
    const keywordsMatch = response.match(/(?:Mots-clés|Keywords):\s*(.+?)$/is);

    let summary = summaryMatch ? summaryMatch[1].trim() : response.split('\n')[0].trim();
    let keywords = [];

    if (keywordsMatch) {
      const keywordsStr = keywordsMatch[1].trim();
      // Extract keywords from comma-separated or line-separated list
      keywords = keywordsStr
        .split(/[,\n]/)
        .map(k => k.trim().replace(/^[-•\[\]]\s*/, '').replace(/[\[\]]/g, ''))
        .filter(k => k.length > 0 && k.length < 50)
        .slice(0, 5);
    }

    // If no keywords found, try to extract important words from summary
    if (keywords.length === 0) {
      const words = summary.toLowerCase().match(/\b\w{4,}\b/g) || [];
      keywords = [...new Set(words)].slice(0, 5);
    }

    return {
      summary: summary || 'Impossible de générer un résumé.',
      keywords: keywords.length > 0 ? keywords : ['document', 'contenu', 'texte']
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

