import { SceneManager } from './scene.js';
import { LetterWheel } from './letterWheel.js';
import { Dictionary } from './dictionary.js';
import { LetterRack } from './letterRack.js';
import { SearchManager } from './search.js';
import { DefinitionService } from './definitions.js';
import { Tour } from './tour.js';

/**
 * Scrabbler Main Application
 */
class Scrabbler {
    constructor() {
        this.sceneManager = null;
        this.letterWheel = null;
        this.dictionary = null;
        this.letterRack = null;
        this.searchManager = null;
        this.definitionService = null;

        this.init();
    }

    async init() {
        console.log('Initializing Scrabbler...');

        // Get DOM elements
        this.canvas = document.getElementById('letter-wheel-canvas');
        this.validationDisplay = document.getElementById('validation-display');
        this.validationPlate = this.validationDisplay.querySelector('.validation-plate');
        this.validationIcon = document.getElementById('validation-icon');
        this.validationText = document.getElementById('validation-text');
        this.rackContainer = document.getElementById('letter-rack');
        this.findWordsBtn = document.getElementById('find-words-btn');
        this.clearRackBtn = document.getElementById('clear-rack-btn');
        this.anagramResults = document.getElementById('anagram-results');
        this.wordList = document.getElementById('word-list');
        this.brassFrame = document.querySelector('.brass-frame');

        // Create real-time indicator element
        this.realtimeIndicator = document.createElement('div');
        this.realtimeIndicator.className = 'realtime-indicator';
        this.brassFrame.appendChild(this.realtimeIndicator);

        // Definition modal elements
        this.definitionModal = document.getElementById('definition-modal');
        this.definitionWord = document.getElementById('definition-word');
        this.definitionPhonetic = document.getElementById('definition-phonetic');
        this.definitionBody = document.getElementById('definition-body');
        this.closeDefinitionBtn = document.getElementById('close-definition');

        // Initialize definition service
        this.definitionService = new DefinitionService();

        // Pattern mode elements
        this.patternLockToggle = document.getElementById('pattern-lock-toggle');
        this.slotLocksContainer = document.getElementById('slot-locks');
        this.matchCounter = document.getElementById('match-counter');

        // Pattern mode state
        this.patternMode = false;
        this.patternMatches = [];
        this.patternMatchIndex = 0;
        this.lockedSlots = new Array(10).fill(false); // Which slots have locked letters
        this.lockedEmptySlots = new Array(10).fill(false); // Which empty slots are locked

        // Initialize dictionary first
        this.dictionary = new Dictionary();
        try {
            await this.dictionary.load();
        } catch (error) {
            console.error('Failed to load dictionary:', error);
            this.showError('Failed to load dictionary. Please refresh the page.');
            return;
        }

        // Wait for Bungee font to load before creating wheel
        try {
            await document.fonts.load("400 48px 'Bungee'");
            console.log('Bungee font loaded');
        } catch (e) {
            console.warn('Font loading warning:', e);
        }

        // Initialize Three.js scene with error handling
        try {
            this.sceneManager = new SceneManager(this.canvas);

            // Check if WebGL initialized successfully
            if (!this.sceneManager.webGLAvailable || !this.sceneManager.renderer) {
                console.warn('WebGL not available, running in limited mode');
                this.webGLEnabled = false;
            } else {
                this.webGLEnabled = true;

                // Initialize letter wheel
                this.letterWheel = new LetterWheel(
                    this.sceneManager,
                    (word) => this.handleValidation(word)
                );

                // Set up real-time validation callback
                this.letterWheel.setRealtimeValidationCallback(
                    (word) => this.handleRealtimeValidation(word)
                );
            }
        } catch (error) {
            console.error('Failed to initialize 3D graphics:', error);
            this.webGLEnabled = false;
        }

        // Initialize letter rack (works without WebGL)
        this.letterRack = new LetterRack(
            this.rackContainer,
            this.dictionary,
            (words) => this.displayAnagramResults(words)
        );

        // Initialize search manager
        this.searchManager = new SearchManager(this.dictionary);

        // Set up event listeners
        this.setupEventListeners();

        // Set up guided tour
        this.setupTour();

        // Start render loop only if WebGL is enabled
        if (this.webGLEnabled) {
            this.animate();
        }

        console.log('Scrabbler initialized successfully!');
    }

