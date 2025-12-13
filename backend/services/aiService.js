const axios = require('axios');
const cacheService = require('./cacheService');
const { cacheKeys, CACHE_TTL } = cacheService;

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:1b';

class AIService {
  constructor() {
    this._modelReady = null;
    this._lastModelCheckAt = 0;
    this._modelCheckInFlight = null;
  }

  async ensureModelReady() {
    const now = Date.now();
    const cacheMs = 60_000;

    if (this._modelReady === true && now - this._lastModelCheckAt < cacheMs) {
      return true;
    }

    if (this._modelCheckInFlight) {
      return this._modelCheckInFlight;
    }

    this._modelCheckInFlight = (async () => {
      this._lastModelCheckAt = now;

      const available = await this.checkModelAvailable();
      if (!available) {
        console.warn(`[AI] Model '${OLLAMA_MODEL}' not available, attempting pull...`);
        const pulled = await this.pullModel();
        if (!pulled) {
          this._modelReady = false;
          return false;
        }
        const availableAfterPull = await this.checkModelAvailable();
        if (!availableAfterPull) {
          this._modelReady = false;
          return false;
        }
      }

      // Warm up the model with a tiny prompt to ensure it's loaded into memory
      try {
        console.log('[AI] Warming up model...');
        await axios.post(
          `${OLLAMA_URL}/api/generate`,
          { model: OLLAMA_MODEL, prompt: 'Hi', stream: false, options: { num_predict: 1 } },
          { timeout: 60000 }
        );
        console.log('[AI] Model warmed up successfully');
      } catch (warmupErr) {
        console.warn('[AI] Warmup failed (non-fatal):', warmupErr.message);
      }

      this._modelReady = true;
      return true;
    })();

    try {
      return await this._modelCheckInFlight;
    } finally {
      this._modelCheckInFlight = null;
    }
  }

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

  isValidSummaryPayload(payload) {
    return (
      payload &&
      typeof payload === 'object' &&
      typeof payload.summary === 'string' &&
      Array.isArray(payload.keywords)
    );
  }

  normalizeTextInput(text) {
    if (typeof text === 'string') return text;
    if (text === null || text === undefined) return '';

    // Defensive: some callers might accidentally pass non-string data.
    try {
      return JSON.stringify(text);
    } catch (_) {
      return String(text);
    }
  }

  async generateSummary(text, forceRefresh = false, documentId = null) {
    const normalizedText = this.normalizeTextInput(text);

    if (!normalizedText || normalizedText.trim().length === 0) {
      return {
        summary: 'Aucun contenu textuel disponible pour le résumé.',
        keywords: []
      };
    }

    // Check Redis cache - use documentId for better key uniqueness
    const textHash = this.hashText(normalizedText.substring(0, 500));
    const docIdStr = documentId ? String(documentId) : 'unknown';
    const cacheKey = cacheKeys.aiSummary(docIdStr, textHash);
    if (!forceRefresh) {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        if (this.isValidSummaryPayload(cached)) {
          console.log(`[AI] Cache HIT for summary (doc: ${docIdStr}, hash: ${textHash})`);
          return cached;
        }

        console.warn(`[AI] Cache HIT but invalid payload shape; evicting key: ${cacheKey}`);
        await cacheService.del(cacheKey);
      }
    }

    console.log(`[AI] Cache MISS for summary (doc: ${docIdStr}, hash: ${textHash}), generating...`);

