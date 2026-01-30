# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Scrabbler is a steampunk-styled Scrabble word validation tool. The main feature is an interactive 3D mechanical letter wheel (10 drum slots) built with Three.js, inspired by old cash register mechanics. Users validate words against the NWL2023 Scrabble dictionary. It's a PWA deployed to GitHub Pages with a TWA wrapper for Google Play.

## Running the Project

```bash
python server.py
# Open http://localhost:8000
```

No build step — pure ES6 modules loaded via import maps. External deps (Three.js, GSAP) from CDN.

**Live site:** https://cyphersdigest99.github.io/Scrabbler/

## Architecture

**Orchestrator pattern** — `main.js` owns all module instances and coordinates via callbacks:

```
main.js (Scrabbler class)
├── SceneManager  — Three.js scene, camera, lighting, resize handling
├── LetterWheel   — 10 rotating 3D drum cylinders, touch/keyboard input
├── Dictionary    — Word validation, pattern matching, word lists
├── LetterRack    — 7-tile DOM rack with mobile keyboard support
├── SearchManager — Advanced search utilities (anagrams, extensions)
├── DefinitionService — Free Dictionary API lookups with in-memory cache
└── Tour          — First-time guided walkthrough (localStorage flag)
```

**Communication pattern:** Child modules call back to main.js with results (observer pattern). No event bus — direct callbacks and method calls.

### Key Data Flows

**Word validation:** User types → `LetterWheel.spinToLetter()` → `checkRealtimeValidation()` → callback to `main.handleRealtimeValidation()` → `Dictionary.validate()` → UI update (brass frame glow)

**Pattern matching:** Toggle lock → `main.togglePatternMode()` → `LetterWheel.setLockedSlots()` → User clicks Find Words → `Dictionary.findPatternMatches(pattern, lockedEmpty, rackLetters)` → `LetterWheel.spinToPatternWord(word, lockedSlots, lockedEmpty, startPos)`

**Rack search:** Enter letters → filters (startsWith/endsWith/contains) → `Dictionary.findWordsWithFilters()` → callback `onWordsFound` → `main.displayAnagramResults()`

## Key Implementation Details

### Letter Wheel (letterWheel.js)
- Each drum = THREE.Group with cylinder, brass bands, 27 letter positions (empty + A-Z), focus/lock indicators
- **Center-outward typing**: words expand from slot 5
- **Momentum cycling**: holding Up/Down accelerates letter scrolling
- Touch: swipe up/down to spin drums
- `currentLetters: Array(10)` tracks what's on each drum

### Dictionary (dictionary.js)
- Words stored in a `Set` for O(1) lookups
- Loads via chunked processing (10k words/chunk) to avoid blocking UI
- Pattern matching tries different `startPos` values — words can start before the first locked letter
- Wildcard `?` = blank tile (0 points), used after regular letters exhausted

### Scene (scene.js)
- iOS/mobile optimizations: reduced pixel ratio (max 1.5), no antialiasing, no environment map
- Resize via ResizeObserver + window resize + orientationchange
- Method is `onResize()` (not `onWindowResize`)

### PWA & Deployment
- `service-worker.js`: cache-first for static assets, network-first for HTML
- `manifest.json`: standalone PWA with PNG icons
- `.github/workflows/deploy.yml`: auto-deploys to GitHub Pages on push to main
- `.well-known/assetlinks.json`: Digital Asset Links for Android TWA
- TWA signing key stored separately (not in repo)

## State Management

No state library — distributed across modules:

```javascript
// main.js (Scrabbler class)
this.patternMode = false;           // Pattern matching active?
this.patternMatches = [];           // Array of {word, points, startPos}
this.patternMatchIndex = 0;         // Current displayed match
this.lockedSlots = Array(10);       // Slots with locked letters
this.lockedEmptySlots = Array(10);  // Empty slots locked (word boundaries)
```

LetterWheel owns `currentLetters`, `cursorPosition`, `lockedSlots`. LetterRack owns `letters` (7 tiles) and `activeIndex`.

## CSS Responsive Breakpoints

`styles.css` has breakpoints at 960px, 600px, 480px, 360px, and a landscape breakpoint at `max-height: 500px`. Touch targets are min 44px on mobile. Safe-area padding for notched devices.
