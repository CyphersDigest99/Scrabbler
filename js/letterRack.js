import { LETTER_POINTS, ALPHABET } from './utils.js';

/**
 * Letter Rack Component
 * 7-tile Scrabble rack for anagram solving
 */
export class LetterRack {
    constructor(container, dictionary, onWordsFound) {
        this.container = container;
        this.dictionary = dictionary;
        this.onWordsFound = onWordsFound;

        this.NUM_TILES = 7;
        this.tiles = [];
        this.letters = new Array(this.NUM_TILES).fill('');
        this.activeIndex = -1;

        this.init();
    }

    init() {
        this.createTiles();
        this.setupEventListeners();
    }

    createTiles() {
        this.container.innerHTML = '';

        for (let i = 0; i < this.NUM_TILES; i++) {
            const tile = document.createElement('div');
            tile.className = 'tile empty';
            tile.dataset.index = i;
            tile.innerHTML = `
                <span class="tile-letter"></span>
                <span class="tile-points"></span>
            `;

            this.tiles.push(tile);
            this.container.appendChild(tile);
        }
    }

    setupEventListeners() {
        // Click on tiles
        this.tiles.forEach((tile, index) => {
            tile.addEventListener('click', () => this.setActive(index));
        });

        // Global keyboard listener for rack (when a tile is active)
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    setActive(index) {
        // Remove active from all tiles
        this.tiles.forEach(t => t.classList.remove('active'));

        if (index >= 0 && index < this.NUM_TILES) {
            this.activeIndex = index;
            this.tiles[index].classList.add('active');
        } else {
            this.activeIndex = -1;
        }
    }

    handleKeyDown(event) {
        // Only handle if a tile is active and letter wheel doesn't have focus
        if (this.activeIndex === -1) return;

        // Check if focus is on the canvas (letter wheel)
        if (document.activeElement.tagName === 'CANVAS') return;

        // Don't intercept when typing in input fields
        if (document.activeElement.tagName === 'INPUT' ||
            document.activeElement.tagName === 'TEXTAREA') return;

        const key = event.key;

        // Letter input (including ? for wild tile)
        if (/^[a-zA-Z?]$/.test(key)) {
            event.preventDefault();
            const letter = key === '?' ? '?' : key.toUpperCase();
            this.setLetter(this.activeIndex, letter);

            // Auto-advance
            if (this.activeIndex < this.NUM_TILES - 1) {
                this.setActive(this.activeIndex + 1);
            }
            return;
        }

        switch (key) {
            case 'ArrowLeft':
                event.preventDefault();
                if (this.activeIndex > 0) {
                    this.setActive(this.activeIndex - 1);
                }
                break;

            case 'ArrowRight':
                event.preventDefault();
                if (this.activeIndex < this.NUM_TILES - 1) {
                    this.setActive(this.activeIndex + 1);
                }
                break;

            case 'Backspace':
                event.preventDefault();
                this.clearTile(this.activeIndex);
                if (this.activeIndex > 0) {
                    this.setActive(this.activeIndex - 1);
                }
                break;

            case 'Delete':
                event.preventDefault();
                this.clearTile(this.activeIndex);
                break;

            case 'Escape':
                event.preventDefault();
                this.setActive(-1);
                break;
        }
    }

    setLetter(index, letter) {
        if (index < 0 || index >= this.NUM_TILES) return;

        // Allow letters and ? (wild tile)
        const isWild = letter === '?';
        if (!isWild && !ALPHABET.includes(letter.toUpperCase())) return;

        const displayLetter = isWild ? '?' : letter.toUpperCase();
        this.letters[index] = displayLetter;

        const tile = this.tiles[index];
        const letterSpan = tile.querySelector('.tile-letter');
        const pointsSpan = tile.querySelector('.tile-points');

        letterSpan.textContent = displayLetter;
        pointsSpan.textContent = isWild ? '0' : LETTER_POINTS[displayLetter];

        tile.classList.remove('empty');
        tile.classList.toggle('wild', isWild);

        // Animate tile
        tile.style.transform = 'translateY(-5px)';
        setTimeout(() => {
            tile.style.transform = '';
        }, 150);
    }

    clearTile(index) {
        if (index < 0 || index >= this.NUM_TILES) return;

        this.letters[index] = '';

        const tile = this.tiles[index];
        const letterSpan = tile.querySelector('.tile-letter');
        const pointsSpan = tile.querySelector('.tile-points');

        letterSpan.textContent = '';
        pointsSpan.textContent = '';

        tile.classList.add('empty');
        tile.classList.remove('wild');
    }

    clearAll() {
        for (let i = 0; i < this.NUM_TILES; i++) {
            this.clearTile(i);
        }
        this.setActive(-1);
    }

    getLetters() {
        return this.letters.filter(l => l !== '').join('');
    }

    setLetters(letters) {
        this.clearAll();
        const letterArray = letters.toUpperCase().split('');
        letterArray.forEach((letter, index) => {
            if (index < this.NUM_TILES && ALPHABET.includes(letter)) {
                this.setLetter(index, letter);
            }
        });
    }

    findWords(filters = {}) {
        const letters = this.getLetters();
        const hasFilters = filters.startsWith || filters.endsWith || filters.contains;

        // Allow search with just filters (no rack letters required)
        if (letters.length < 2 && !hasFilters) {
            if (this.onWordsFound) {
                this.onWordsFound([]);
            }
            return [];
        }

        const words = this.dictionary.findWordsWithFilters(letters, 2, filters);
        if (this.onWordsFound) {
            this.onWordsFound(words);
        }
        return words;
    }
}
