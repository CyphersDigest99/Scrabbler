import { calculateWordPoints, getCombinations } from './utils.js';

/**
 * Dictionary Manager
 * Handles loading the Scrabble dictionary and word validation
 */
export class Dictionary {
    constructor() {
        this.words = new Set();
        this.loaded = false;
        this.loading = false;
    }

    async load() {
        if (this.loaded || this.loading) return;

        this.loading = true;

        try {
            const response = await fetch('data/scrabble-dictionary.txt');
            if (!response.ok) {
                throw new Error(`Failed to load dictionary: ${response.status}`);
            }

            const text = await response.text();

            // Process in chunks to avoid blocking UI on mobile
            await this.processWordsInChunks(text);

            this.loaded = true;
            console.log(`Dictionary loaded: ${this.words.size} words`);
        } catch (error) {
            console.error('Error loading dictionary:', error);
            throw error;
        } finally {
            this.loading = false;
        }
    }

    async processWordsInChunks(text) {
        const lines = text.split(/\r?\n/);
        const chunkSize = 10000; // Process 10k words at a time

        for (let i = 0; i < lines.length; i += chunkSize) {
            const chunk = lines.slice(i, i + chunkSize);

            for (const line of chunk) {
                const word = line.trim().toUpperCase();
                if (word.length > 0) {
                    this.words.add(word);
                }
            }

            // Yield to browser to prevent iOS from killing the page
            if (i + chunkSize < lines.length) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    }

    /**
     * Check if a word is valid
     * @param {string} word - Word to validate
     * @returns {boolean} - True if valid
     */
    isValid(word) {
        if (!this.loaded) {
            console.warn('Dictionary not loaded yet');
            return false;
        }

        return this.words.has(word.toUpperCase());
    }

    /**
     * Validate a word and return detailed result
     * @param {string} word - Word to validate
     * @returns {{valid: boolean, word: string, points: number}}
     */
    validate(word) {
        const upperWord = word.toUpperCase();
        const valid = this.isValid(upperWord);
        const points = valid ? calculateWordPoints(upperWord) : 0;

        return {
            valid,
            word: upperWord,
            points
        };
    }

    /**
     * Find all valid words that can be made from given letters
     * @param {string} letters - Available letters
     * @param {number} minLength - Minimum word length (default 2)
     * @returns {Array<{word: string, points: number}>} - Valid words sorted by points
     */
    findWords(letters, minLength = 2) {
        if (!this.loaded) {
            console.warn('Dictionary not loaded yet');
            return [];
        }

        const combinations = getCombinations(letters, minLength);
        const validWords = [];

        for (const combo of combinations) {
            if (this.words.has(combo)) {
                validWords.push({
                    word: combo,
                    points: calculateWordPoints(combo)
                });
            }
        }

        // Sort by points (descending), then by word length, then alphabetically
        validWords.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.word.length !== a.word.length) return b.word.length - a.word.length;
            return a.word.localeCompare(b.word);
        });

        // Remove duplicates
        const seen = new Set();
        return validWords.filter(w => {
            if (seen.has(w.word)) return false;
            seen.add(w.word);
            return true;
        });
    }

    /**
     * Find words with filters and wildcard support
     * @param {string} letters - Available letters (? = wild tile)
     * @param {number} minLength - Minimum word length
     * @param {Object} filters - {startsWith, endsWith, contains}
     * @returns {Array<{word: string, points: number}>}
     */
    findWordsWithFilters(letters, minLength = 2, filters = {}) {
        if (!this.loaded) {
            console.warn('Dictionary not loaded yet');
            return [];
        }

        const { startsWith = '', endsWith = '', contains = '' } = filters;
        const startsUpper = startsWith.toUpperCase();
        const endsUpper = endsWith.toUpperCase();
        const containsUpper = contains.toUpperCase();

        // Count wildcards and regular letters
        const wildcardCount = (letters.match(/\?/g) || []).length;
        const regularLetters = letters.replace(/\?/g, '').toUpperCase();

        // Check if this is a filter-only search (no rack letters)
        const filterOnlySearch = regularLetters.length === 0 && wildcardCount === 0;

        // Combine rack letters with filter letters (filter letters = already on board)
        const boardLetters = startsUpper + endsUpper + containsUpper;

        const validWords = [];

        // Check each word in dictionary
        for (const word of this.words) {
            if (word.length < minLength) continue;

            // Apply filters
            if (startsUpper && !word.startsWith(startsUpper)) continue;
            if (endsUpper && !word.endsWith(endsUpper)) continue;
            if (containsUpper && !word.includes(containsUpper)) continue;

            // If filter-only search, just add word (no letter check needed)
            if (filterOnlySearch) {
                validWords.push({
                    word,
                    points: calculateWordPoints(word)
                });
                continue;
            }

            // Check if word can be formed with available letters + wildcards
            // Board letters (from filters) are considered "free"
            if (this.canFormWordWithBoard(word, regularLetters, wildcardCount, boardLetters)) {
                validWords.push({
                    word,
                    points: calculateWordPoints(word)
                });
            }
        }

        // Sort by points (descending), then by word length, then alphabetically
        validWords.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.word.length !== a.word.length) return b.word.length - a.word.length;
            return a.word.localeCompare(b.word);
        });

        // Limit results for filter-only searches to prevent overwhelming UI
        if (filterOnlySearch && validWords.length > 200) {
            return validWords.slice(0, 200);
        }

        return validWords;
    }

    /**
     * Check if a word can be formed with given letters and wildcards
     * @param {string} word - Word to check
     * @param {string} letters - Available letters (no wildcards)
     * @param {number} wildcards - Number of wild tiles
     * @returns {boolean}
     */
    canFormWord(word, letters, wildcards) {
        let available = letters.split('');
        let wildcardsNeeded = 0;

        for (const char of word) {
            const index = available.indexOf(char);
            if (index !== -1) {
                available.splice(index, 1);
            } else {
                wildcardsNeeded++;
                if (wildcardsNeeded > wildcards) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Check if a word can be formed with rack letters, wildcards, and board letters
     * Board letters (from filters) are considered "free" - already on the board
     * @param {string} word - Word to check
     * @param {string} rackLetters - Letters in player's rack (no wildcards)
     * @param {number} wildcards - Number of wild tiles
     * @param {string} boardLetters - Letters already on board (from filters)
     * @returns {boolean}
     */
    canFormWordWithBoard(word, rackLetters, wildcards, boardLetters) {
        let availableRack = rackLetters.split('');
        let availableBoard = boardLetters.split('');
        let wildcardsNeeded = 0;

        for (const char of word) {
            // First try to use from board (free letters)
            const boardIndex = availableBoard.indexOf(char);
            if (boardIndex !== -1) {
                availableBoard.splice(boardIndex, 1);
                continue;
            }

            // Then try to use from rack
            const rackIndex = availableRack.indexOf(char);
            if (rackIndex !== -1) {
                availableRack.splice(rackIndex, 1);
                continue;
            }

            // Otherwise need a wildcard
            wildcardsNeeded++;
            if (wildcardsNeeded > wildcards) {
                return false;
            }
        }

        return true;
    }

    /**
     * Find all words containing specific letters
     * @param {string} letters - Letters that must be in the word
     * @param {number} maxResults - Maximum number of results
     * @returns {Array<{word: string, points: number}>}
     */
    findWordsContaining(letters, maxResults = 100) {
        if (!this.loaded) {
            console.warn('Dictionary not loaded yet');
            return [];
        }

        const searchLetters = letters.toUpperCase();
        const results = [];

        for (const word of this.words) {
            // Check if word contains all required letters
            let remaining = word;
            let hasAll = true;

            for (const letter of searchLetters) {
                const index = remaining.indexOf(letter);
                if (index === -1) {
                    hasAll = false;
                    break;
                }
                remaining = remaining.slice(0, index) + remaining.slice(index + 1);
            }

            if (hasAll) {
                results.push({
                    word,
                    points: calculateWordPoints(word)
                });

                if (results.length >= maxResults) break;
            }
        }

        // Sort by points descending
        results.sort((a, b) => b.points - a.points);

        return results;
    }

    /**
     * Get a random valid word (for testing/demo)
     * @param {number} length - Desired word length
     * @returns {string|null}
     */
    getRandomWord(length = 5) {
        if (!this.loaded) return null;

        const wordsOfLength = [...this.words].filter(w => w.length === length);
        if (wordsOfLength.length === 0) return null;

        const randomIndex = Math.floor(Math.random() * wordsOfLength.length);
        return wordsOfLength[randomIndex];
    }

    /**
     * Get all words of a specific length
     * @param {number} length - Word length
     * @returns {Array<{word: string, points: number}>}
     */
    getWordsByLength(length) {
        if (!this.loaded) return [];

        const results = [];
        for (const word of this.words) {
            if (word.length === length) {
                results.push({
                    word,
                    points: calculateWordPoints(word)
                });
            }
        }

        // Sort alphabetically
        results.sort((a, b) => a.word.localeCompare(b.word));
        return results;
    }

    /**
     * Get all Q words that don't require U
     * @returns {Array<{word: string, points: number}>}
     */
    getQWithoutU() {
        if (!this.loaded) return [];

        const results = [];
        for (const word of this.words) {
            if (word.includes('Q') && !word.includes('QU')) {
                results.push({
                    word,
                    points: calculateWordPoints(word)
                });
            }
        }

        // Sort by length then alphabetically
        results.sort((a, b) => {
            if (a.word.length !== b.word.length) return a.word.length - b.word.length;
            return a.word.localeCompare(b.word);
        });
        return results;
    }

    /**
     * Get words containing a specific letter
     * @param {string} letter - The letter to search for
     * @param {number} maxLength - Maximum word length (default 8)
     * @returns {Array<{word: string, points: number}>}
     */
    getWordsWithLetter(letter, maxLength = 8) {
        if (!this.loaded) return [];

        const searchLetter = letter.toUpperCase();
        const results = [];

        for (const word of this.words) {
            if (word.length > maxLength) continue;

            if (word.includes(searchLetter)) {
                results.push({
                    word,
                    points: calculateWordPoints(word)
                });
            }
        }

        // Sort by length then alphabetically
        results.sort((a, b) => {
            if (a.word.length !== b.word.length) return a.word.length - b.word.length;
            return a.word.localeCompare(b.word);
        });

        return results;
    }

    /**
     * Get vowel-heavy words (high vowel to consonant ratio)
     * @param {number} minVowelRatio - Minimum vowel ratio (default 0.6)
     * @param {number} minLength - Minimum word length (default 4)
     * @returns {Array<{word: string, points: number, vowelRatio: number}>}
     */
    getVowelHeavyWords(minVowelRatio = 0.6, minLength = 4) {
        if (!this.loaded) return [];

        const vowels = new Set(['A', 'E', 'I', 'O', 'U']);
        const results = [];

        for (const word of this.words) {
            if (word.length < minLength) continue;

            const vowelCount = [...word].filter(c => vowels.has(c)).length;
            const vowelRatio = vowelCount / word.length;

            if (vowelRatio >= minVowelRatio) {
                results.push({
                    word,
                    points: calculateWordPoints(word),
                    vowelRatio: Math.round(vowelRatio * 100)
                });
            }
        }

        // Sort by vowel ratio descending, then by length
        results.sort((a, b) => {
            if (b.vowelRatio !== a.vowelRatio) return b.vowelRatio - a.vowelRatio;
            return a.word.length - b.word.length;
        });

        return results.slice(0, 200); // Limit results
    }

    /**
     * Find words matching a pattern with fixed letters and available rack letters
     * @param {Array<string>} pattern - Array of letters, '' for wildcards (e.g., ['H', '', 'L', '', ''])
     * @param {Array<boolean>} lockedEmpty - Array indicating which empty slots are locked (can't have letters)
     * @param {string} rackLetters - Available letters from rack (? = wild tile)
     * @returns {Array<{word: string, points: number}>} - Matching words sorted by points
     */
    findPatternMatches(pattern, lockedEmpty, rackLetters) {
        if (!this.loaded) return [];

        const results = [];

        // Count wildcards and regular letters from rack
        const wildcardCount = (rackLetters.match(/\?/g) || []).length;
        const availableLetters = rackLetters.replace(/\?/g, '').toUpperCase();

        // Find the starting position (first fixed letter or first non-locked-empty)
        let startPos = 0;
        for (let i = 0; i < pattern.length; i++) {
            if (pattern[i] !== '' || lockedEmpty[i]) {
                startPos = i;
                break;
            }
        }

        // Find first and last fixed letter positions
        let firstFixedPos = -1;
        let lastFixedPos = -1;
        for (let i = 0; i < pattern.length; i++) {
            if (pattern[i] !== '') {
                if (firstFixedPos === -1) firstFixedPos = i;
                lastFixedPos = i;
            }
        }

        // If no fixed letters, return empty (need at least one anchor)
        if (firstFixedPos === -1) {
            console.log('  No fixed letters in pattern');
            return [];
        }

        // Find first and last available positions (not locked-empty)
        let firstAvailablePos = 0;
        for (let i = 0; i < pattern.length; i++) {
            if (!lockedEmpty[i]) {
                firstAvailablePos = i;
                break;
            }
        }

        let lastAvailablePos = pattern.length - 1;
        for (let i = pattern.length - 1; i >= 0; i--) {
            if (!lockedEmpty[i]) {
                lastAvailablePos = i;
                break;
            }
        }

        // Minimum word length: must span from first to last fixed letter
        const patternSpan = lastFixedPos - firstFixedPos + 1;
        const minLength = Math.max(2, patternSpan);
        // Maximum word length: can fill all available positions
        const maxLength = lastAvailablePos - firstAvailablePos + 1;

        console.log('Pattern matching debug:');
        console.log('  Pattern:', pattern.slice(0, 10).join(','));
        console.log('  FirstFixed:', firstFixedPos, 'LastFixed:', lastFixedPos);
        console.log('  FirstAvail:', firstAvailablePos, 'LastAvail:', lastAvailablePos);
        console.log('  MinLength:', minLength, 'MaxLength:', maxLength);
        console.log('  RackLetters:', rackLetters, 'Wilds:', wildcardCount);

        // Check each word in dictionary
        for (const word of this.words) {
            if (word.length < minLength || word.length > maxLength) continue;

            // Try placing the word at different starting positions
            // Word can start anywhere from firstAvailablePos to (firstFixedPos)
            // as long as it covers all fixed letters
            const earliestStart = firstAvailablePos;
            const latestStart = firstFixedPos; // Word must at least start at or before first fixed letter

            for (let startPos = earliestStart; startPos <= latestStart; startPos++) {
                const endPos = startPos + word.length - 1;

                // Word must cover all fixed letters
                if (endPos < lastFixedPos) continue;
                // Word can't extend past available positions
                if (endPos > lastAvailablePos) continue;

                let matches = true;
                let lettersNeeded = [];

                for (let i = 0; i < word.length; i++) {
                    const wheelPos = startPos + i;
                    const patternChar = pattern[wheelPos] || '';
                    const wordChar = word[i];

                    // If position is locked empty, word can't have a letter there
                    if (lockedEmpty[wheelPos]) {
                        matches = false;
                        break;
                    }

                    // If pattern has a fixed letter, word must match
                    if (patternChar !== '') {
                        if (wordChar !== patternChar.toUpperCase()) {
                            matches = false;
                            break;
                        }
                    } else {
                        // This position needs a letter from the rack
                        lettersNeeded.push(wordChar);
                    }
                }

                if (!matches) continue;

                // Check if we can form the needed letters from rack
                if (this.canFormFromRack(lettersNeeded, availableLetters, wildcardCount)) {
                    results.push({
                        word,
                        points: calculateWordPoints(word),
                        startPos // Store where this word starts on the wheel
                    });
                    break; // Found a valid placement, no need to try others
                }
            }
        }

        console.log('  Total results:', results.length);

        // Sort by points descending, then alphabetically
        results.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            return a.word.localeCompare(b.word);
        });

        return results;
    }

    /**
     * Check if letters can be formed from rack + wildcards
     * @param {Array<string>} needed - Letters needed
     * @param {string} available - Available rack letters
     * @param {number} wildcards - Number of wild tiles
     * @returns {boolean}
     */
    canFormFromRack(needed, available, wildcards) {
        let availableArr = available.split('');
        let wildcardsUsed = 0;

        for (const letter of needed) {
            const index = availableArr.indexOf(letter);
            if (index !== -1) {
                availableArr.splice(index, 1);
            } else {
                wildcardsUsed++;
                if (wildcardsUsed > wildcards) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Get a random word matching a pattern
     * @param {Array<string>} pattern - Pattern array
     * @param {Array<boolean>} lockedEmpty - Locked empty slots
     * @returns {string|null} - Random matching word or null
     */
    getRandomPatternWord(pattern, lockedEmpty) {
        if (!this.loaded) return null;

        // Find first and last fixed letter positions
        let firstFixedPos = -1;
        let lastFixedPos = -1;
        for (let i = 0; i < pattern.length; i++) {
            if (pattern[i] !== '') {
                if (firstFixedPos === -1) firstFixedPos = i;
                lastFixedPos = i;
            }
        }

        // If no fixed letters, return null
        if (firstFixedPos === -1) return null;

        // Find first and last available positions
        let firstAvailablePos = 0;
        for (let i = 0; i < pattern.length; i++) {
            if (!lockedEmpty[i]) {
                firstAvailablePos = i;
                break;
            }
        }

        let lastAvailablePos = pattern.length - 1;
        for (let i = pattern.length - 1; i >= 0; i--) {
            if (!lockedEmpty[i]) {
                lastAvailablePos = i;
                break;
            }
        }

        // Calculate constraints
        const patternSpan = lastFixedPos - firstFixedPos + 1;
        const minLength = Math.max(2, patternSpan);
        const maxLength = lastAvailablePos - firstAvailablePos + 1;

        const matchingWords = [];

        for (const word of this.words) {
            if (word.length < minLength || word.length > maxLength) continue;

            // Try placing the word at different starting positions
            const earliestStart = firstAvailablePos;
            const latestStart = firstFixedPos;

            for (let startPos = earliestStart; startPos <= latestStart; startPos++) {
                const endPos = startPos + word.length - 1;

                if (endPos < lastFixedPos) continue;
                if (endPos > lastAvailablePos) continue;

                let matches = true;

                for (let i = 0; i < word.length; i++) {
                    const wheelPos = startPos + i;

                    if (lockedEmpty[wheelPos]) {
                        matches = false;
                        break;
                    }

                    const patternChar = pattern[wheelPos] || '';
                    if (patternChar !== '' && word[i] !== patternChar.toUpperCase()) {
                        matches = false;
                        break;
                    }
                }

                if (matches) {
                    matchingWords.push({ word, startPos });
                    break;
                }
            }
        }

        if (matchingWords.length === 0) return null;

        const randomIndex = Math.floor(Math.random() * matchingWords.length);
        return matchingWords[randomIndex];
    }
}
