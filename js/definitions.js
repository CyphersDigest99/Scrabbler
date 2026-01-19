/**
 * Word Definition Service
 * Fetches definitions from Free Dictionary API
 */
export class DefinitionService {
    constructor() {
        this.cache = new Map();
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

        try {
            const response = await fetch(this.apiUrl + normalizedWord);

            if (!response.ok) {
                if (response.status === 404) {
                    const result = {
                        word: word.toUpperCase(),
                        found: false,
                        message: 'No definition found for this word.'
                    };
                    this.cache.set(normalizedWord, result);
                    return result;
                }
                throw new Error('API request failed');
            }

            const data = await response.json();
            const result = this.parseDefinition(data[0], word);
            this.cache.set(normalizedWord, result);
            return result;

        } catch (error) {
            console.error('Error fetching definition:', error);
            return {
                word: word.toUpperCase(),
                found: false,
                message: 'Unable to fetch definition. Please try again.'
            };
        }
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
