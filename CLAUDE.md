# Scrabbler - Claude Context File

This file helps Claude instances get up to speed on the project quickly.

## Project Overview

Scrabbler is a steampunk-styled Scrabble word validation tool. The main feature is an interactive 3D mechanical letter wheel (10 slots) built with Three.js, inspired by old cash register mechanics. Users can validate words against the official Scrabble dictionary (NWL2023).

## Tech Stack

- **Three.js** - 3D rendering for letter drums with PBR materials
- **GSAP** - Physics-based animations for drum spins
- **Vanilla JavaScript (ES6 modules)** - Core logic
- **HTML5 + CSS3** - Steampunk UI styling

## Project Structure

```
/home/cmriv/New_Projects/Scrabbler/
├── index.html              # Main page
├── server.py               # Python dev server (run with: python3 server.py)
├── CLAUDE.md               # This file - context for Claude
├── css/
│   └── styles.css          # Steampunk styling
├── js/
│   ├── main.js             # App initialization, event handlers, pattern mode logic
│   ├── letterWheel.js      # Three.js 3D letter drums + GSAP animations
│   ├── scene.js            # Three.js scene setup, lighting, camera
│   ├── dictionary.js       # Word validation, pattern matching, anagram solving
│   ├── letterRack.js       # 7-tile Scrabble rack component
│   ├── search.js           # Search utilities
│   ├── definitions.js      # Word definition lookup service
│   └── utils.js            # Helper functions
├── assets/
│   └── textures/           # Brass, wood textures
└── data/
    └── scrabble-dictionary.txt  # Official Scrabble word list (NWL2023)
```

## Running the Project

```bash
cd /home/cmriv/New_Projects/Scrabbler
python3 server.py
# Open http://localhost:8000
```

## Core Features

### 1. Letter Wheel (3D)
- 10 rotating letter drum slots
- Type letters to spin drums to that letter
- Arrow keys: Left/Right move cursor, Up/Down cycle letters
- Enter validates the word
- Backspace clears current slot

### 2. Real-time Validation
- Words light up green when valid (brass frame glows)
- Shows point value in indicator below wheel
- Click the indicator to see word definition

### 3. Letter Rack
- 7-tile Scrabble rack below the wheel
- Use `?` for wild/blank tiles
- "Find Words" button finds all valid words from rack letters
- Supports filters: "Starts with", "Contains", "Ends with"

### 4. Word Lists Modal
- Access via hamburger button (left of wheel)
- Categories: 2-letter, 3-letter, Q-without-U, J/X/Q/Z words, Vowel-heavy
- Filter/search within lists
- Click any word to see definition

### 5. Random Word Button
- Dice button (right of wheel) spins a random valid word

## Pattern Matching Feature (In Progress)

This feature allows finding words that fit a pattern on a Scrabble board.

### How It Works
1. **Toggle "Lock Pattern"** switch at top of wheel
2. Letters currently on the wheel become "locked" (shown with orange border indicators)
3. **Slot lock toggles** appear below the wheel - 10 small switches, one per column
4. Toggle empty slots to mark them as "locked empty" (word must end before these)
5. Put letters in the **Letter Rack** (your available tiles)
6. Click **"Find Words"** to find words matching the pattern using your rack letters

### Key Implementation Details

**Files involved:**
- `js/main.js`: `togglePatternMode()`, `createSlotLockSliders()`, `findPatternMatches()`, `displayPatternMatch()`, `cyclePatternMatch()`
- `js/dictionary.js`: `findPatternMatches(pattern, lockedEmpty, rackLetters)`, `getRandomPatternWord()`
- `js/letterWheel.js`: `setLockedSlots()`, `clearLockIndicators()`, `spinToPatternWord()`, `clearUnlockedSlots()`
- `css/styles.css`: `.slot-locks`, `.slot-lock`, `.slot-lock-slider` styles

**Pattern matching logic:**
- Words can start BEFORE the first locked letter (flexible positioning)
- Returns `{word, points, startPos}` where `startPos` indicates where word begins on wheel
- Uses `spinToPatternWord(word, lockedSlots, lockedEmpty, startPos)` to display matches
- Up/Down arrows cycle through matches when in pattern mode with results

**Current state (as of last session):**
- Core pattern matching logic works
- Lock indicators on 3D wheel work
- Slot lock toggles CSS was just updated - may need testing
- Random word button works with pattern mode

### Recent CSS Changes for Slot Locks

The slot lock toggles were not appearing. Updated CSS in `styles.css` (lines ~448-524):
- Container: `position: absolute; bottom: 50px; left: 3%; right: 3%; z-index: 100`
- Each slot-lock uses `flex: 1` for even distribution
- Added `.slot-lock.disabled` class for slots with letters (opacity: 0.3)

## State Variables (in main.js Scrabbler class)

```javascript
this.patternMode = false;           // Is pattern mode active?
this.patternMatches = [];           // Array of {word, points, startPos}
this.patternMatchIndex = 0;         // Current match being displayed
this.lockedSlots = Array(10);       // Which slots have locked LETTERS
this.lockedEmptySlots = Array(10);  // Which EMPTY slots are locked (end constraints)
```

## Known Issues / TODO

1. **Slot lock toggles visibility** - CSS was updated but needs testing after restart
2. Pattern matching works but UI feedback could be improved
3. Mobile/touch support not fully implemented

## Useful Code Locations

- Pattern matching algorithm: `js/dictionary.js:findPatternMatches()`
- Lock indicators (3D): `js/letterWheel.js:createLockIndicators()`, `setLockedSlots()`
- Slot lock slider creation: `js/main.js:createSlotLockSliders()`
- Word validation: `js/dictionary.js:validate()`
- 3D drum spin animation: `js/letterWheel.js:spinToLetter()`