    setupTour() {
        this.tour = new Tour();

        // Start tour for first-time visitors
        this.tour.start();

        // Set up instructions modal
        this.setupInstructionsModal();
    }

    setupInstructionsModal() {
        this.instructionsModal = document.getElementById('instructions-modal');
        const helpBtn = document.getElementById('help-btn');
        const closeBtn = document.getElementById('close-instructions');
        const gotItBtn = document.getElementById('instructions-close-btn');

        // Help button opens instructions
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                this.instructionsModal.classList.remove('hidden');
            });
        }

        // Close button
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeInstructionsModal();
            });
        }

        // Got it button
        if (gotItBtn) {
            gotItBtn.addEventListener('click', () => {
                this.closeInstructionsModal();
            });
        }

        // Click outside to close
        this.instructionsModal.addEventListener('click', (e) => {
            if (e.target === this.instructionsModal) {
                this.closeInstructionsModal();
            }
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.instructionsModal.classList.contains('hidden')) {
                this.closeInstructionsModal();
            }
        });
    }

    closeInstructionsModal() {
        this.instructionsModal.classList.add('hidden');
        this.canvas.focus();
    }

    setupEventListeners() {
        // Only set up letter wheel events if WebGL is enabled
        if (this.webGLEnabled && this.letterWheel) {
            // Canvas click for drum selection
            this.canvas.addEventListener('click', (e) => {
                this.letterWheel.handleClick(e);
                // Focus canvas for keyboard input
                this.canvas.focus();
                // Deactivate letter rack
                this.letterRack.setActive(-1);
            });

            // Make canvas focusable
            this.canvas.tabIndex = 0;

            // Keyboard input for letter wheel
            this.canvas.addEventListener('keydown', (e) => {
                // In pattern mode with matches, intercept Up/Down for cycling
                if (this.patternMode && this.patternMatches.length > 0) {
                    if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        this.cyclePatternMatch(-1);
                        return;
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        this.cyclePatternMatch(1);
                        return;
                    }
                }

                this.letterWheel.handleKeyDown(e);
            });

            // Key up for stopping momentum cycling
            this.canvas.addEventListener('keyup', (e) => {
                this.letterWheel.handleKeyUp(e);
            });

            // Touch events for mobile swipe-to-spin
            this.canvas.addEventListener('touchstart', (e) => {
                this.letterWheel.handleTouchStart(e);
                this.letterRack.setActive(-1);
            }, { passive: false });

            this.canvas.addEventListener('touchmove', (e) => {
                this.letterWheel.handleTouchMove(e);
            }, { passive: false });

            this.canvas.addEventListener('touchend', (e) => {
                this.letterWheel.handleTouchEnd(e);
            });

            // Auto-focus canvas on page load
            this.canvas.focus();
        }

        // Filter inputs
        this.startsWithInput = document.getElementById('starts-with');
        this.endsWithInput = document.getElementById('ends-with');
        this.containsInput = document.getElementById('contains');

        // Find words button
        this.findWordsBtn.addEventListener('click', () => {
            // In pattern mode, use pattern matching
            if (this.patternMode) {
                this.findPatternMatches();
                return;
            }

            // Normal mode - use filter-based search
            const filters = {
                startsWith: this.startsWithInput.value.trim(),
                endsWith: this.endsWithInput.value.trim(),
                contains: this.containsInput.value.trim()
            };
            this.letterRack.findWords(filters);
        });

        // Clear rack button
        this.clearRackBtn.addEventListener('click', () => {
            this.letterRack.clearAll();
            this.startsWithInput.value = '';
            this.endsWithInput.value = '';
            this.containsInput.value = '';
            this.hideAnagramResults();
        });

        // Escape key on canvas clears real-time validation
        this.canvas.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Delete') {
                // Give a short delay for the wheel to update
                setTimeout(() => {
                    const word = this.letterWheel.getCurrentWord();
                    if (word.length < 2) {
                        this.clearRealtimeValidation();
                    }
                }, 100);
            }
        });

        // Hide validation when typing starts
        this.canvas.addEventListener('keydown', (e) => {
            if (/^[a-zA-Z]$/.test(e.key)) {
                this.hideValidation();
            }
        });

        // Definition modal close button
        this.closeDefinitionBtn.addEventListener('click', () => {
            this.hideDefinitionModal();
        });

        // Close modal on background click
        this.definitionModal.addEventListener('click', (e) => {
            if (e.target === this.definitionModal) {
                this.hideDefinitionModal();
            }
        });

        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.definitionModal.classList.contains('hidden')) {
                this.hideDefinitionModal();
            }
        });

        // Real-time indicator click for definition
        this.realtimeIndicator.addEventListener('click', () => {
            if (this.realtimeIndicator.classList.contains('valid')) {
                const word = this.realtimeIndicator.textContent.split(' - ')[0];
                this.showDefinition(word);
            }
        });

        // Word Lists button and modal
        this.wordListsBtn = document.getElementById('word-lists-btn');
        this.wordListsModal = document.getElementById('word-lists-modal');
        this.closeWordListsBtn = document.getElementById('close-word-lists');
        this.wordListsResults = document.getElementById('word-lists-results');
        this.categoryBtns = document.querySelectorAll('.category-btn');

        // Clear wheel button
        this.clearWheelBtn = document.getElementById('clear-wheel-btn');

        // Random word button
        this.randomWordBtn = document.getElementById('random-word-btn');

        this.wordListsBtn.addEventListener('click', () => {
            this.openWordListsModal();
        });

        this.clearWheelBtn.addEventListener('click', () => {
            if (this.patternMode) {
                // In pattern mode, only clear unlocked slots
                this.letterWheel.clearUnlockedSlots(this.lockedSlots);
            } else {
                this.letterWheel.clearAll();
            }
            this.clearRealtimeValidation();
            this.hideValidation();
            // Focus canvas to allow typing
            this.canvas.focus();
        });

        this.randomWordBtn.addEventListener('click', () => {
            this.spinRandomWord();
        });

        this.closeWordListsBtn.addEventListener('click', () => {
            this.closeWordListsModal();
        });

        this.wordListsModal.addEventListener('click', (e) => {
            if (e.target === this.wordListsModal) {
                this.closeWordListsModal();
            }
        });

        this.categoryBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.categoryBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadWordCategory(btn.dataset.category);
            });
        });

        // Word list filter
        this.wordListsSearch = document.getElementById('word-lists-search');
        this.wordListsFilter = document.getElementById('word-lists-filter');
        this.filterPrevBtn = document.getElementById('filter-prev');
        this.filterNextBtn = document.getElementById('filter-next');
        this.filterMatches = [];
        this.filterMatchIndex = 0;

        this.wordListsFilter.addEventListener('input', () => {
            this.filterWordList();
        });

        // Tab or Enter in filter jumps to nav buttons
        this.wordListsFilter.addEventListener('keydown', (e) => {
            if ((e.key === 'Tab' || e.key === 'Enter') && this.filterMatches.length > 0) {
                e.preventDefault();
                this.filterNextBtn.focus();
            }
        });

        this.filterPrevBtn.addEventListener('click', () => {
            this.navigateFilter(-1);
        });

        this.filterNextBtn.addEventListener('click', () => {
            this.navigateFilter(1);
        });

        // Arrow keys on nav buttons
        const handleNavKeydown = (e) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.navigateFilter(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.navigateFilter(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateFilterVertical(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateFilterVertical(1);
            }
        };

        this.filterPrevBtn.addEventListener('keydown', handleNavKeydown);
        this.filterNextBtn.addEventListener('keydown', handleNavKeydown);

        // Close word lists modal on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.wordListsModal.classList.contains('hidden')) {
                this.closeWordListsModal();
            }
        });

        // Pattern lock toggle
        this.patternLockToggle.addEventListener('change', () => {
            this.togglePatternMode(this.patternLockToggle.checked);
        });
    }

    openWordListsModal() {
        this.wordListsModal.classList.remove('hidden');
        this.wordListsResults.innerHTML = '<p class="placeholder">Select a category above to view words</p>';
        this.categoryBtns.forEach(b => b.classList.remove('active'));
        this.wordListsSearch.classList.add('hidden');
        this.wordListsFilter.value = '';
    }

    closeWordListsModal() {
        this.wordListsModal.classList.add('hidden');
        this.wordListsSearch.classList.add('hidden');
        this.wordListsFilter.value = '';
    }

    loadWordCategory(category) {
        let words = [];
        let title = '';

        switch (category) {
            case '2-letter':
                words = this.dictionary.getWordsByLength(2);
                title = `2-Letter Words (${words.length})`;
                break;
            case '3-letter':
                words = this.dictionary.getWordsByLength(3);
                title = `3-Letter Words (${words.length})`;
                break;
            case 'q-no-u':
                words = this.dictionary.getQWithoutU();
                title = `Q without U (${words.length})`;
                break;
            case 'j-words':
                words = this.dictionary.getWordsWithLetter('J');
                title = `J Words (${words.length})`;
                break;
            case 'x-words':
                words = this.dictionary.getWordsWithLetter('X');
                title = `X Words (${words.length})`;
                break;
            case 'q-words':
                words = this.dictionary.getWordsWithLetter('Q');
                title = `Q Words (${words.length})`;
                break;
            case 'z-words':
                words = this.dictionary.getWordsWithLetter('Z');
                title = `Z Words (${words.length})`;
                break;
            case 'vowel-heavy':
                words = this.dictionary.getVowelHeavyWords();
                title = `Vowel Heavy Words (${words.length})`;
                break;
            default:
                words = [];
                title = 'Unknown Category';
        }

        this.displayWordListResults(words, title);
    }

    displayWordListResults(words, title) {
        if (words.length === 0) {
            this.wordListsResults.innerHTML = '<p class="placeholder">No words found in this category</p>';
            return;
        }

        let html = `<p class="category-title">${title}</p>`;
        html += '<div class="word-grid">';

        for (const w of words) {
            let sizeClass = '';
            if (w.word.length >= 8) {
                sizeClass = 'very-long-word';
            } else if (w.word.length >= 6) {
                sizeClass = 'long-word';
            } else if (w.word.length <= 3) {
                sizeClass = 'short-word';
            }
            html += `<div class="word-chip ${sizeClass}" data-word="${w.word}">${w.word}</div>`;
        }

        html += '</div>';
        this.wordListsResults.innerHTML = html;

        // Add alternating row shading based on grid position
        const grid = this.wordListsResults.querySelector('.word-grid');
        const chips = grid.querySelectorAll('.word-chip');

        // Wait for layout to complete, then calculate rows
        requestAnimationFrame(() => {
            let currentTop = null;
            let rowIndex = 0;

            chips.forEach(chip => {
                const top = chip.offsetTop;
                if (currentTop !== top) {
                    if (currentTop !== null) rowIndex++;
                    currentTop = top;
                }
                chip.classList.add(rowIndex % 2 === 0 ? 'row-light' : 'row-dark');
            });
        });

        // Add click handlers for definitions
        this.wordListsResults.querySelectorAll('.word-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const word = chip.dataset.word;
                this.showDefinition(word);
            });
        });

        // Show search field and clear filter
        this.wordListsSearch.classList.remove('hidden');
        this.wordListsFilter.value = '';
    }

    filterWordList() {
        const filter = this.wordListsFilter.value.toUpperCase().trim();
        const chips = this.wordListsResults.querySelectorAll('.word-chip');

        // Reset matches
        this.filterMatches = [];
        this.filterMatchIndex = 0;

        if (!filter) {
            // Clear all highlights and dimming
            chips.forEach(chip => {
                chip.classList.remove('highlight', 'dimmed', 'current-match');
            });
            return;
        }

        chips.forEach(chip => {
            const word = chip.dataset.word;
            chip.classList.remove('current-match');
            if (word.startsWith(filter)) {
                chip.classList.add('highlight');
                chip.classList.remove('dimmed');
                this.filterMatches.push(chip);
            } else {
                chip.classList.remove('highlight');
                chip.classList.add('dimmed');
            }
        });

        // Highlight and scroll to first match
        if (this.filterMatches.length > 0) {
            this.filterMatches[0].classList.add('current-match');
            this.filterMatches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    navigateFilter(direction) {
        if (this.filterMatches.length === 0) return;

        // Remove current highlight
        this.filterMatches[this.filterMatchIndex].classList.remove('current-match');

        // Update index with wrapping
        this.filterMatchIndex += direction;
        if (this.filterMatchIndex >= this.filterMatches.length) {
            this.filterMatchIndex = 0;
        } else if (this.filterMatchIndex < 0) {
            this.filterMatchIndex = this.filterMatches.length - 1;
        }

        // Highlight new current and scroll
        const current = this.filterMatches[this.filterMatchIndex];
        current.classList.add('current-match');
        current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    navigateFilterVertical(direction) {
        if (this.filterMatches.length === 0) return;

        const currentChip = this.filterMatches[this.filterMatchIndex];
        const currentTop = currentChip.offsetTop;
        const currentLeft = currentChip.offsetLeft;

        let bestMatch = null;
        let bestMatchIndex = -1;
        let bestDistance = Infinity;

        // Find match in a different row (up or down)
        for (let i = 0; i < this.filterMatches.length; i++) {
            const chip = this.filterMatches[i];
            const chipTop = chip.offsetTop;
            const chipLeft = chip.offsetLeft;

            // Check if in a different row in the right direction
            const isCorrectDirection = direction > 0 ? chipTop > currentTop : chipTop < currentTop;

            if (isCorrectDirection) {
                // Prefer closest row first, then closest horizontal position
                const verticalDist = Math.abs(chipTop - currentTop);
                const horizontalDist = Math.abs(chipLeft - currentLeft);
                const totalDist = verticalDist * 1000 + horizontalDist; // Weight vertical distance heavily

                if (totalDist < bestDistance) {
                    bestDistance = totalDist;
                    bestMatch = chip;
                    bestMatchIndex = i;
                }
            }
        }

        if (bestMatch) {
            // Remove current highlight
            this.filterMatches[this.filterMatchIndex].classList.remove('current-match');

            // Update to new match
            this.filterMatchIndex = bestMatchIndex;
            bestMatch.classList.add('current-match');
            bestMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    handleValidation(word) {
        const result = this.dictionary.validate(word);

        this.validationPlate.classList.remove('valid', 'invalid');

        if (result.valid) {
            this.validationPlate.classList.add('valid');
            this.validationIcon.textContent = '✓';
            this.validationText.textContent = `VALID - ${result.points} points`;
        } else {
            this.validationPlate.classList.add('invalid');
            this.validationIcon.textContent = '✗';
            this.validationText.textContent = 'NOT IN DICTIONARY';
        }

        this.showValidation();
    }

    showValidation() {
        this.validationDisplay.classList.remove('hidden');
    }

    hideValidation() {
        this.validationDisplay.classList.add('hidden');
    }

    handleRealtimeValidation(word) {
        const result = this.dictionary.validate(word);

        if (result.valid) {
            // Valid word - light up the machine!
            this.brassFrame.classList.add('word-valid');
            this.realtimeIndicator.className = 'realtime-indicator valid visible';
            this.realtimeIndicator.textContent = `${word} - ${result.points} pts`;
        } else {
            // Not valid - normal lights
            this.brassFrame.classList.remove('word-valid');
            this.realtimeIndicator.className = 'realtime-indicator';
        }
    }

    clearRealtimeValidation() {
        this.brassFrame.classList.remove('word-valid');
        this.realtimeIndicator.className = 'realtime-indicator';
    }

    displayAnagramResults(words) {
        if (words.length === 0) {
            this.wordList.innerHTML = '<p style="color: var(--parchment); opacity: 0.7;">No valid words found</p>';
            this.anagramResults.classList.remove('hidden');
            return;
        }

        this.wordList.innerHTML = words.map(w => `
            <div class="word-item" data-word="${w.word}">
                <span class="word">${w.word}</span>
                <span class="points">${w.points} pts</span>
            </div>
        `).join('');

        // Add click handlers for definitions
        this.wordList.querySelectorAll('.word-item').forEach(item => {
            item.addEventListener('click', () => {
                const word = item.dataset.word;
                this.showDefinition(word);
            });
        });

        this.anagramResults.classList.remove('hidden');
    }

    hideAnagramResults() {
        this.anagramResults.classList.add('hidden');
    }

    async showDefinition(word) {
        // Show modal with loading state
        this.definitionWord.textContent = word.toUpperCase();
        this.definitionPhonetic.textContent = '';
        this.definitionBody.innerHTML = '<p class="definition-loading">Loading definition...</p>';
        this.definitionModal.classList.remove('hidden');

        // Fetch definition
        const result = await this.definitionService.getDefinition(word);

        if (!result.found) {
            this.definitionBody.innerHTML = `<p class="definition-not-found">${result.message}</p>`;
            return;
        }

        // Display phonetic if available
        if (result.phonetic) {
            this.definitionPhonetic.textContent = result.phonetic;
        }

        // Build definition HTML
        let html = '';
        for (const meaning of result.meanings) {
            html += `<div class="definition-meaning">`;
            html += `<p class="part-of-speech">${meaning.partOfSpeech}</p>`;
            html += `<ol>`;
            for (const def of meaning.definitions) {
                html += `<li>${def.definition}`;
                if (def.example) {
                    html += `<p class="example">"${def.example}"</p>`;
                }
                html += `</li>`;
            }
            html += `</ol></div>`;
        }

        this.definitionBody.innerHTML = html;
    }

    hideDefinitionModal() {
        this.definitionModal.classList.add('hidden');
    }

    spinRandomWord() {
        // In pattern mode, get a word matching the pattern
        if (this.patternMode) {
            const pattern = this.getPatternFromWheel();
            const lockedEmpty = this.lockedEmptySlots;
            const result = this.dictionary.getRandomPatternWord(pattern, lockedEmpty);

            if (result) {
                this.hideValidation();
                this.clearRealtimeValidation();
                // Use pattern-aware spin that keeps locked slots stationary
                this.letterWheel.spinToPatternWord(result.word, this.lockedSlots, this.lockedEmptySlots, result.startPos);

                // Force validation to show after animations settle
                setTimeout(() => {
                    this.handleRealtimeValidation(result.word);
                }, 1500);
            }
            return;
        }

        // Get a random word from the dictionary (length 3-10 to fit the wheel)
        const minLength = 3;
        const maxLength = this.letterWheel.NUM_SLOTS;
        const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
        const word = this.dictionary.getRandomWord(length);

        if (word) {
            this.hideValidation();
            this.clearRealtimeValidation();
            this.letterWheel.spinToWord(word);
        }
    }

    /**
     * Toggle pattern matching mode
     */
    togglePatternMode(enabled) {
        this.patternMode = enabled;

        if (enabled) {
            // Lock slots that have letters on them
            const currentLetters = this.letterWheel.currentLetters;
            for (let i = 0; i < this.letterWheel.NUM_SLOTS; i++) {
                this.lockedSlots[i] = currentLetters[i] !== '';
            }

            // Update wheel's lock indicators
            this.letterWheel.setLockedSlots(this.lockedSlots);

            // Create slot lock sliders first
            this.createSlotLockSliders();

            // Show slot locks container - remove hidden class
            this.slotLocksContainer.classList.remove('hidden');

            // Clear pattern matches
            this.patternMatches = [];
            this.patternMatchIndex = 0;
            this.updateMatchCounter();
        } else {
            // Clear locked states
            this.lockedSlots.fill(false);
            this.lockedEmptySlots.fill(false);

            // Clear wheel's lock indicators
            this.letterWheel.clearLockIndicators();

            // Hide slot locks
            this.slotLocksContainer.classList.add('hidden');
            this.slotLocksContainer.innerHTML = '';

            // Hide match counter
            this.matchCounter.classList.add('hidden');

            // Clear pattern matches
            this.patternMatches = [];
            this.patternMatchIndex = 0;
        }
    }

    /**
     * Create slot lock sliders for empty positions
     */
    createSlotLockSliders() {
        // Clear existing content
        this.slotLocksContainer.innerHTML = '';

        const currentLetters = this.letterWheel.currentLetters;

        for (let i = 0; i < this.letterWheel.NUM_SLOTS; i++) {
            const slotLock = document.createElement('label');
            slotLock.className = 'slot-lock';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.slot = i;

            // Only enable checkbox for empty slots
            if (currentLetters[i] !== '') {
                checkbox.disabled = true;
                checkbox.checked = true; // Show as locked for slots with letters
                slotLock.classList.add('disabled');
            }

            checkbox.addEventListener('change', (e) => {
                this.lockedEmptySlots[i] = e.target.checked;
            });

            const slider = document.createElement('span');
            slider.className = 'slot-lock-slider';

            slotLock.appendChild(checkbox);
            slotLock.appendChild(slider);
            this.slotLocksContainer.appendChild(slotLock);
        }
    }

    /**
     * Get pattern array from wheel (letters at fixed positions, '' for wildcards)
     */
    getPatternFromWheel() {
        const pattern = [];
        const currentLetters = this.letterWheel.currentLetters;

        for (let i = 0; i < this.letterWheel.NUM_SLOTS; i++) {
            // Only include letter if the slot is locked (has a fixed letter)
            if (this.lockedSlots[i] && currentLetters[i] !== '') {
                pattern.push(currentLetters[i]);
            } else {
                pattern.push('');
            }
        }

        return pattern;
    }

    /**
     * Update match counter display
     */
    updateMatchCounter() {
        if (this.patternMatches.length > 0) {
            this.matchCounter.textContent = `Match ${this.patternMatchIndex + 1} of ${this.patternMatches.length}`;
            this.matchCounter.classList.remove('hidden');
        } else {
            this.matchCounter.classList.add('hidden');
        }
    }

    /**
     * Find pattern matches and display results
     */
    findPatternMatches() {
        const pattern = this.getPatternFromWheel();
        const rackLetters = this.letterRack.getLetters();

        // Find matching words
        this.patternMatches = this.dictionary.findPatternMatches(
            pattern,
            this.lockedEmptySlots,
            rackLetters
        );

        this.patternMatchIndex = 0;

        if (this.patternMatches.length > 0) {
            // Display first match on wheel
            this.displayPatternMatch(0);

            // Display all matches in results section
            this.displayAnagramResults(this.patternMatches);
        } else {
            // No matches found
            this.wordList.innerHTML = '<p style="color: var(--parchment); opacity: 0.7;">No matching words found</p>';
            this.anagramResults.classList.remove('hidden');
        }

        this.updateMatchCounter();
    }

    /**
     * Display a pattern match on the wheel
     */
    displayPatternMatch(index) {
        if (index < 0 || index >= this.patternMatches.length) return;

        const match = this.patternMatches[index];

        // Use pattern-aware spin that keeps locked slots stationary
        // Pass the startPos so the word is placed correctly on the wheel
        this.letterWheel.spinToPatternWord(match.word, this.lockedSlots, this.lockedEmptySlots, match.startPos);

        // Force validation to show after a delay (in case no drums animated)
        setTimeout(() => {
            this.handleRealtimeValidation(match.word);
        }, 1500); // Show validation after animations settle

        // Highlight current word in results list
        const wordItems = this.wordList.querySelectorAll('.word-item');
        wordItems.forEach((item, i) => {
            if (i === index) {
                item.classList.add('current-match');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                item.classList.remove('current-match');
            }
        });

        this.updateMatchCounter();
    }

    /**
     * Cycle through pattern matches
     */
    cyclePatternMatch(direction) {
        if (this.patternMatches.length === 0) return;

        this.patternMatchIndex += direction;

        // Wrap around
        if (this.patternMatchIndex >= this.patternMatches.length) {
            this.patternMatchIndex = 0;
        } else if (this.patternMatchIndex < 0) {
            this.patternMatchIndex = this.patternMatches.length - 1;
        }

        this.displayPatternMatch(this.patternMatchIndex);
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #8b3a3a;
            color: white;
            padding: 20px 40px;
            border-radius: 8px;
            font-size: 1.2rem;
            z-index: 1000;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.sceneManager.render();
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.scrabbler = new Scrabbler();
});
