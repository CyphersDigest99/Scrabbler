import * as THREE from 'three';
import { ALPHABET, getLetterIndex, calculateRotation, LETTER_POINTS } from './utils.js';

/**
 * Letter Wheel Component - Horizontal Drum Style
 * Large rotating cylinders like a combination lock / cash register
 * Drums rotate vertically, letters face outward on curved surface
 */
export class LetterWheel {
    constructor(sceneManager, onValidate) {
        this.sceneManager = sceneManager;
        this.onValidate = onValidate;

        this.NUM_SLOTS = 10;
        this.DRUM_RADIUS = 6;      // Large drum radius - extends beyond window
        this.DRUM_WIDTH = 1.5;     // Width of each drum
        this.DRUM_GAP = 0.2;       // Gap between drums
        this.POSITIONS_PER_DRUM = 27; // 26 letters + 1 empty space

        // Center slot for typing start
        this.CENTER_SLOT = Math.floor(this.NUM_SLOTS / 2); // Position 5

        this.drums = [];
        this.currentLetters = new Array(this.NUM_SLOTS).fill('');
        this.cursorPosition = 0; // Start at first slot
        this.focusIndicators = [];

        // Momentum system for held arrow keys
        this.keyHoldStart = 0;
        this.keyHoldInterval = null;
        this.currentKeyDirection = 0;
        this.spinSpeed = 1;

        // Center-outward typing tracking
        this.typingActive = false;
        this.leftmostTyped = this.CENTER_SLOT;
        this.rightmostTyped = this.CENTER_SLOT;

        // Real-time validation
        this.onRealtimeValidation = null;
        this.isCurrentWordValid = false;

        // Previous word for undo
        this.previousWord = '';

        // Pattern mode lock state
        this.lockedSlots = new Array(this.NUM_SLOTS).fill(false);
        this.lockIndicators = [];

        // Touch/swipe state for mobile
        this.touchStartY = 0;
        this.touchStartX = 0;
        this.touchDrumIndex = -1;
        this.touchAccumulatedDelta = 0;
        this.isTouching = false;

        // Momentum/velocity tracking for swipe
        this.touchVelocity = 0;
        this.touchPrevY = 0;
        this.touchPrevTime = 0;
        this.momentumAnimation = null;
        this.velocityHistory = []; // Track recent velocities for smoothing

        this.group = new THREE.Group();

        this.init();
    }

    init() {
        this.createDrums();
        this.createWindowFrame();
        this.createFocusIndicators();
        this.createLockIndicators();
        this.sceneManager.add(this.group);

        // Center the group horizontally
        const totalWidth = this.NUM_SLOTS * (this.DRUM_WIDTH + this.DRUM_GAP) - this.DRUM_GAP;
        this.group.position.x = -totalWidth / 2 + this.DRUM_WIDTH / 2;

        this.updateFocusIndicator();
    }

    createDrums() {
        const envMap = this.sceneManager.getEnvMap();

        for (let i = 0; i < this.NUM_SLOTS; i++) {
            const drum = this.createDrum(i, envMap);
            drum.position.x = i * (this.DRUM_WIDTH + this.DRUM_GAP);
            drum.position.z = 0;
            this.drums.push(drum);
            this.group.add(drum);
        }
    }

    createDrum(index, envMap) {
        const drumGroup = new THREE.Group();

        // Create the main drum cylinder
        // Cylinder axis is along Y by default, we rotate it to be along X (horizontal)
        const drumGeometry = new THREE.CylinderGeometry(
            this.DRUM_RADIUS,
            this.DRUM_RADIUS,
            this.DRUM_WIDTH,
            64,
            1,
            false
        );

        // Rotate so cylinder axis is horizontal (along X axis)
        drumGeometry.rotateZ(Math.PI / 2);

        const drumMaterial = new THREE.MeshStandardMaterial({
            color: 0x6b5b4f,
            metalness: 0.6,
            roughness: 0.5,
            envMap: envMap,
            envMapIntensity: 0.4
        });

        const drumMesh = new THREE.Mesh(drumGeometry, drumMaterial);
        drumGroup.add(drumMesh);

        // Add brass rings/bands around the drum
        this.addDrumBands(drumGroup, envMap);

        // Create letter group that will rotate
        const letterGroup = new THREE.Group();
        letterGroup.userData.isLetterGroup = true;

        // Add letters around the drum circumference
        this.addLettersToDrum(letterGroup);

        drumGroup.add(letterGroup);

        // Add end caps
        this.addEndCaps(drumGroup, envMap);

        // Store rotation state
        drumGroup.userData.currentRotation = 0;
        drumGroup.userData.currentLetter = '';
        drumGroup.userData.letterGroup = letterGroup;

        return drumGroup;
    }

    addDrumBands(drumGroup, envMap) {
        const bandMaterial = new THREE.MeshStandardMaterial({
            color: 0xb5a642,
            metalness: 0.85,
            roughness: 0.25,
            envMap: envMap
        });

        // Rings at edges of drum only
        const ringGeometry = new THREE.TorusGeometry(this.DRUM_RADIUS + 0.05, 0.08, 16, 64);

        const leftRing = new THREE.Mesh(ringGeometry, bandMaterial);
        leftRing.rotation.y = Math.PI / 2;
        leftRing.position.x = -this.DRUM_WIDTH / 2;
        drumGroup.add(leftRing);

        const rightRing = new THREE.Mesh(ringGeometry.clone(), bandMaterial);
        rightRing.rotation.y = Math.PI / 2;
        rightRing.position.x = this.DRUM_WIDTH / 2;
        drumGroup.add(rightRing);
    }

    addLettersToDrum(letterGroup) {
        const angleStep = (Math.PI * 2) / this.POSITIONS_PER_DRUM;

        // Calculate proper plate size based on circumference
        const circumference = 2 * Math.PI * this.DRUM_RADIUS;
        const arcPerLetter = circumference / this.POSITIONS_PER_DRUM;
        this.letterPlateSize = arcPerLetter * 0.95; // Larger plates for more prominent letters

        // Position 0 = empty (default state)
        // Positions 1-26 = A-Z
        // Arranged so pressing DOWN goes A→B→C (letters below come up)
        for (let i = 0; i < this.POSITIONS_PER_DRUM; i++) {
            const isEmptySlot = (i === 0);
            const letter = isEmptySlot ? '' : ALPHABET[i - 1];

            // Negative angle so letters are arranged going downward
            // Position 0 (empty) at front, position 1 (A) below, position 2 (B) below A, etc.
            const angle = -i * angleStep;

            const letterMesh = this.createLetterMesh(letter, isEmptySlot);

            // Position on drum surface
            const radius = this.DRUM_RADIUS;
            letterMesh.position.y = Math.sin(angle) * radius;
            letterMesh.position.z = Math.cos(angle) * radius;
            letterMesh.position.x = 0;

            // Rotate to lie flat on drum surface
            letterMesh.rotation.x = -angle;

            letterMesh.userData.positionIndex = i;
            letterGroup.add(letterMesh);
        }
    }

