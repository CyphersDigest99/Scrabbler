/**
 * Guided Tour System
 * Step-by-step walkthrough highlighting UI elements
 */
export class Tour {
    constructor() {
        this.currentStep = 0;
        this.overlay = null;
        this.tooltip = null;
        this.spotlight = null;
        this.isActive = false;

        this.steps = [
            {
                target: '#canvas-container',
                title: 'Letter Wheel',
                content: 'Type letters to spin the drums. Use arrow keys to move between slots and cycle through letters.',
                position: 'bottom'
            },
            {
                target: '#word-lists-btn',
                title: 'Word Lists',
                content: 'Browse helpful word lists: 2-letter words, Q without U, high-scoring letters, and more.',
                position: 'right'
            },
            {
                target: '#random-word-btn',
                title: 'Random Word',
                content: 'Spin a random valid Scrabble word for inspiration or practice.',
                position: 'left'
            },
            {
                target: '.letter-rack-section',
                title: 'Letter Rack',
                content: 'Enter your tiles here. Use ? for blank tiles. Then click "Find Words" to see all valid words you can make.',
                position: 'top'
            },
            {
                target: '#find-words-btn',
                title: 'Find Words',
                content: 'Search for all valid words using your rack letters. Use the filters above to narrow results.',
                position: 'top'
            }
        ];

        this.createElements();
    }

    createElements() {
        // Overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'tour-overlay hidden';
        this.overlay.innerHTML = `
            <div class="tour-spotlight"></div>
        `;
        document.body.appendChild(this.overlay);

        this.spotlight = this.overlay.querySelector('.tour-spotlight');

        // Tooltip
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'tour-tooltip hidden';
        this.tooltip.innerHTML = `
            <div class="tour-tooltip-content">
                <h3 class="tour-title"></h3>
                <p class="tour-text"></p>
                <div class="tour-footer">
                    <span class="tour-progress"></span>
                    <div class="tour-buttons">
                        <button class="tour-skip">Skip Tour</button>
                        <button class="tour-next brass-button">Next</button>
                    </div>
                </div>
            </div>
            <div class="tour-arrow"></div>
        `;
        document.body.appendChild(this.tooltip);

        // Event listeners
        this.tooltip.querySelector('.tour-skip').addEventListener('click', () => this.end());
        this.tooltip.querySelector('.tour-next').addEventListener('click', () => this.next());

        // Close on overlay click (outside spotlight)
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.end();
            }
        });

        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isActive) {
                this.end();
            }
        });
    }

    start() {
        // Check if tour was completed before
        if (localStorage.getItem('scrabbler-tour-completed') === 'true') {
            return false;
        }

        this.isActive = true;
        this.currentStep = 0;
        this.overlay.classList.remove('hidden');
        this.tooltip.classList.remove('hidden');
        this.showStep(0);
        return true;
    }

    forceStart() {
        // Start tour regardless of localStorage
        this.isActive = true;
        this.currentStep = 0;
        this.overlay.classList.remove('hidden');
        this.tooltip.classList.remove('hidden');
        this.showStep(0);
    }

    showStep(index) {
        const step = this.steps[index];
        if (!step) {
            this.end();
            return;
        }

        const target = document.querySelector(step.target);
        if (!target) {
            // Skip to next step if target not found
            this.next();
            return;
        }

        // Update tooltip content
        this.tooltip.querySelector('.tour-title').textContent = step.title;
        this.tooltip.querySelector('.tour-text').textContent = step.content;
        this.tooltip.querySelector('.tour-progress').textContent = `${index + 1} of ${this.steps.length}`;

        // Update button text on last step
        const nextBtn = this.tooltip.querySelector('.tour-next');
        if (index === this.steps.length - 1) {
            nextBtn.textContent = 'Got it!';
        } else {
            nextBtn.textContent = 'Next';
        }

        // Position spotlight and tooltip
        this.positionElements(target, step.position);
    }

    positionElements(target, position) {
        const rect = target.getBoundingClientRect();
        const padding = 10;

        // Position spotlight
        this.spotlight.style.top = `${rect.top - padding + window.scrollY}px`;
        this.spotlight.style.left = `${rect.left - padding}px`;
        this.spotlight.style.width = `${rect.width + padding * 2}px`;
        this.spotlight.style.height = `${rect.height + padding * 2}px`;

        // Scroll element into view if needed
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Position tooltip after a brief delay for scroll
        setTimeout(() => {
            this.positionTooltip(target, position);
        }, 100);
    }

    positionTooltip(target, position) {
        const rect = target.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const arrow = this.tooltip.querySelector('.tour-arrow');
        const margin = 15;

        let top, left;

        // Reset arrow classes
        arrow.className = 'tour-arrow';

        switch (position) {
            case 'top':
                top = rect.top - tooltipRect.height - margin + window.scrollY;
                left = rect.left + (rect.width - tooltipRect.width) / 2;
                arrow.classList.add('arrow-bottom');
                break;
            case 'bottom':
                top = rect.bottom + margin + window.scrollY;
                left = rect.left + (rect.width - tooltipRect.width) / 2;
                arrow.classList.add('arrow-top');
                break;
            case 'left':
                top = rect.top + (rect.height - tooltipRect.height) / 2 + window.scrollY;
                left = rect.left - tooltipRect.width - margin;
                arrow.classList.add('arrow-right');
                break;
            case 'right':
                top = rect.top + (rect.height - tooltipRect.height) / 2 + window.scrollY;
                left = rect.right + margin;
                arrow.classList.add('arrow-left');
                break;
        }

        // Keep tooltip on screen
        left = Math.max(10, Math.min(left, window.innerWidth - tooltipRect.width - 10));
        top = Math.max(10 + window.scrollY, top);

        this.tooltip.style.top = `${top}px`;
        this.tooltip.style.left = `${left}px`;
    }

    next() {
        this.currentStep++;
        if (this.currentStep >= this.steps.length) {
            this.end(true);
        } else {
            this.showStep(this.currentStep);
        }
    }

    end(completed = false) {
        this.isActive = false;
        this.overlay.classList.add('hidden');
        this.tooltip.classList.add('hidden');

        if (completed) {
            localStorage.setItem('scrabbler-tour-completed', 'true');
        }

        // Focus the canvas after tour ends
        const canvas = document.getElementById('letter-wheel-canvas');
        if (canvas) canvas.focus();
    }

    reset() {
        localStorage.removeItem('scrabbler-tour-completed');
    }
}