    try {
      const modelReady = await this.ensureModelReady();
      if (!modelReady) {
        return {
          summary: `Le modèle IA '${OLLAMA_MODEL}' n'est pas disponible. Veuillez le télécharger (ex: 'ollama pull ${OLLAMA_MODEL}') puis réessayer.`,
          keywords: []
        };
      }

      const prompt = `Tu es un assistant spécialisé dans l'analyse de documents. Analyse le document suivant et fournis un résumé et des mots-clés.

IMPORTANT: Ne pas utiliser de formatage markdown (pas de ** ou #). Répondre en texte simple.

Document à analyser:
${normalizedText.substring(0, 4000)}

Réponds dans ce format exact (texte simple, pas de markdown):
Résumé: [Écris ici un résumé concis de 3-4 phrases décrivant le contenu principal]
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
        { timeout: 180000 } // 180 seconds timeout for cold start + generation
      );

      const result = this.parseAIResponse(response.data.response || '');
      
      // Cache the result in Redis (24 hour TTL)
      await cacheService.set(cacheKey, result, CACHE_TTL.AI_SUMMARY);
      console.log(`[AI] Cached summary for doc: ${docIdStr}, hash: ${textHash}`);
      
      return result;
    } catch (error) {
      const errorText = error?.response?.data?.error || error?.response?.data?.detail || error.message;
      console.error('AI service error:', errorText);

      // If Ollama reports missing model, mark as not-ready and return a helpful message.
      if (typeof errorText === 'string' && /model|not\s+found/i.test(errorText)) {
        this._modelReady = false;
        return {
          summary: `Le modèle IA '${OLLAMA_MODEL}' est introuvable côté Ollama. Télécharge-le (ex: 'ollama pull ${OLLAMA_MODEL}') puis réessaye.`,
          keywords: []
        };
      }

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
    // Clean up markdown formatting from the response
    let cleanResponse = response
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove **bold**
      .replace(/\*([^*]+)\*/g, '$1')       // Remove *italic*
      .replace(/^#+\s*/gm, '')              // Remove # headers
      .replace(/^[-•]\s*/gm, '')            // Remove bullet points at line start
      .trim();

    // First, try to extract keywords section (to remove it from summary extraction)
    const keywordsMatch = cleanResponse.match(/(?:Mots[- ]cl[ée]s|Keywords)\s*:\s*(.+?)$/is);
    
    // Remove keywords section from response for cleaner summary extraction
    let textWithoutKeywords = cleanResponse;
    if (keywordsMatch) {
      textWithoutKeywords = cleanResponse.replace(keywordsMatch[0], '').trim();
    }
    
    // Remove the "Résumé:" prefix and any variations - use . to match accented chars reliably
    let summary = textWithoutKeywords
      .replace(/^R.sum.\s*(?:en\s+fran.ais)?\s*:\s*/gim, '')  // Résumé:, Resume:
      .replace(/^Summary\s*:\s*/gim, '')
      .replace(/\nR.sum.\s*:\s*/gi, '\n')  // Also in the middle of text
      .trim();
    
    // If still has multiple lines, join them nicely
    summary = summary.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join(' ')
      .substring(0, 1000);

    let keywords = [];

    if (keywordsMatch && keywordsMatch[1]) {
      const keywordsStr = keywordsMatch[1].trim();
      // Extract keywords from comma-separated, line-separated, or numbered list
      keywords = keywordsStr
        .split(/[,\n]/)
        .map(k => k.trim()
          .replace(/^[-•\d.)\]]\s*/, '')  // Remove bullets and numbers
          .replace(/[\[\]]/g, '')          // Remove brackets
          .replace(/^\d+\.\s*/, '')        // Remove "1. " format
        )
        .filter(k => k.length > 1 && k.length < 50)
        .slice(0, 5);
    }

    // If no keywords found, extract important words from summary
    if (keywords.length === 0 && summary) {
      // French stop words to exclude
      const stopWords = ['dans', 'pour', 'avec', 'cette', 'sont', 'être', 'avoir', 'fait', 'plus', 'comme', 'tout', 'mais', 'aussi', 'leur', 'leurs', 'elle', 'elles', 'nous', 'vous'];
      const words = summary.toLowerCase().match(/\b[a-zàâäéèêëïîôùûüç]{5,}\b/gi) || [];
      keywords = [...new Set(words)]
        .filter(w => !stopWords.includes(w.toLowerCase()))
        .slice(0, 5);
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

  async clearCache() {
    // Clear all AI summary caches
    await cacheService.invalidatePattern('cache:ai:*');
    console.log('[AI] Cache cleared');
  }
}

module.exports = new AIService();

