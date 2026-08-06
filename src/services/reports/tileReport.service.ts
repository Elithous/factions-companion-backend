/** Tile-ownership leaderboard. */

import { ActivitiesModel } from "../../models/activities/activities.model";
import { getPlayerNames } from "./playerIdentity.service";
import { ReportType, withReportCache } from "./reportCache.service";

export function generateTileLeaderboard(gameId: string) {
    return withReportCache(gameId, ReportType.TILE, () => buildTileLeaderboard(gameId));
}

async function buildTileLeaderboard(gameId: string) {
    const allTileUpdates = await ActivitiesModel.findAll({
        attributes: ['player_id', 'player_name', 'updated_at', 'x', 'y', 'captured'],
        where: {
            game_id: gameId,
            captured: true
        },
        order: ['updated_at']
    });

    // Keyed by player id — a rename would otherwise hand the player's tiles to a
    // "new" player and halve both their peak and their all-time count.
    const playerTileCounts: { [playerId: string]: Set<string> } = {};
    const playerEverOwnedTiles: { [playerId: string]: Set<string> } = {};
    const playerMaxTiles: { [playerId: string]: number } = {};

    // Process updates chronologically to track ownership
    for (const update of allTileUpdates) {
        if (update.player_id === null || update.player_id === undefined) continue;

        const playerKey = String(update.player_id);
        const tileKey = `${update.x},${update.y}`;

        if (!playerTileCounts[playerKey]) {
            playerTileCounts[playerKey] = new Set();
        }
        if (!playerEverOwnedTiles[playerKey]) {
            playerEverOwnedTiles[playerKey] = new Set();
        }

        playerEverOwnedTiles[playerKey].add(tileKey);

        // Remove tile from previous owner's set if it exists
        for (const [player, tiles] of Object.entries(playerTileCounts)) {
            if (player !== playerKey && tiles.delete(tileKey)) {
                break;
            }
        }

        playerTileCounts[playerKey].add(tileKey);

        const currentCount = playerTileCounts[playerKey].size;
        playerMaxTiles[playerKey] = Math.max(
            currentCount,
            playerMaxTiles[playerKey] || 0
        );
    }

    const sortedLeaderboard = Object.entries(playerMaxTiles)
        .sort((a, b) => b[1] - a[1]);

    const allTiles = new Set<string>();
    Object.values(playerTileCounts).forEach(playerTiles => {
        playerTiles.forEach(tile => allTiles.add(tile));
    });
    const totalDistinctTiles = allTiles.size;

    const names = await getPlayerNames();

    const leaderboardWithPercentage = sortedLeaderboard.map(([playerKey, maxConcurrent]) => {
        const playerId = Number(playerKey);
        const distinctPercentage = totalDistinctTiles > 0
            ? ((maxConcurrent as number) / totalDistinctTiles * 100).toFixed(1)
            : '0.0';
        const everOwned = playerEverOwnedTiles[playerKey]?.size ?? 0;
        const everOwnedPercentage = totalDistinctTiles > 0
        ? (everOwned / totalDistinctTiles * 100).toFixed(1)
        : '0.0';
        const player = names.get(playerId) ?? `Player ${playerId}`;
        return [player, maxConcurrent, `${distinctPercentage}%`, everOwned, `${everOwnedPercentage}%`];
    });

    return leaderboardWithPercentage;
}
