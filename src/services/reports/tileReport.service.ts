/** Tile-ownership leaderboard. */

import { ActivitiesModel } from "../../models/activities/activities.model";
import { ReportType, withReportCache } from "./reportCache.service";

export function generateTileLeaderboard(gameId: string) {
    return withReportCache(gameId, ReportType.TILE, () => buildTileLeaderboard(gameId));
}

async function buildTileLeaderboard(gameId: string) {
    const allTileUpdates = await ActivitiesModel.findAll({
        attributes: ['player_name', 'updated_at', 'x', 'y', 'captured'],
        where: {
            game_id: gameId,
            captured: true
        },
        order: ['updated_at']
    });

    // Track current, max concurrent, and all-time tile ownership per player
    const playerTileCounts: { [player: string]: Set<string> } = {};
    const playerEverOwnedTiles: { [player: string]: Set<string> } = {};
    const playerMaxTiles: { [player: string]: number } = {};

    // Process updates chronologically to track ownership
    for (const update of allTileUpdates) {
        const playerName = update.player_name;
        const tileKey = `${update.x},${update.y}`;

        if (!playerTileCounts[playerName]) {
            playerTileCounts[playerName] = new Set();
        }
        if (!playerEverOwnedTiles[playerName]) {
            playerEverOwnedTiles[playerName] = new Set();
        }

        playerEverOwnedTiles[playerName].add(tileKey);

        // Remove tile from previous owner's set if it exists
        for (const [player, tiles] of Object.entries(playerTileCounts)) {
            if (player !== playerName && tiles.delete(tileKey)) {
                break;
            }
        }

        playerTileCounts[playerName].add(tileKey);

        const currentCount = playerTileCounts[playerName].size;
        playerMaxTiles[playerName] = Math.max(
            currentCount,
            playerMaxTiles[playerName] || 0
        );
    }

    const sortedLeaderboard = Object.entries(playerMaxTiles)
        .sort((a, b) => b[1] - a[1]);

    const allTiles = new Set<string>();
    Object.values(playerTileCounts).forEach(playerTiles => {
        playerTiles.forEach(tile => allTiles.add(tile));
    });
    const totalDistinctTiles = allTiles.size;

    const leaderboardWithPercentage = sortedLeaderboard.map(([player, maxConcurrent]) => {
        const distinctPercentage = totalDistinctTiles > 0
            ? ((maxConcurrent as number) / totalDistinctTiles * 100).toFixed(1)
            : '0.0';
        const everOwned = playerEverOwnedTiles[player]?.size ?? 0;
        const everOwnedPercentage = totalDistinctTiles > 0
        ? (everOwned / totalDistinctTiles * 100).toFixed(1)
        : '0.0';
        return [player, maxConcurrent, `${distinctPercentage}%`, everOwned, `${everOwnedPercentage}%`];
    });

    return leaderboardWithPercentage;
}
