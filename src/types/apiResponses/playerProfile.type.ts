/** Shape of `players/get/{userId}`. */

export interface PlayerProfileGame {
    gameId: number;
    level: number;
    /** Finishing position as a percentile; lower is better. */
    position: number;
    isWinner: boolean;
    bestPlayer: boolean;
    /** How much this game still counts toward the score; decays with age. */
    weight: number;
    numFactions: number;
    counts: boolean;
    bonus: number;
    winBonus: number;
    positionBonus: number;
    bestPlayerBonus: number;
}

export interface PlayerProfileResponse {
    player: {
        userId: number;
        username: string;
        /** The rating shown as MMR. */
        score: number;
        avatarUrl: string | null;
        /** Unix seconds, fractional. */
        lastSeen: number;
    };
    playerStats: {
        gamesPlayed: number;
        gamesWon: number;
        /** Games where they were the best player — the MVP count. */
        bestPlayer: number;
    };
    scoreDetails: {
        score: number;
        baseScore: number;
        isAuthenticated: boolean;
        games: PlayerProfileGame[];
        winRateBonus: number;
        positionBonus: number;
        bestPlayerBonus: number;
        scoreBeforeMultipliers: number;
        gamesMultiplier: number;
        groupMultiplier: number;
        totalGamesWeight: number;
    };
    previousUsernames: string[];
    /** The player's clan, not their in-game faction colour. */
    playerFaction: {
        id: number;
        name: string;
        tagline: string;
    } | null;
}
