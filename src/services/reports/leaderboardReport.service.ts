import { apiFetch } from "../../controllers/api.controller";
import { WorldUpdateModel } from "../../models/activities/worldUpdate.model";
import { cacheReport, getCachedReport, ReportType } from "./reportCache.service";

export async function generatePlayerMvpLeaderboard(gameId: string) {
    // Check cache first
    const cachedData = await getCachedReport(gameId, ReportType.PLAYER_MVP);
    if (cachedData) {
        return cachedData;
    }

    // If no cache, generate the report
    const board = await apiFetch('get_leaderboard', gameId);

    const solderScoreMulti = +gameId <= 22 ? 2 : 1.8;

    const scores = board.map(entry => {
        const soldierScore = entry.sentSoldiers * solderScoreMulti;
        const workerScore = entry.sentWorkers;

        return {
            name: entry.name,
            faction: entry.faction,
            score: soldierScore + workerScore
        }
    });
    scores.sort((a, b) => b.score - a.score);

    // Cache the results
    await cacheReport(gameId, ReportType.PLAYER_MVP, scores);

    return scores;
}

export async function generateApmLeaderboard(gameId: string, timespan: number, uniqueOnly: boolean = false) {
    // Parameter to differentiate different timespan values
    const params = { timespan, uniqueOnly };

    // Check cache first
    const cachedData = await getCachedReport(gameId, ReportType.APM, params);
    if (cachedData) {
        return cachedData;
    }

    const allActions = await WorldUpdateModel.findAll({
        attributes: {
            include: ['updated_at', 'player_name', 'x', 'y']
        },
        where: {
            game_id: gameId
        },
        order: ['updated_at']
    })
    const playerActions: Record<string, { time: number, x: number, y: number }[]> = {};
    for (const action of allActions) {
        if (!playerActions[action.player_name]) {
            playerActions[action.player_name] = [];
        }

        if (uniqueOnly) {
            // Only add if this x,y combination hasn't been seen in the current window
            const lastAction = playerActions[action.player_name][playerActions[action.player_name].length - 1];
            if (!lastAction || lastAction.x !== action.x || lastAction.y !== action.y) {
                playerActions[action.player_name].push({
                    time: action.updated_at,
                    x: action.x,
                    y: action.y
                });
            }
        } else {
            playerActions[action.player_name].push({
                time: action.updated_at,
                x: action.x,
                y: action.y
            });
        }
    }

    const leaderboard: { [player: string]: number } = {};

    for (const [player, actions] of Object.entries(playerActions)) {
        let highestApm = 0;

        // Use sliding window approach
        let leftIndex = 0;
        for (let rightIndex = 0; rightIndex < actions.length; rightIndex++) {
            const currentTime = actions[rightIndex].time;
            const windowStart = currentTime - timespan;

            // Slide left pointer forward until we're within the window
            while (leftIndex < rightIndex && actions[leftIndex].time < windowStart) {
                leftIndex++;
            }

            // Current window size is rightIndex - leftIndex + 1
            highestApm = Math.max(highestApm, rightIndex - leftIndex + 1);
        }

        leaderboard[player] = highestApm;
    }

    const sortedLeaderboard = Object.entries(leaderboard).sort((a, b) => b[1] - a[1]);

    // Cache the results with parameters
    await cacheReport(gameId, ReportType.APM, sortedLeaderboard, params);

    return sortedLeaderboard;
}

export async function generateTileLeaderboard(gameId: string) {
    // Check cache first
    const cachedData = await getCachedReport(gameId, ReportType.TILE);
    if (cachedData) {
        return cachedData;
    }

    const allTileUpdates = await WorldUpdateModel.findAll({
        attributes: ['player_name', 'updated_at', 'x', 'y', 'captured'],
        where: {
            game_id: gameId,
            captured: true
        },
        order: ['updated_at']
    });

    // Track current and max tile counts for each player
    const playerTileCounts: { [player: string]: Set<string> } = {};
    const playerMaxTiles: { [player: string]: number } = {};

    // Process updates chronologically to track ownership
    for (const update of allTileUpdates) {
        // Initialize player sets if needed
        if (!playerTileCounts[update.player_name]) {
            playerTileCounts[update.player_name] = new Set();
        }

        // Add tile to player's set
        const tileKey = `${update.x},${update.y}`;

        // Remove tile from previous owner's set if it exists
        for (const [player, tiles] of Object.entries(playerTileCounts)) {
            if (player !== update.player_name && tiles.delete(tileKey)) {
                break; // Exit once we find and remove the tile
            }
        }

        // Add to new owner's set
        playerTileCounts[update.player_name].add(tileKey);

        // Update max tile count for this player
        const currentCount = playerTileCounts[update.player_name].size;
        playerMaxTiles[update.player_name] = Math.max(
            currentCount,
            playerMaxTiles[update.player_name] || 0
        );
    }

    // Sort players by their max tile count
    const sortedLeaderboard = Object.entries(playerMaxTiles)
        .sort((a, b) => b[1] - a[1]);
    // Calculate the total number of distinct tiles captured
    const allTiles = new Set<string>();
    Object.values(playerTileCounts).forEach(playerTiles => {
        playerTiles.forEach(tile => allTiles.add(tile));
    });
    const totalDistinctTiles = allTiles.size;

    // Add percentage to each leaderboard entry
    const leaderboardWithPercentage = sortedLeaderboard.map(([player, count]) => {
        const percentage = totalDistinctTiles > 0 ? ((count as number) / totalDistinctTiles * 100).toFixed(1) : '0.0';
        return [player, count, `${percentage}%`];
    });

    // Cache the results
    await cacheReport(gameId, ReportType.TILE, leaderboardWithPercentage);

    return leaderboardWithPercentage;
}

