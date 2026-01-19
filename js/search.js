/**
 * Search utilities for word lookups
 * Phase 2 features: contains-letters search, pattern matching
 */

/**
 * Search Manager
 * Handles advanced word search functionality
 */
export class SearchManager {
    constructor(dictionary) {
        this.dictionary = dictionary;
    }

    /**
     * Find words containing all specified letters
     * @param {string} letters - Letters that must appear in the word
     * @param {Object} options - Search options
     * @returns {Array<{word: string, points: number}>}
     */
    containsLetters(letters, options = {}) {
        const {
            maxResults = 50,
            minLength = 2,
            maxLength = 15
        } = options;

        return this.dictionary.findWordsContaining(letters, maxResults)
            .filter(w => w.word.length >= minLength && w.word.length <= maxLength);
    }

    /**
     * Find words matching a pattern with wildcards
     * @param {string} pattern - Pattern with ? for single char, * for multiple
     * @param {number} maxResults - Maximum results to return
     * @returns {Array<{word: string, points: number}>}
     */
    matchPattern(pattern, maxResults = 50) {
        if (!this.dictionary.loaded) return [];

        // Convert pattern to regex
        const regexPattern = pattern.toUpperCase()
            .replace(/\?/g, '.')      // ? = any single character
            .replace(/\*/g, '.*');     // * = any characters

        const regex = new RegExp(`^${regexPattern}$`);
        const results = [];

        for (const word of this.dictionary.words) {
            if (regex.test(word)) {
                results.push({
                    word,
                    points: this.dictionary.validate(word).points
                });

                if (results.length >= maxResults) break;
            }
        }

        results.sort((a, b) => b.points - a.points);
        return results;
    }

    /**
     * Find anagrams of a word
     * @param {string} word - Word to find anagrams of
     * @returns {Array<{word: string, points: number}>}
     */
    findAnagrams(word) {
        if (!this.dictionary.loaded) return [];

        const sortedLetters = word.toUpperCase().split('').sort().join('');
        const results = [];

        for (const dictWord of this.dictionary.words) {
            if (dictWord.length !== word.length) continue;

            const sortedDict = dictWord.split('').sort().join('');
            if (sortedDict === sortedLetters && dictWord !== word.toUpperCase()) {
                results.push({
                    word: dictWord,
                    points: this.dictionary.validate(dictWord).points
                });
            }
        }

        results.sort((a, b) => b.points - a.points);
        return results;
    }

    /**
     * Find words that can be formed by adding letters to a base word
     * @param {string} baseWord - Starting word
     * @param {string} availableLetters - Additional letters available
     * @returns {Array<{word: string, points: number}>}
     */
    findExtensions(baseWord, availableLetters) {
        if (!this.dictionary.loaded) return [];

        const base = baseWord.toUpperCase();
        const available = availableLetters.toUpperCase();
        const results = [];

        for (const word of this.dictionary.words) {
            if (word.length <= base.length) continue;
            if (!word.includes(base)) continue;

            // Check if remaining letters can be formed from available
            let remaining = word.replace(base, '');
            let canForm = true;
            let tempAvailable = available;

            for (const letter of remaining) {
                const index = tempAvailable.indexOf(letter);
                if (index === -1) {
                    canForm = false;
                    break;
                }
                tempAvailable = tempAvailable.slice(0, index) + tempAvailable.slice(index + 1);
            }

            if (canForm) {
                results.push({
                    word,
                    points: this.dictionary.validate(word).points
                });
            }
        }

        results.sort((a, b) => b.points - a.points);
        return results;
    }
}
