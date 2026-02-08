/**
 * Word Definition Service
 * Fetches definitions from Free Dictionary API
 */
export class DefinitionService {
    constructor() {
        this.cache = new Map();
        this.maxCacheSize = 500;
        this.pending = new Map(); // Deduplicates in-flight requests
        this.apiUrl = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
    }

    /**
     * Fetch definition for a word
     * @param {string} word - The word to look up
     * @returns {Promise<object>} Definition data
     */
    async getDefinition(word) {
        const normalizedWord = word.toLowerCase().trim();

        // Check cache first
        if (this.cache.has(normalizedWord)) {
            return this.cache.get(normalizedWord);
        }

        // Deduplicate in-flight requests for the same word
        if (this.pending.has(normalizedWord)) {
            return this.pending.get(normalizedWord);
        }

        const request = this._fetchDefinition(normalizedWord, word);
        this.pending.set(normalizedWord, request);

        try {
            return await request;
        } finally {
            this.pending.delete(normalizedWord);
        }
    }

    async _fetchDefinition(normalizedWord, originalWord) {
        try {
            const response = await fetch(this.apiUrl + encodeURIComponent(normalizedWord));

            if (!response.ok) {
                if (response.status === 404) {
                    const result = {
                        word: originalWord.toUpperCase(),
                        found: false,
                        message: 'No definition found for this word.'
                    };
                    this._cacheSet(normalizedWord, result);
                    return result;
                }
                throw new Error('API request failed');
            }

            const data = await response.json();
            const result = this.parseDefinition(data[0], originalWord);
            this._cacheSet(normalizedWord, result);
            return result;

        } catch (error) {
            console.error('Error fetching definition:', error);
            return {
                word: originalWord.toUpperCase(),
                found: false,
                message: 'Unable to fetch definition. Please try again.'
            };
        }
    }

    _cacheSet(key, value) {
        // Evict oldest entry if cache is full (Map iterates in insertion order)
        if (this.cache.size >= this.maxCacheSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        this.cache.set(key, value);
    }

    /**
     * Parse API response into a clean format
     */
    parseDefinition(data, originalWord) {
        const meanings = [];

        if (data.meanings) {
            for (const meaning of data.meanings) {
                const partOfSpeech = meaning.partOfSpeech;
                const definitions = meaning.definitions.slice(0, 3).map(def => ({
                    definition: def.definition,
                    example: def.example || null
                }));

                meanings.push({
                    partOfSpeech,
                    definitions
                });
            }
        }

        return {
            word: originalWord.toUpperCase(),
            found: true,
            phonetic: data.phonetic || null,
            meanings: meanings.slice(0, 3) // Limit to 3 parts of speech
        };
    }
}
