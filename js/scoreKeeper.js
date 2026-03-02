/**
 * ScoreKeeper — 2-player Scrabble score tracking with localStorage persistence
 *
 * Schema v2 additions:
 *   - `version` field on root data object
 *   - `id` field on each game (history records + currentGame) for cross-device deduplication
 *   - `started` ISO timestamp on game records
 *   - `ts` (turn timestamp) on each turn entry
 */
export class ScoreKeeper {
    static SCHEMA_VERSION = 2;

    constructor() {
        this.STORAGE_KEY = 'scrabbler-scorekeeper';
        this.data = this.load();
    }

    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return this.migrate(parsed);
            }
        } catch (e) {
            console.warn('ScoreKeeper: failed to load data', e);
        }
        return { version: ScoreKeeper.SCHEMA_VERSION, profiles: [], currentGame: null, history: [] };
    }

    migrate(data) {
        const v = data.version || 1;
        if (v < 2) {
            // Add stable game IDs to history (derive from date for idempotency)
            for (const game of (data.history || [])) {
                if (!game.id) game.id = 'g' + new Date(game.date).getTime();
                // Backfill turn timestamps using game date as best guess
                for (const turn of (game.turns || [])) {
                    if (!turn.ts) turn.ts = game.date;
                }
                if (!game.started) game.started = game.date;
            }
            // Add ID to any in-progress game
            if (data.currentGame && !data.currentGame.id) {
                data.currentGame.id = 'g' + Date.now();
            }
            data.version = 2;
        }
        return data;
    }

    save() {
        try {
            this.data.version = ScoreKeeper.SCHEMA_VERSION;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.warn('ScoreKeeper: failed to save data', e);
        }
    }

    // --- Profile Management ---

    getProfiles() {
        return this.data.profiles;
    }

    createProfile(name) {
        const id = 'p' + Date.now();
        const profile = { id, name: name.trim() };
        this.data.profiles.push(profile);
        this.save();
        return profile;
    }

    deleteProfile(id) {
        this.data.profiles = this.data.profiles.filter(p => p.id !== id);
        this.save();
    }

    getProfileName(id) {
        const p = this.data.profiles.find(p => p.id === id);
        return p ? p.name : 'Unknown';
    }

    // --- Game Management ---

    getCurrentGame() {
        return this.data.currentGame;
    }

    hasActiveGame() {
        return this.data.currentGame !== null;
    }

    newGame(player1Id, player2Id) {
        this.data.currentGame = {
            id: 'g' + Date.now(),
            player1: player1Id,
            player2: player2Id,
            turns: [],
            started: new Date().toISOString()
        };
        this.save();
    }

    getCurrentPlayer() {
        const game = this.data.currentGame;
        if (!game) return null;
        // Alternates: even turns = player1, odd = player2
        return game.turns.length % 2 === 0 ? game.player1 : game.player2;
    }

    addTurn(word, points) {
        const game = this.data.currentGame;
        if (!game) return;
        const player = this.getCurrentPlayer();
        game.turns.push({
            player,
            word: word.toUpperCase(),
            points: parseInt(points, 10) || 0,
            ts: new Date().toISOString()
        });
        this.save();
    }

    undoLastTurn() {
        const game = this.data.currentGame;
        if (!game || game.turns.length === 0) return null;
        const removed = game.turns.pop();
        this.save();
        return removed;
    }

    getScore(playerId) {
        const game = this.data.currentGame;
        if (!game) return 0;
        return game.turns
            .filter(t => t.player === playerId)
            .reduce((sum, t) => sum + t.points, 0);
    }

    endGame() {
        const game = this.data.currentGame;
        if (!game) return null;

        const p1Score = this.getScore(game.player1);
        const p2Score = this.getScore(game.player2);

        const record = {
            id: game.id,
            date: new Date().toISOString(),
            started: game.started,
            player1: { id: game.player1, name: this.getProfileName(game.player1), score: p1Score },
            player2: { id: game.player2, name: this.getProfileName(game.player2), score: p2Score },
            turns: [...game.turns]
        };

        this.data.history.unshift(record);
        this.data.currentGame = null;
        this.save();
        return record;
    }

    abandonGame() {
        this.data.currentGame = null;
        this.save();
    }

    // --- History & Insights ---

    getHistory() {
        return this.data.history;
    }

    /**
     * Returns aggregated stats for a player profile, including time-series data
     * for trend analysis. `scoreHistory` is sorted oldest-first for charting.
     */
    getInsights(profileId) {
        // Sort oldest-first for trend order
        const games = this.data.history
            .filter(g => g.player1.id === profileId || g.player2.id === profileId)
            .slice()
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (games.length === 0) {
            return {
                gamesPlayed: 0, wins: 0, winRate: 0, avgScore: 0,
                bestWord: null, highestGameScore: 0,
                scoreHistory: [], avgPointsPerTurn: 0, totalTurns: 0, lastPlayed: null
            };
        }

        let wins = 0, totalScore = 0, bestWord = null, bestWordPoints = 0;
        let highestGameScore = 0, totalTurns = 0;
        const scoreHistory = [];

        for (const game of games) {
            const isP1 = game.player1.id === profileId;
            const myScore = isP1 ? game.player1.score : game.player2.score;
            const opScore = isP1 ? game.player2.score : game.player1.score;

            totalScore += myScore;
            if (myScore > opScore) wins++;
            if (myScore > highestGameScore) highestGameScore = myScore;
            scoreHistory.push({ date: game.date, score: myScore });

            for (const turn of game.turns) {
                if (turn.player === profileId) {
                    totalTurns++;
                    if (turn.points > bestWordPoints) {
                        bestWordPoints = turn.points;
                        bestWord = { word: turn.word, points: turn.points };
                    }
                }
            }
        }

        return {
            gamesPlayed: games.length,
            wins,
            winRate: Math.round((wins / games.length) * 100),
            avgScore: Math.round(totalScore / games.length),
            bestWord,
            highestGameScore,
            scoreHistory,          // [{date, score}] oldest-first for trend charts
            avgPointsPerTurn: totalTurns > 0 ? Math.round(totalScore / totalTurns) : 0,
            totalTurns,
            lastPlayed: games[games.length - 1].date
        };
    }

    // --- Export / Import ---

    /**
     * Returns all data as a JSON string suitable for file download.
     * Includes metadata for future schema compatibility checks.
     */
    exportData() {
        const payload = {
            _meta: {
                app: 'Scrabbler',
                exportedAt: new Date().toISOString(),
                schemaVersion: ScoreKeeper.SCHEMA_VERSION
            },
            ...this.data
        };
        return JSON.stringify(payload, null, 2);
    }

    /**
     * Merges imported JSON data into existing local data.
     * - Profiles: merged by ID (incoming name wins for updates)
     * - History: merged by game ID (no duplicates)
     * - In-progress game: never overwritten by import
     * Returns { ok: true, gamesImported, profilesImported } or { ok: false, error }
     */
    importData(jsonString) {
        try {
            const incoming = JSON.parse(jsonString);
            if (!Array.isArray(incoming.profiles) || !Array.isArray(incoming.history)) {
                return { ok: false, error: 'Invalid file: missing profiles or history' };
            }

            const migrated = this.migrate(incoming);

            // Merge profiles by ID
            const profileMap = new Map(this.data.profiles.map(p => [p.id, p]));
            for (const p of migrated.profiles) {
                profileMap.set(p.id, p);
            }
            this.data.profiles = [...profileMap.values()];

            // Merge history by game ID (deduplicate)
            const historyMap = new Map(this.data.history.map(g => [g.id || g.date, g]));
            let newGames = 0;
            for (const g of migrated.history) {
                const key = g.id || g.date;
                if (!historyMap.has(key)) newGames++;
                historyMap.set(key, g);
            }
            // Keep newest-first order
            this.data.history = [...historyMap.values()]
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            this.save();
            return { ok: true, gamesImported: newGames, profilesImported: migrated.profiles.length };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }
}
