/**
 * ScoreKeeper — 2-player Scrabble score tracking with localStorage persistence
 */
export class ScoreKeeper {
    constructor() {
        this.STORAGE_KEY = 'scrabbler-scorekeeper';
        this.data = this.load();
    }

    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.warn('ScoreKeeper: failed to load data', e);
        }
        return { profiles: [], currentGame: null, history: [] };
    }

    save() {
        try {
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
            points: parseInt(points, 10) || 0
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
            date: new Date().toISOString(),
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

    getInsights(profileId) {
        const games = this.data.history.filter(
            g => g.player1.id === profileId || g.player2.id === profileId
        );

        if (games.length === 0) {
            return { gamesPlayed: 0, wins: 0, winRate: 0, avgScore: 0, bestWord: null, highestGameScore: 0 };
        }

        let wins = 0;
        let totalScore = 0;
        let bestWord = null;
        let bestWordPoints = 0;
        let highestGameScore = 0;

        for (const game of games) {
            const isP1 = game.player1.id === profileId;
            const myScore = isP1 ? game.player1.score : game.player2.score;
            const opScore = isP1 ? game.player2.score : game.player1.score;

            totalScore += myScore;
            if (myScore > opScore) wins++;
            if (myScore > highestGameScore) highestGameScore = myScore;

            for (const turn of game.turns) {
                if (turn.player === profileId && turn.points > bestWordPoints) {
                    bestWordPoints = turn.points;
                    bestWord = { word: turn.word, points: turn.points };
                }
            }
        }

        return {
            gamesPlayed: games.length,
            wins,
            winRate: Math.round((wins / games.length) * 100),
            avgScore: Math.round(totalScore / games.length),
            bestWord,
            highestGameScore
        };
    }
}
