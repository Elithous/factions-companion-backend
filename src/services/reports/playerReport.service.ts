/** Player-centric leaderboards: MVP score, actions-per-minute and loot. */

import { apiFetch } from "../../clients/factionsApi";
import { ActivitiesModel } from "../../models/activities/activities.model";
import { FactionColor } from "../../types/faction.type";
import { getHqPositionLookup } from "./gameReport.service";
import { getPlayerNames } from "./playerIdentity.service";
import { ReportType, withReportCache } from "./reportCache.service";

export function generatePlayerMvpLeaderboard(gameId: string) {
    return withReportCache(gameId, ReportType.PLAYER_MVP, () => buildPlayerMvpLeaderboard(gameId));
}

/** MVP score = soldiers sent (weighted) + workers sent. */
async function buildPlayerMvpLeaderboard(gameId: string) {
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

    return scores;
}

export function generateApmLeaderboard(gameId: string, timespan: number, uniqueOnly: boolean = false) {
    // The timespan and uniqueOnly flags change the result, so they key the cache entry.
    const params = { timespan, uniqueOnly };
    return withReportCache(gameId, ReportType.APM, () => buildApmLeaderboard(gameId, timespan, uniqueOnly), params);
}

/** Highest action count any player reached inside a rolling `timespan`-second window. */
async function buildApmLeaderboard(gameId: string, timespan: number, uniqueOnly: boolean = false) {
    const allActions = await ActivitiesModel.findAll({
        attributes: {
            include: ['updated_at', 'player_id', 'x', 'y']
        },
        where: {
            game_id: gameId
        },
        order: ['updated_at']
    })

    // Keyed by id: a rename partway through a game would otherwise split one
    // player's actions into two windows and understate their peak rate.
    const playerActions: Record<number, { time: number, x: number, y: number }[]> = {};
    for (const action of allActions) {
        if (action.player_id === null || action.player_id === undefined) continue;

        if (!playerActions[action.player_id]) {
            playerActions[action.player_id] = [];
        }

        const actions = playerActions[action.player_id];

        if (uniqueOnly) {
            // Only add if this x,y combination hasn't been seen in the current window
            const lastAction = actions[actions.length - 1];
            if (!lastAction || lastAction.x !== action.x || lastAction.y !== action.y) {
                actions.push({ time: action.updated_at, x: action.x, y: action.y });
            }
        } else {
            actions.push({ time: action.updated_at, x: action.x, y: action.y });
        }
    }

    const names = await getPlayerNames();
    const leaderboard: { playerId: number; player: string; apm: number }[] = [];

    for (const [playerId, actions] of Object.entries(playerActions)) {
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

        const id = Number(playerId);
        leaderboard.push({
            playerId: id,
            player: names.get(id) ?? `Player ${id}`,
            apm: highestApm,
        });
    }

    return leaderboard.sort((a, b) => b.apm - a.apm);
}

export type PlayerLootTeamEntry = {
    team: FactionColor;
    totalVp: number;
    lootCount: number;
};

export type PlayerLootLeaderboardEntry = {
    player_id: number | null;
    player: string;
    totalVp: number;
    lootCount: number;
    teams: PlayerLootTeamEntry[];
};

export function generatePlayerLootLeaderboard(gameId: string) {
    return withReportCache(gameId, ReportType.PLAYER_LOOT, () => buildPlayerLootLeaderboard(gameId));
}

async function buildPlayerLootLeaderboard(gameId: string): Promise<PlayerLootLeaderboardEntry[]> {
    const lootActivities = await ActivitiesModel.findAll({
        attributes: ['player_id', 'player_name', 'amount', 'x', 'y'],
        where: {
            game_id: gameId,
            type: 'loot'
        }
    });

    const [hqByPositions, names] = await Promise.all([
        getHqPositionLookup(gameId),
        getPlayerNames(),
    ]);

    const byPlayer = new Map<string, PlayerLootLeaderboardEntry & { teamMap: Map<string, PlayerLootTeamEntry> }>();

    for (const loot of lootActivities) {
        const x = Number(loot.x) || 0;
        const y = Number(loot.y) || 0;
        const vp = Number(loot.amount) || 0;
        const playerId = loot.player_id ?? null;
        // Latest known name, so a rename doesn't show the same person twice.
        const playerName = (playerId !== null ? names.get(playerId) : null)
            ?? loot.player_name
            ?? 'unknown';
        const groupKey = `${playerId}`;
        const hqPositionKey = `${x}:${y}`;
        const teamKey = hqByPositions[hqPositionKey];

        if (!byPlayer.has(groupKey)) {
            byPlayer.set(groupKey, {
                player_id: playerId,
                player: playerName,
                totalVp: 0,
                lootCount: 0,
                teams: [],
                teamMap: new Map()
            });
        }

        const entry = byPlayer.get(groupKey)!;
        entry.totalVp += vp;
        entry.lootCount += 1;

        if (!entry.teamMap.has(teamKey)) {
            entry.teamMap.set(teamKey, {
                team: teamKey,
                totalVp: 0,
                lootCount: 0
            });
        }

        const team = entry.teamMap.get(teamKey)!;
        team.totalVp += vp;
        team.lootCount += 1;
    }

    const data = Array.from(byPlayer.values())
        .map(({ teamMap, ...entry}) => ({
            ...entry,
            teams: Array.from(teamMap.values())
                .sort((a, b) => b.totalVp - a.totalVp || b.lootCount - a.lootCount)
        }))
        .sort((a, b) => b.totalVp - a.totalVp || b.lootCount - a.lootCount);

    return data;
}
