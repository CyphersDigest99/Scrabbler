/**
 * Utility functions for Scrabbler
 */

// Scrabble letter point values
export const LETTER_POINTS = {
    'A': 1, 'B': 3, 'C': 3, 'D': 2, 'E': 1, 'F': 4, 'G': 2, 'H': 4,
    'I': 1, 'J': 8, 'K': 5, 'L': 1, 'M': 3, 'N': 1, 'O': 1, 'P': 3,
    'Q': 10, 'R': 1, 'S': 1, 'T': 1, 'U': 1, 'V': 4, 'W': 4, 'X': 8,
    'Y': 4, 'Z': 10, '': 0
};

// All letters A-Z
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Calculate Scrabble points for a word
 * @param {string} word - The word to calculate points for
 * @returns {number} - Total point value
 */
export function calculateWordPoints(word) {
    return word.toUpperCase().split('').reduce((sum, letter) => {
        return sum + (LETTER_POINTS[letter] || 0);
    }, 0);
}

/**
 * Get the letter at a specific index (wrapping around)
 * @param {number} index - Index in the alphabet
 * @returns {string} - The letter at that index
 */
export function getLetterAtIndex(index) {
    const wrappedIndex = ((index % 26) + 26) % 26;
    return ALPHABET[wrappedIndex];
}

/**
 * Get the index of a letter in the alphabet
 * @param {string} letter - The letter to find
 * @returns {number} - Index (0-25) or -1 if not found
 */
export function getLetterIndex(letter) {
    return ALPHABET.indexOf(letter.toUpperCase());
}

/**
 * Calculate the shortest rotation direction and distance between two letters
 * @param {string} fromLetter - Starting letter
 * @param {string} toLetter - Target letter
 * @returns {{direction: number, distance: number}} - Direction (-1 or 1) and distance
 */
export function calculateRotation(fromLetter, toLetter) {
    const fromIndex = getLetterIndex(fromLetter);
    const toIndex = getLetterIndex(toLetter);

    if (fromIndex === -1 || toIndex === -1) {
        return { direction: 1, distance: 0 };
    }

    let forwardDistance = (toIndex - fromIndex + 26) % 26;
    let backwardDistance = (fromIndex - toIndex + 26) % 26;

    // Always spin forward (like a cash register) for more visual effect
    // Unless it would require more than 13 positions
    if (forwardDistance <= 13) {
        return { direction: 1, distance: forwardDistance };
    } else {
        return { direction: -1, distance: backwardDistance };
    }
}

/**
 * Generate all permutations of letters (for anagram solving)
 * @param {string} letters - String of letters
 * @returns {Set<string>} - Set of all permutations
 */
export function getPermutations(letters) {
    const results = new Set();

    function permute(arr, current = '') {
        if (arr.length === 0) {
            if (current.length > 0) {
                results.add(current);
            }
            return;
        }

        // Add current as a valid result (for partial words)
        if (current.length > 0) {
            results.add(current);
        }

        for (let i = 0; i < arr.length; i++) {
            const newArr = [...arr.slice(0, i), ...arr.slice(i + 1)];
            permute(newArr, current + arr[i]);
        }
    }

    permute(letters.split(''));
    return results;
}

/**
 * Generate all combinations of letters (subsets)
 * @param {string} letters - String of letters
 * @param {number} minLength - Minimum word length
 * @returns {Set<string>} - Set of all combinations
 */
export function getCombinations(letters, minLength = 2) {
    const results = new Set();
    const letterArray = letters.toUpperCase().split('');

    function combine(index, current, remaining) {
        if (current.length >= minLength) {
            // Generate all permutations of current combination
            const perms = getPermutations(current.join(''));
            perms.forEach(p => {
                if (p.length >= minLength) {
                    results.add(p);
                }
            });
        }

        for (let i = index; i < remaining.length; i++) {
            current.push(remaining[i]);
            combine(i + 1, current, remaining);
            current.pop();
        }
    }

    combine(0, [], letterArray);
    return results;
}

/**
 * Debounce function for performance
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Clamp a number between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Clamped value
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