    createLetterMesh(letter, isEmpty = false) {
        const canvas = document.createElement('canvas');
        const size = 512;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Calculate plate size if not already set
        if (!this.letterPlateSize) {
            const circumference = 2 * Math.PI * this.DRUM_RADIUS;
            this.letterPlateSize = (circumference / this.POSITIONS_PER_DRUM) * 0.85;
        }

        const cornerRadius = 40;

        if (isEmpty) {
            // Empty slot - cream/parchment with subtle "empty" indicator
            ctx.fillStyle = '#e8dfd0';
            ctx.beginPath();
            ctx.roundRect(6, 6, size - 12, size - 12, cornerRadius);
            ctx.fill();

            // Thin brass border
            ctx.strokeStyle = '#8b7d3a';
            ctx.lineWidth = 4;
            ctx.stroke();

            // Dashed line placeholder indicator
            ctx.strokeStyle = '#b5a090';
            ctx.lineWidth = 3;
            ctx.setLineDash([20, 15]);
            ctx.beginPath();
            ctx.moveTo(size * 0.3, size / 2);
            ctx.lineTo(size * 0.7, size / 2);
            ctx.stroke();
            ctx.setLineDash([]);
        } else {
            // Light parchment/cream background
            ctx.fillStyle = '#f5efe6';
            ctx.beginPath();
            ctx.roundRect(6, 6, size - 12, size - 12, cornerRadius);
            ctx.fill();

            // Thin brass border
            ctx.strokeStyle = '#8b7d3a';
            ctx.lineWidth = 4;
            ctx.stroke();

            // Draw the letter - BIG and BOLD and CENTERED - very dark
            const fontSize = Math.floor(size * 0.75);
            ctx.font = `400 ${fontSize}px 'Bungee', Impact, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Main letter - very dark black
            ctx.fillStyle = '#0a0502';
            ctx.fillText(letter, size / 2, size / 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const plateSize = this.letterPlateSize;
        const geometry = new THREE.PlaneGeometry(plateSize, plateSize);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: false,
            side: THREE.FrontSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.letter = letter;
        mesh.userData.isEmpty = isEmpty;

        return mesh;
    }

    addEndCaps(drumGroup, envMap) {
        const capMaterial = new THREE.MeshStandardMaterial({
            color: 0x8b7d3a,
            metalness: 0.8,
            roughness: 0.3,
            envMap: envMap
        });

        // End cap geometry
        const capGeometry = new THREE.CircleGeometry(this.DRUM_RADIUS, 64);

        // Left cap
        const leftCap = new THREE.Mesh(capGeometry, capMaterial);
        leftCap.rotation.y = -Math.PI / 2;
        leftCap.position.x = -this.DRUM_WIDTH / 2 - 0.01;
        drumGroup.add(leftCap);

        // Right cap
        const rightCap = new THREE.Mesh(capGeometry.clone(), capMaterial);
        rightCap.rotation.y = Math.PI / 2;
        rightCap.position.x = this.DRUM_WIDTH / 2 + 0.01;
        drumGroup.add(rightCap);

        // Center hub on caps
        const hubMaterial = new THREE.MeshStandardMaterial({
            color: 0xd4c575,
            metalness: 0.9,
            roughness: 0.2,
            envMap: envMap
        });

        const hubGeometry = new THREE.CylinderGeometry(0.6, 0.6, 0.3, 32);
        hubGeometry.rotateZ(Math.PI / 2);

        const leftHub = new THREE.Mesh(hubGeometry, hubMaterial);
        leftHub.position.x = -this.DRUM_WIDTH / 2 - 0.15;
        drumGroup.add(leftHub);

        const rightHub = new THREE.Mesh(hubGeometry.clone(), hubMaterial);
        rightHub.position.x = this.DRUM_WIDTH / 2 + 0.15;
        drumGroup.add(rightHub);

        // Axle bolt
        const boltMaterial = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            metalness: 0.95,
            roughness: 0.1
        });

        const boltGeometry = new THREE.CylinderGeometry(0.15, 0.15, this.DRUM_WIDTH + 1, 16);
        boltGeometry.rotateZ(Math.PI / 2);
        const bolt = new THREE.Mesh(boltGeometry, boltMaterial);
        drumGroup.add(bolt);
    }

    createWindowFrame() {
        // Create masking panels that hide most of the drum, matching page background
        const frameGroup = new THREE.Group();
        const envMap = this.sceneManager.getEnvMap();

        // Masking material - matches page background color for seamless blend
        const maskMaterial = new THREE.MeshBasicMaterial({
            color: 0x2c2318  // Matches page background gradient middle
        });

        const brassMaterial = new THREE.MeshStandardMaterial({
            color: 0xb5a642,
            metalness: 0.85,
            roughness: 0.25,
            envMap: envMap
        });

        // Calculate dimensions
        const drumsSpan = (this.NUM_SLOTS - 1) * (this.DRUM_WIDTH + this.DRUM_GAP);
        const drumsCenterX = drumsSpan / 2;
        const totalWidth = drumsSpan + this.DRUM_WIDTH + 2;
        const windowHeight = 2.8;
        const panelHeight = this.DRUM_RADIUS + 3;

        // Top masking panel
        const topPanelGeo = new THREE.BoxGeometry(totalWidth + 4, panelHeight, 3);
        const topPanel = new THREE.Mesh(topPanelGeo, maskMaterial);
        topPanel.position.x = drumsCenterX;
        topPanel.position.y = windowHeight / 2 + panelHeight / 2;
        topPanel.position.z = this.DRUM_RADIUS - 0.5;
        frameGroup.add(topPanel);

        // Bottom masking panel
        const bottomPanel = new THREE.Mesh(topPanelGeo.clone(), maskMaterial);
        bottomPanel.position.x = drumsCenterX;
        bottomPanel.position.y = -(windowHeight / 2 + panelHeight / 2);
        bottomPanel.position.z = this.DRUM_RADIUS - 0.5;
        frameGroup.add(bottomPanel);

        // Side panels to hide drum edges
        const sidePanelGeo = new THREE.BoxGeometry(3, windowHeight + panelHeight * 2 + 4, 4);
        const leftSide = new THREE.Mesh(sidePanelGeo, maskMaterial);
        leftSide.position.x = -(this.DRUM_WIDTH + this.DRUM_GAP) / 2 - 1.5;
        leftSide.position.z = this.DRUM_RADIUS - 0.5;
        frameGroup.add(leftSide);

        const rightSide = new THREE.Mesh(sidePanelGeo.clone(), maskMaterial);
        rightSide.position.x = drumsSpan + (this.DRUM_WIDTH + this.DRUM_GAP) / 2 + 1.5;
        rightSide.position.z = this.DRUM_RADIUS - 0.5;
        frameGroup.add(rightSide);

        // Top brass trim bar
        const trimGeo = new THREE.BoxGeometry(totalWidth + 0.5, 0.25, 0.4);
        const topTrim = new THREE.Mesh(trimGeo, brassMaterial);
        topTrim.position.x = drumsCenterX;
        topTrim.position.y = windowHeight / 2 + 0.1;
        topTrim.position.z = this.DRUM_RADIUS + 0.35;
        frameGroup.add(topTrim);

        // Bottom brass trim bar
        const bottomTrim = new THREE.Mesh(trimGeo.clone(), brassMaterial);
        bottomTrim.position.x = drumsCenterX;
        bottomTrim.position.y = -(windowHeight / 2 + 0.1);
        bottomTrim.position.z = this.DRUM_RADIUS + 0.35;
        frameGroup.add(bottomTrim);

        // Vertical dividers between slots
        const dividerGeo = new THREE.BoxGeometry(0.12, windowHeight + 0.3, 0.35);
        for (let i = 0; i <= this.NUM_SLOTS; i++) {
            const divider = new THREE.Mesh(dividerGeo, brassMaterial);
            divider.position.x = i * (this.DRUM_WIDTH + this.DRUM_GAP) - (this.DRUM_WIDTH + this.DRUM_GAP) / 2;
            divider.position.z = this.DRUM_RADIUS + 0.3;
            frameGroup.add(divider);
        }

        this.group.add(frameGroup);
    }

    createFocusIndicators() {
        const frameWidth = this.DRUM_WIDTH + 0.4;
        const frameHeight = 3.2;
        const frameThickness = 0.15;

        for (let i = 0; i < this.NUM_SLOTS; i++) {
            const frameGroup = new THREE.Group();

            const frameMat = new THREE.MeshBasicMaterial({
                color: 0xffdd00,
                transparent: true,
                opacity: 0
            });

            // Create frame edges (top, bottom, left, right)
            const hBarGeo = new THREE.BoxGeometry(frameWidth, frameThickness, 0.1);
            const vBarGeo = new THREE.BoxGeometry(frameThickness, frameHeight, 0.1);

            // Top bar
            const topBar = new THREE.Mesh(hBarGeo, frameMat);
            topBar.position.y = frameHeight / 2;
            frameGroup.add(topBar);

            // Bottom bar
            const bottomBar = new THREE.Mesh(hBarGeo.clone(), frameMat);
            bottomBar.position.y = -frameHeight / 2;
            frameGroup.add(bottomBar);

            // Left bar
            const leftBar = new THREE.Mesh(vBarGeo, frameMat);
            leftBar.position.x = -frameWidth / 2;
            frameGroup.add(leftBar);

            // Right bar
            const rightBar = new THREE.Mesh(vBarGeo.clone(), frameMat);
            rightBar.position.x = frameWidth / 2;
            frameGroup.add(rightBar);

            // Add corner accents for more visibility
            const cornerSize = 0.25;
            const cornerGeo = new THREE.BoxGeometry(cornerSize, cornerSize, 0.12);
            const corners = [
                { x: -frameWidth / 2, y: frameHeight / 2 },
                { x: frameWidth / 2, y: frameHeight / 2 },
                { x: -frameWidth / 2, y: -frameHeight / 2 },
                { x: frameWidth / 2, y: -frameHeight / 2 }
            ];
            corners.forEach(pos => {
                const corner = new THREE.Mesh(cornerGeo, frameMat);
                corner.position.x = pos.x;
                corner.position.y = pos.y;
                frameGroup.add(corner);
            });

            // Position frame around each slot
            frameGroup.position.x = i * (this.DRUM_WIDTH + this.DRUM_GAP);
            frameGroup.position.y = 0;
            frameGroup.position.z = this.DRUM_RADIUS + 0.5;

            frameGroup.userData.material = frameMat;
            this.focusIndicators.push(frameGroup);
            this.group.add(frameGroup);
        }
    }

    updateFocusIndicator() {
        this.focusIndicators.forEach((indicator, index) => {
            const isActive = index === this.cursorPosition;
            const mat = indicator.userData.material;

            gsap.killTweensOf(mat);

            if (isActive) {
                // Bright, fully opaque when active
                gsap.to(mat, {
                    opacity: 1,
                    duration: 0.15
                });
            } else {
                gsap.to(mat, {
                    opacity: 0,
                    duration: 0.15
                });
            }
        });

        // Subtle magnify effect on focused drum only
        this.drums.forEach((drum, index) => {
            const isActive = index === this.cursorPosition;

            gsap.killTweensOf(drum.scale);
            gsap.killTweensOf(drum.position);

            if (isActive) {
                // Focused drum - subtle scale and forward movement
                gsap.to(drum.scale, {
                    x: 1.04,
                    y: 1.04,
                    z: 1.04,
                    duration: 0.25,
                    ease: 'power2.out'
                });
                gsap.to(drum.position, {
                    z: 0.15,
                    duration: 0.25,
                    ease: 'power2.out'
                });
            } else {
                // Return to normal
                gsap.to(drum.scale, {
                    x: 1,
                    y: 1,
                    z: 1,
                    duration: 0.25,
                    ease: 'power2.out'
                });
                gsap.to(drum.position, {
                    z: 0,
                    duration: 0.25,
                    ease: 'power2.out'
                });
            }
        });
    }

    createLockIndicators() {
        const frameWidth = this.DRUM_WIDTH + 0.5;
        const frameHeight = 3.3;
        const frameThickness = 0.18;

        for (let i = 0; i < this.NUM_SLOTS; i++) {
            const frameGroup = new THREE.Group();

            // Orange material for locked state
            const lockMat = new THREE.MeshBasicMaterial({
                color: 0xff6600,
                transparent: true,
                opacity: 0
            });

            // Create frame edges (top, bottom, left, right)
            const hBarGeo = new THREE.BoxGeometry(frameWidth, frameThickness, 0.08);
            const vBarGeo = new THREE.BoxGeometry(frameThickness, frameHeight, 0.08);

            // Top bar
            const topBar = new THREE.Mesh(hBarGeo, lockMat);
            topBar.position.y = frameHeight / 2;
            frameGroup.add(topBar);

            // Bottom bar
            const bottomBar = new THREE.Mesh(hBarGeo.clone(), lockMat);
            bottomBar.position.y = -frameHeight / 2;
            frameGroup.add(bottomBar);

            // Left bar
            const leftBar = new THREE.Mesh(vBarGeo, lockMat);
            leftBar.position.x = -frameWidth / 2;
            frameGroup.add(leftBar);

            // Right bar
            const rightBar = new THREE.Mesh(vBarGeo.clone(), lockMat);
            rightBar.position.x = frameWidth / 2;
            frameGroup.add(rightBar);

            // Position frame around each slot
            frameGroup.position.x = i * (this.DRUM_WIDTH + this.DRUM_GAP);
            frameGroup.position.y = 0;
            frameGroup.position.z = this.DRUM_RADIUS + 0.45;

            frameGroup.userData.material = lockMat;
            this.lockIndicators.push(frameGroup);
            this.group.add(frameGroup);
        }
    }

    /**
     * Set which slots are locked (have fixed letters)
     * @param {Array<boolean>} locked - Array of locked states
     */
    setLockedSlots(locked) {
        this.lockedSlots = locked.slice();
        this.updateLockIndicators();
    }

    /**
     * Update lock indicator visibility
     */
    updateLockIndicators() {
        this.lockIndicators.forEach((indicator, index) => {
            const isLocked = this.lockedSlots[index];
            const mat = indicator.userData.material;

            gsap.killTweensOf(mat);

            if (isLocked) {
                gsap.to(mat, {
                    opacity: 0.85,
                    duration: 0.2
                });
            } else {
                gsap.to(mat, {
                    opacity: 0,
                    duration: 0.2
                });
            }
        });
    }

    /**
     * Clear all lock indicators
     */
    clearLockIndicators() {
        this.lockedSlots.fill(false);
        this.updateLockIndicators();
    }

    /**
     * Motion blur disabled - was affecting all drums instead of just spinning one
     */
    applyMotionBlur(enable) {
        // Disabled: CSS blur affects entire canvas
    }

    /**
     * Motion blur disabled
     */
    updateMotionBlur(remaining) {
        // Disabled: CSS blur affects entire canvas
    }

    /**
     * Get position index for a letter (0=empty, 1=A, 2=B, ... 26=Z)
     */
    getPositionIndex(letter) {
        if (!letter || letter === '') return 0; // Empty position
        const idx = getLetterIndex(letter.toUpperCase());
        return idx >= 0 ? idx + 1 : 0;
    }

    /**
     * Spin to a specific letter or empty - used when typing
     * Includes dramatic extra spins for slot machine feel
     */
    spinToLetter(slotIndex, letter, addDrama = true) {
        if (slotIndex < 0 || slotIndex >= this.NUM_SLOTS) return;

        const drum = this.drums[slotIndex];
        const letterGroup = drum.userData.letterGroup;
        if (!letterGroup) return;

        // Kill any existing animation on this drum
        gsap.killTweensOf(letterGroup.rotation);

        const targetLetter = letter ? letter.toUpperCase() : '';
        const currentLetter = this.currentLetters[slotIndex] || '';

        // Get position indices (0=empty, 1=A, 2=B, etc.)
        const targetPos = this.getPositionIndex(targetLetter);
        const currentPos = this.getPositionIndex(currentLetter);
        const distance = Math.abs(targetPos - currentPos);

        const anglePerPosition = (Math.PI * 2) / this.POSITIONS_PER_DRUM;

        // Target rotation - negative because letters are arranged going downward
        const targetRotation = -targetPos * anglePerPosition;
        const currentRotation = drum.userData.currentRotation || 0;

        // Calculate rotation delta
        let rotationDelta = targetRotation - currentRotation;

        // Normalize to range [-π, π]
        while (rotationDelta > Math.PI) rotationDelta -= Math.PI * 2;
        while (rotationDelta < -Math.PI) rotationDelta += Math.PI * 2;

        // Only add extra spins for typed letters
        let duration = 0.25;
        let useBlur = false;
        if (addDrama && distance > 0) {
            const extraSpins = Math.floor(distance / 10) + 1;
            rotationDelta += extraSpins * Math.PI * 2;
            duration = 0.35 + (extraSpins * 0.08);
            useBlur = true;
        }

        const newRotation = currentRotation + rotationDelta;

        // Apply motion blur effect for fast spins
        if (useBlur) {
            this.applyMotionBlur(true);
        }

        // Animate with snap-to effect at end
        gsap.to(letterGroup.rotation, {
            x: newRotation,
            duration: duration,
            ease: addDrama ? 'power2.out' : 'power3.out',
            onUpdate: () => {
                // Reduce blur as spin slows down
                if (useBlur) {
                    const progress = gsap.getProperty(letterGroup.rotation, 'x');
                    const remaining = Math.abs(newRotation - progress) / Math.abs(rotationDelta);
                    this.updateMotionBlur(remaining);
                }
            },
            onComplete: () => {
                drum.userData.currentRotation = newRotation;
                this.snapToPosition(slotIndex);
                this.applyMotionBlur(false);
                // Trigger real-time validation
                this.checkRealtimeValidation();
            }
        });

        this.currentLetters[slotIndex] = targetLetter;
        drum.userData.currentLetter = targetLetter;
    }

    /**
     * Snap drum to exact position (removes any drift)
     */
    snapToPosition(slotIndex) {
        const drum = this.drums[slotIndex];
        const letterGroup = drum.userData.letterGroup;
        if (!letterGroup) return;

        const currentLetter = this.currentLetters[slotIndex];
        const posIndex = this.getPositionIndex(currentLetter);

        const anglePerPosition = (Math.PI * 2) / this.POSITIONS_PER_DRUM;
        const exactRotation = -posIndex * anglePerPosition;

        // Calculate how many full rotations we've done
        const fullRotations = Math.round(drum.userData.currentRotation / (Math.PI * 2));
        const snappedRotation = fullRotations * Math.PI * 2 + exactRotation;

        letterGroup.rotation.x = snappedRotation;
        drum.userData.currentRotation = snappedRotation;
    }

    /**
     * Check if current word is valid and trigger visual feedback
     */
    checkRealtimeValidation() {
        const word = this.getCurrentWord();
        if (this.onRealtimeValidation && word.length >= 2) {
            this.onRealtimeValidation(word);
        }
    }

    /**
     * Set callback for real-time validation
     */
    setRealtimeValidationCallback(callback) {
        this.onRealtimeValidation = callback;
    }

    clearSlot(slotIndex) {
        if (slotIndex < 0 || slotIndex >= this.NUM_SLOTS) return;

        // Spin to empty position (index 0)
        this.spinToLetter(slotIndex, '', false);
    }

    /**
     * Handle backspace - clear letters, checking right side first
     */
    handleBackspace() {
        // First check if there are any letters to the right of cursor
        for (let i = this.NUM_SLOTS - 1; i > this.cursorPosition; i--) {
            if (this.currentLetters[i]) {
                this.setCursor(i);
                this.clearSlot(i);
                return;
            }
        }

        // No letters to the right, handle current position and left
        if (this.currentLetters[this.cursorPosition]) {
            this.clearSlot(this.cursorPosition);
            if (this.cursorPosition > 0) {
                this.moveCursor(-1);
            }
        } else {
            // Current slot is empty, move left first then clear
            if (this.cursorPosition > 0) {
                this.moveCursor(-1);
                if (this.currentLetters[this.cursorPosition]) {
                    this.clearSlot(this.cursorPosition);
                }
            }
        }
    }

    /**
     * Cycle to next/previous letter - used by arrow keys
     * No drama spins, just smooth single-letter movement
     * Position 0 = empty, 1-26 = A-Z
     */
    cycleLetter(direction, speed = 1) {
        const slotIndex = this.cursorPosition;
        const currentLetter = this.currentLetters[slotIndex] || '';
        const currentPos = this.getPositionIndex(currentLetter);

        // Speed determines how many positions to skip (for momentum)
        const skip = Math.min(Math.floor(speed), 5);

        // Calculate new position, wrapping around 0-26
        let newPos = currentPos + (direction * skip);
        newPos = ((newPos % this.POSITIONS_PER_DRUM) + this.POSITIONS_PER_DRUM) % this.POSITIONS_PER_DRUM;

        // Convert position back to letter (0 = empty, 1-26 = A-Z)
        const newLetter = newPos === 0 ? '' : ALPHABET[newPos - 1];

        // Use no-drama version for arrow key navigation
        this.spinToLetter(slotIndex, newLetter, false);
    }

    /**
     * Get next slot for center-outward typing
     * Returns the next available slot, alternating left and right from center
     */
    getNextTypingSlot() {
        // If no typing yet, start at center
        if (!this.typingActive) {
            return this.CENTER_SLOT;
        }

        // Check if we can expand left or right
        const canExpandLeft = this.leftmostTyped > 0;
        const canExpandRight = this.rightmostTyped < this.NUM_SLOTS - 1;

        if (!canExpandLeft && !canExpandRight) {
            return -1; // No more room
        }

        // Calculate distances from center
        const leftDist = this.CENTER_SLOT - this.leftmostTyped;
        const rightDist = this.rightmostTyped - this.CENTER_SLOT;

        // Prefer the side that's less extended, or right if equal
        if (canExpandRight && (!canExpandLeft || rightDist <= leftDist)) {
            return this.rightmostTyped + 1;
        } else {
            return this.leftmostTyped - 1;
        }
    }

    /**
     * Handle typing a letter - center-outward expansion
     */
    typeLetter(letter) {
        if (!ALPHABET.includes(letter.toUpperCase())) return;

        const nextSlot = this.getNextTypingSlot();
        if (nextSlot === -1) return; // No room

        // Update typing state
        if (!this.typingActive) {
            this.typingActive = true;
            this.leftmostTyped = nextSlot;
            this.rightmostTyped = nextSlot;
        } else {
            if (nextSlot < this.leftmostTyped) this.leftmostTyped = nextSlot;
            if (nextSlot > this.rightmostTyped) this.rightmostTyped = nextSlot;
        }

        // Spin to the letter with drama
        this.spinToLetter(nextSlot, letter.toUpperCase(), true);

        // Move cursor to the typed slot
        this.setCursor(nextSlot);
    }

    /**
     * Start continuous cycling when key is held
     */
    startKeyCycle(direction) {
        this.stopKeyCycle(); // Clear any existing

        this.currentKeyDirection = direction;
        this.keyHoldStart = Date.now();
        this.spinSpeed = 1;

        // Initial cycle
        this.cycleLetter(direction, 1);

        // Set up accelerating repeat
        this.keyHoldInterval = setInterval(() => {
            const holdDuration = Date.now() - this.keyHoldStart;

            // Accelerate after 300ms, max speed after 1.5s
            if (holdDuration > 300) {
                this.spinSpeed = Math.min(1 + (holdDuration - 300) / 400, 4);
            }

            this.cycleLetter(this.currentKeyDirection, this.spinSpeed);
        }, 120); // Repeat every 120ms
    }

    /**
     * Stop continuous cycling and snap to nearest letter
     */
    stopKeyCycle() {
        if (this.keyHoldInterval) {
            clearInterval(this.keyHoldInterval);
            this.keyHoldInterval = null;
        }
        this.currentKeyDirection = 0;
        this.spinSpeed = 1;

        // Snap current drum to exact position
        this.snapToPosition(this.cursorPosition);
    }

    moveCursor(direction) {
        const newPosition = this.cursorPosition + direction;
        if (newPosition >= 0 && newPosition < this.NUM_SLOTS) {
            this.cursorPosition = newPosition;
            this.updateFocusIndicator();
        }
    }

    setCursor(position) {
        if (position >= 0 && position < this.NUM_SLOTS) {
            this.cursorPosition = position;
            this.updateFocusIndicator();
        }
    }

    handleKeyDown(event) {
        const key = event.key;

        // Ignore repeats for arrow up/down (we handle our own repeat with momentum)
        if (event.repeat && (key === 'ArrowUp' || key === 'ArrowDown')) {
            event.preventDefault();
            return;
        }

        if (/^[a-zA-Z]$/.test(key)) {
            event.preventDefault();
            this.stopKeyCycle(); // Stop any cycling
            // Type letter in focused slot only
            this.spinToLetter(this.cursorPosition, key.toUpperCase(), true);
            // Auto-advance cursor to the right
            if (this.cursorPosition < this.NUM_SLOTS - 1) {
                this.moveCursor(1);
            }
            return;
        }

        switch (key) {
            case 'ArrowLeft':
                event.preventDefault();
                this.stopKeyCycle();
                this.moveCursor(-1);
                break;
            case 'ArrowRight':
                event.preventDefault();
                this.stopKeyCycle();
                this.moveCursor(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.startKeyCycle(-1); // Cycle backward (toward A)
                break;
            case 'ArrowDown':
                event.preventDefault();
                this.startKeyCycle(1); // Cycle forward (toward Z)
                break;
            case 'Backspace':
                event.preventDefault();
                this.stopKeyCycle();
                this.handleBackspace();
                break;
            case 'Delete':
                event.preventDefault();
                this.stopKeyCycle();
                this.clearAll();
                break;
            case 'Enter':
                event.preventDefault();
                this.stopKeyCycle();
                this.validate();
                break;
            case 'Escape':
                event.preventDefault();
                this.stopKeyCycle();
                this.clearAll();
                break;
        }
    }

    handleKeyUp(event) {
        const key = event.key;

        // Stop cycling when arrow keys are released
        if (key === 'ArrowUp' || key === 'ArrowDown') {
            event.preventDefault();
            this.stopKeyCycle();
        }
    }

    handleClick(event) {
        const canvas = this.sceneManager.canvas;
        const rect = canvas.getBoundingClientRect();

        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.sceneManager.camera);

        const intersects = raycaster.intersectObjects(this.drums, true);

        if (intersects.length > 0) {
            let clickedDrum = intersects[0].object;
            while (clickedDrum.parent && !this.drums.includes(clickedDrum)) {
                clickedDrum = clickedDrum.parent;
            }

            const drumIndex = this.drums.indexOf(clickedDrum);
            if (drumIndex !== -1) {
                this.setCursor(drumIndex);
            }
        }
    }

    // Touch handlers for mobile swipe-to-spin
    handleTouchStart(event) {
        if (event.touches.length !== 1) return;

        const touch = event.touches[0];
        const canvas = this.sceneManager.canvas;
        const rect = canvas.getBoundingClientRect();

        // Convert touch to normalized device coordinates
        const mouse = new THREE.Vector2(
            ((touch.clientX - rect.left) / rect.width) * 2 - 1,
            -((touch.clientY - rect.top) / rect.height) * 2 + 1
        );

        // Raycast to find which drum was touched
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.sceneManager.camera);
        const intersects = raycaster.intersectObjects(this.drums, true);

        if (intersects.length > 0) {
            let touchedDrum = intersects[0].object;
            while (touchedDrum.parent && !this.drums.includes(touchedDrum)) {
                touchedDrum = touchedDrum.parent;
            }

            const drumIndex = this.drums.indexOf(touchedDrum);
            if (drumIndex !== -1) {
                // Cancel any existing momentum animation
                this.stopMomentum();

                this.isTouching = true;
                this.touchDrumIndex = drumIndex;
                this.touchStartY = touch.clientY;
                this.touchStartX = touch.clientX;
                this.touchAccumulatedDelta = 0;

                // Initialize velocity tracking
                this.touchPrevY = touch.clientY;
                this.touchPrevTime = performance.now();
                this.touchVelocity = 0;
                this.velocityHistory = [];

                // Set cursor to this drum
                this.setCursor(drumIndex);

                event.preventDefault();
            }
        }
    }

    handleTouchMove(event) {
        if (!this.isTouching || this.touchDrumIndex === -1) return;
        if (event.touches.length !== 1) return;

        event.preventDefault();

        const touch = event.touches[0];
        const now = performance.now();
        const deltaY = this.touchStartY - touch.clientY; // Positive = swipe up
        const deltaTime = now - this.touchPrevTime;

        // Calculate instantaneous velocity (pixels per ms)
        if (deltaTime > 0) {
            const instantVelocity = (this.touchPrevY - touch.clientY) / deltaTime;

            // Add to velocity history for smoothing (keep last 5 samples)
            this.velocityHistory.push(instantVelocity);
            if (this.velocityHistory.length > 5) {
                this.velocityHistory.shift();
            }

            // Smoothed velocity is weighted average (more recent = higher weight)
            let weightedSum = 0;
            let weightSum = 0;
            this.velocityHistory.forEach((v, i) => {
                const weight = i + 1;
                weightedSum += v * weight;
                weightSum += weight;
            });
            this.touchVelocity = weightedSum / weightSum;
        }

        // Update tracking for next frame
        this.touchPrevY = touch.clientY;
        this.touchPrevTime = now;

        // Accumulate the delta
        this.touchAccumulatedDelta += deltaY;

        // Threshold for triggering a letter change (in pixels)
        const threshold = 30;

        if (Math.abs(this.touchAccumulatedDelta) >= threshold) {
            const direction = this.touchAccumulatedDelta > 0 ? 1 : -1;
            const steps = Math.floor(Math.abs(this.touchAccumulatedDelta) / threshold);

            // Ensure cursor is at the touched drum
            if (this.cursorPosition !== this.touchDrumIndex) {
                this.setCursor(this.touchDrumIndex);
            }

            for (let i = 0; i < steps; i++) {
                this.cycleLetter(direction, 1);
            }

            // Keep remainder for smooth continuous scrolling
            this.touchAccumulatedDelta = this.touchAccumulatedDelta % threshold;
        }

        // Update start position for continuous tracking
        this.touchStartY = touch.clientY;
    }

    handleTouchEnd(event) {
        if (!this.isTouching) return;

        const drumIndex = this.touchDrumIndex;
        const velocity = this.touchVelocity;

        this.isTouching = false;
        this.touchDrumIndex = -1;
        this.touchAccumulatedDelta = 0;

        // Check if we have enough velocity for momentum
        const minVelocityThreshold = 0.3; // pixels per ms
        if (Math.abs(velocity) > minVelocityThreshold && drumIndex !== -1) {
            this.startMomentum(drumIndex, velocity);
        } else {
            // Snap to nearest letter and validate
            this.snapToPosition(this.cursorPosition);
            this.triggerRealtimeValidation();
        }
    }

    /**
     * Start momentum-based spinning after a fast swipe
     * @param {number} drumIndex - Which drum to spin
     * @param {number} velocity - Initial velocity in pixels/ms
     */
    startMomentum(drumIndex, velocity) {
        const drum = this.drums[drumIndex];
        const letterGroup = drum.userData.letterGroup;
        if (!letterGroup) return;

        // Cancel any existing animation
        this.stopMomentum();
        gsap.killTweensOf(letterGroup.rotation);

        // Physics parameters - tuned for 3-4 second spin on fast swipe
        // With friction=0.98, maxVel=3.0, minVel=0.02: max spin ~4 seconds
        const friction = 0.98; // Deceleration factor per frame (higher = longer spin)
        const minVelocity = 0.02; // Velocity threshold to stop
        const pixelsPerRadian = 80; // Conversion factor from pixels to rotation (lower = faster spin)

        // Convert pixel velocity to angular velocity (radians per frame at 60fps)
        let angularVelocity = (velocity / pixelsPerRadian) * (1000 / 60);

        // Cap the max velocity for very fast swipes
        const maxVelocity = 3.0; // radians per frame - allows multiple full rotations per second
        angularVelocity = Math.sign(angularVelocity) * Math.min(Math.abs(angularVelocity), maxVelocity);

        const anglePerPosition = (Math.PI * 2) / this.POSITIONS_PER_DRUM;
        let currentRotation = drum.userData.currentRotation || 0;
        let frameCount = 0;

        // Apply motion blur based on velocity
        this.applyDrumMotionBlur(drumIndex, Math.abs(angularVelocity));

        const animate = () => {
            // Apply friction
            angularVelocity *= friction;
            frameCount++;

            // Update rotation
            currentRotation += angularVelocity;
            letterGroup.rotation.x = currentRotation;
            drum.userData.currentRotation = currentRotation;

            // Calculate current letter position
            const normalizedRotation = (((-currentRotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
            const posIndex = Math.round(normalizedRotation / anglePerPosition) % this.POSITIONS_PER_DRUM;
            const newLetter = posIndex === 0 ? '' : ALPHABET[posIndex - 1];
            this.currentLetters[drumIndex] = newLetter;

            // Update motion blur based on current velocity
            this.applyDrumMotionBlur(drumIndex, Math.abs(angularVelocity));

            // Check if we should stop
            if (Math.abs(angularVelocity) > minVelocity) {
                this.momentumAnimation = requestAnimationFrame(animate);
            } else {
                // Snap to nearest letter position
                this.snapToNearestLetter(drumIndex);
                this.clearDrumMotionBlur(drumIndex);
                this.triggerRealtimeValidation();
            }
        };

        this.momentumAnimation = requestAnimationFrame(animate);
    }

    /**
     * Stop any momentum animation in progress
     */
    stopMomentum() {
        if (this.momentumAnimation) {
            cancelAnimationFrame(this.momentumAnimation);
            this.momentumAnimation = null;
        }
        // Clear any motion blur
        this.drums.forEach((_, i) => this.clearDrumMotionBlur(i));
    }

    /**
     * Snap drum to nearest letter position
     */
    snapToNearestLetter(drumIndex) {
        const drum = this.drums[drumIndex];
        const letterGroup = drum.userData.letterGroup;
        if (!letterGroup) return;

        const anglePerPosition = (Math.PI * 2) / this.POSITIONS_PER_DRUM;
        const currentRotation = drum.userData.currentRotation || 0;

        // Find nearest position
        const normalizedRotation = (((-currentRotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
        const nearestPosIndex = Math.round(normalizedRotation / anglePerPosition) % this.POSITIONS_PER_DRUM;

        // Calculate exact rotation for this position
        const fullRotations = Math.round(currentRotation / (Math.PI * 2));
        const targetRotation = fullRotations * Math.PI * 2 - nearestPosIndex * anglePerPosition;

        // Animate snap with satisfying click
        gsap.to(letterGroup.rotation, {
            x: targetRotation,
            duration: 0.15,
            ease: 'power2.out',
            onComplete: () => {
                drum.userData.currentRotation = targetRotation;
                const newLetter = nearestPosIndex === 0 ? '' : ALPHABET[nearestPosIndex - 1];
                this.currentLetters[drumIndex] = newLetter;
            }
        });
    }

    /**
     * Apply motion blur effect to a spinning drum
     * Uses vertical scaling to simulate motion blur
     */
    applyDrumMotionBlur(drumIndex, velocity) {
        const drum = this.drums[drumIndex];
        const letterGroup = drum.userData.letterGroup;
        if (!letterGroup) return;

        // Scale blur intensity with velocity (0 to ~0.4 stretch)
        const blurIntensity = Math.min(velocity * 0.3, 0.4);

        // Apply vertical stretch to simulate motion blur
        letterGroup.children.forEach(letterMesh => {
            if (letterMesh.material && letterMesh.material.opacity !== undefined) {
                // Reduce opacity slightly during fast spin
                letterMesh.material.opacity = Math.max(0.6, 1 - blurIntensity * 0.5);
                letterMesh.material.transparent = true;
            }
            // Stretch in the rotation direction
            letterMesh.scale.y = 1 + blurIntensity;
        });

        // Also apply slight transparency/glow to indicate speed
        if (velocity > 0.5) {
            drum.userData.isBlurring = true;
        }
    }

    /**
     * Clear motion blur effect from a drum
     */
    clearDrumMotionBlur(drumIndex) {
        const drum = this.drums[drumIndex];
        if (!drum) return;

        const letterGroup = drum.userData.letterGroup;
        if (!letterGroup) return;

        // Reset all letter meshes
        letterGroup.children.forEach(letterMesh => {
            if (letterMesh.material && letterMesh.material.opacity !== undefined) {
                letterMesh.material.opacity = 1;
                letterMesh.material.transparent = false;
            }
            // Reset scale
            gsap.to(letterMesh.scale, {
                y: 1,
                duration: 0.2,
                ease: 'power2.out'
            });
        });

        drum.userData.isBlurring = false;
    }

    /**
     * Trigger real-time validation callback
     */
    triggerRealtimeValidation() {
        if (this.onRealtimeValidation) {
            const word = this.getCurrentWord();
            if (word.length >= 2) {
                this.onRealtimeValidation(word);
            }
        }
    }

    getCurrentWord() {
        // Find the contiguous sequence of letters (no gaps)
        let start = -1;
        let end = -1;

        // Find first letter
        for (let i = 0; i < this.currentLetters.length; i++) {
            if (this.currentLetters[i] !== '') {
                start = i;
                break;
            }
        }

        if (start === -1) return ''; // No letters

        // Find last letter
        for (let i = this.currentLetters.length - 1; i >= 0; i--) {
            if (this.currentLetters[i] !== '') {
                end = i;
                break;
            }
        }

        // Check if all positions between start and end have letters (contiguous)
        for (let i = start; i <= end; i++) {
            if (this.currentLetters[i] === '') {
                return ''; // Gap found, not a valid word
            }
        }

        return this.currentLetters.slice(start, end + 1).join('');
    }

    validate() {
        const word = this.getCurrentWord();
        if (word.length > 0 && this.onValidate) {
            this.onValidate(word);
        }
    }

    clearAll() {
        // Save current word for undo
        const currentWord = this.getCurrentWord();
        if (currentWord.length > 0) {
            this.previousWord = currentWord;
        }

        for (let i = 0; i < this.NUM_SLOTS; i++) {
            this.clearSlot(i);
        }
        // Reset typing state
        this.typingActive = false;
        this.leftmostTyped = this.CENTER_SLOT;
        this.rightmostTyped = this.CENTER_SLOT;
        // Return cursor to start (slot 0)
        this.setCursor(0);
    }

    /**
     * Clear only unlocked slots (for pattern mode)
     */
    clearUnlockedSlots(lockedSlots) {
        for (let i = 0; i < this.NUM_SLOTS; i++) {
            if (!lockedSlots[i]) {
                this.clearSlot(i);
            }
        }
    }

    /**
     * Spin to a word in pattern mode - keeps locked slots stationary
     * @param {string} word - The word to display
     * @param {Array<boolean>} lockedSlots - Which slots have locked letters
     * @param {Array<boolean>} lockedEmpty - Which empty slots are locked
     * @param {number} startPos - Optional starting position on the wheel (default: calculated from lockedSlots)
     */
    spinToPatternWord(word, lockedSlots, lockedEmpty, startPos = null) {
        const letters = word.toUpperCase().split('');
        const anglePerPosition = (Math.PI * 2) / this.POSITIONS_PER_DRUM;

        // If startPos not provided, calculate from first locked slot
        if (startPos === null) {
            startPos = 0;
            for (let i = 0; i < this.NUM_SLOTS; i++) {
                if (lockedSlots[i]) {
                    startPos = i;
                    break;
                }
            }
        }

        // Word starts at startPos
        const drumParams = [];
        let lastAnimatedDrum = -1;

        for (let i = 0; i < this.NUM_SLOTS; i++) {
            // Calculate which letter index this slot corresponds to
            const letterIdx = i - startPos;
            const targetLetter = (letterIdx >= 0 && letterIdx < letters.length) ? letters[letterIdx] : '';
            const targetPos = this.getPositionIndex(targetLetter);

            // Check if this slot should animate
            const shouldAnimate = !lockedSlots[i] && !lockedEmpty[i];

            // Determine if slot needs to change (either show new letter or clear existing)
            const currentLetter = this.currentLetters[i] || '';
            const needsChange = shouldAnimate && (targetLetter !== currentLetter);

            if (needsChange) {
                // Random number of extra spins (3-8 full rotations)
                const extraSpins = 3 + Math.floor(Math.random() * 6);
                const baseDelay = i * 100;
                const randomDelay = Math.random() * 300;
                const stopDelay = baseDelay + randomDelay;
                const duration = 1.2 + (extraSpins * 0.12) + (Math.random() * 0.25);

                drumParams.push({
                    index: i,
                    targetLetter,
                    targetPos,
                    extraSpins,
                    stopDelay,
                    duration,
                    shouldAnimate: true
                });
                lastAnimatedDrum = i;
            } else {
                // This slot stays still (locked or already correct)
                drumParams.push({
                    index: i,
                    targetLetter: lockedSlots[i] ? this.currentLetters[i] : targetLetter,
                    targetPos: lockedSlots[i] ? this.getPositionIndex(this.currentLetters[i]) : targetPos,
                    shouldAnimate: false
                });
            }
        }

        // Animate only the drums that should spin
        for (const params of drumParams) {
            const i = params.index;
            const drum = this.drums[i];
            const letterGroup = drum.userData.letterGroup;
            if (!letterGroup) continue;

            if (!params.shouldAnimate) {
                // Keep this slot as-is (already has correct letter or is locked empty)
                continue;
            }

            const { targetLetter, targetPos, extraSpins, stopDelay, duration } = params;

            // Kill any existing animation
            gsap.killTweensOf(letterGroup.rotation);

            // Calculate target rotation with extra spins
            const targetRotation = -targetPos * anglePerPosition;
            const totalRotation = targetRotation - (extraSpins * Math.PI * 2);

            // Start spinning after individual delay
            setTimeout(() => {
                gsap.to(letterGroup.rotation, {
                    x: totalRotation,
                    duration: duration,
                    ease: 'power2.out',
                    onUpdate: () => {
                        drum.userData.currentRotation = letterGroup.rotation.x;
                    },
                    onComplete: () => {
                        // Snap to exact position
                        const snappedRotation = -targetPos * anglePerPosition;
                        letterGroup.rotation.x = snappedRotation;
                        drum.userData.currentRotation = snappedRotation;
                        this.currentLetters[i] = targetLetter;

                        // Trigger validation when last animated drum finishes
                        if (i === lastAnimatedDrum) {
                            setTimeout(() => {
                                if (this.onRealtimeValidation) {
                                    const finalWord = this.getCurrentWord();
                                    if (finalWord.length >= 2) {
                                        this.onRealtimeValidation(finalWord);
                                    }
                                }
                            }, 50);
                        }
                    }
                });
            }, stopDelay);
        }
    }

    /**
     * Spin to a word with slot-machine style animation
     * All drums spin simultaneously at different speeds
     */
    spinToWord(word) {
        const letters = word.toUpperCase().split('');
        const anglePerPosition = (Math.PI * 2) / this.POSITIONS_PER_DRUM;

        // Calculate starting position to center the word
        const startSlot = Math.floor((this.NUM_SLOTS - letters.length) / 2);

        // First, clear all current letters
        for (let i = 0; i < this.NUM_SLOTS; i++) {
            this.currentLetters[i] = '';
        }

        // Generate random parameters for each drum
        const drumParams = [];
        for (let i = 0; i < this.NUM_SLOTS; i++) {
            // Get letter for this slot (offset by startSlot for centering)
            const letterIndex = i - startSlot;
            const targetLetter = (letterIndex >= 0 && letterIndex < letters.length) ? letters[letterIndex] : '';
            const targetPos = this.getPositionIndex(targetLetter);

            // Random number of extra spins (3-8 full rotations)
            const extraSpins = 3 + Math.floor(Math.random() * 6);

            // Random delay before stopping (stagger effect)
            const baseDelay = i * 120;
            const randomDelay = Math.random() * 350;
            const stopDelay = baseDelay + randomDelay;

            // Duration varies by number of spins
            const duration = 1.2 + (extraSpins * 0.12) + (Math.random() * 0.25);

            drumParams.push({
                targetLetter,
                targetPos,
                extraSpins,
                stopDelay,
                duration
            });
        }

        // Find which drum finishes last
        const finishTimes = drumParams.map(p => p.stopDelay + p.duration * 1000);
        const maxFinishTime = Math.max(...finishTimes);
        const lastDrumIndex = finishTimes.indexOf(maxFinishTime);

        // Start all drums spinning
        for (let i = 0; i < this.NUM_SLOTS; i++) {
            const drum = this.drums[i];
            const letterGroup = drum.userData.letterGroup;
            if (!letterGroup) continue;

            const params = drumParams[i];
            const { targetLetter, targetPos, extraSpins, stopDelay, duration } = params;

            // Kill any existing animation
            gsap.killTweensOf(letterGroup.rotation);

            // Calculate target rotation with extra spins
            const targetRotation = -targetPos * anglePerPosition;

            // Add multiple full rotations for dramatic effect
            const totalRotation = targetRotation - (extraSpins * Math.PI * 2);

            // Start spinning after individual delay
            setTimeout(() => {
                gsap.to(letterGroup.rotation, {
                    x: totalRotation,
                    duration: duration,
                    ease: 'power2.out',
                    onUpdate: () => {
                        drum.userData.currentRotation = letterGroup.rotation.x;
                    },
                    onComplete: () => {
                        // Snap to exact position
                        const snappedRotation = -targetPos * anglePerPosition;
                        letterGroup.rotation.x = snappedRotation;
                        drum.userData.currentRotation = snappedRotation;
                        this.currentLetters[i] = targetLetter;

                        // Trigger validation when last drum finishes
                        if (i === lastDrumIndex) {
                            setTimeout(() => {
                                if (this.onRealtimeValidation) {
                                    const finalWord = this.getCurrentWord();
                                    if (finalWord.length >= 2) {
                                        this.onRealtimeValidation(finalWord);
                                    }
                                }
                            }, 50);
                        }
                    }
                });
            }, stopDelay);
        }

        // Move cursor to end of word after animation (accounting for centering)
        setTimeout(() => {
            this.setCursor(Math.min(startSlot + letters.length - 1, this.NUM_SLOTS - 1));
        }, maxFinishTime + 100);
    }

    setWord(word) {
        // Clear slots without saving to previousWord
        for (let i = 0; i < this.NUM_SLOTS; i++) {
            this.clearSlot(i);
        }
        this.setCursor(0);

        const letters = word.toUpperCase().split('');
        letters.forEach((letter, index) => {
            if (index < this.NUM_SLOTS && ALPHABET.includes(letter)) {
                setTimeout(() => {
                    this.spinToLetter(index, letter);
                    // Move cursor to end after last letter
                    if (index === letters.length - 1) {
                        this.setCursor(Math.min(letters.length, this.NUM_SLOTS - 1));
                    }
                }, index * 80);
            }
        });
    }
}
