/** Loot actions: bursts of coordinated HQ looting, grouped by team and target. */

import { Op } from "sequelize";
import { ActivitiesModel } from "../../models/activities/activities.model";
import { FactionColor } from "../../types/faction.type";
import { getHqPositionLookup, getHqPositions } from "./gameReport.service";
import { ReportType, withReportCache } from "./reportCache.service";

export type LootActionParticipant = {
    playerId: number
    playerName: string
    totalVp: number
    tilesTakenCount: number
    soldiersUsed: number
    workersUsed: number
    supportsUsed: number
    actions: ActivitiesModel[]
}

export type LootAction = {
    lootingTeam: FactionColor
    lootedTeam: FactionColor
    totalVp: number
    totalTilesTaken: number
    soldiersUsed: number
    workersUsed: number
    supportsUsed: number
    startTime: number
    endTime: number
    participants: LootActionParticipant[] | null
}

const LOOT_ACTIONS_MAX_SECONDS = 5 * 60; // 5 minutes
const SOLDIERS_TO_VP_RATIO = 2.5;

export function generateLootActions(gameId: string) {
    return withReportCache(gameId, ReportType.LOOT_ACTIONS, () => buildLootActions(gameId));
}

/**
 * Groups individual loot activities into "loot actions" — bursts of activity by
 * one team against one HQ, within LOOT_ACTIONS_MAX_SECONDS of each other.
 */
async function buildLootActions(gameId: string): Promise<LootAction[]> {
    const lootActivitiesRaw = await ActivitiesModel.findAll({
        attributes: ['id', 'x', 'y', 'amount', 'player_id', 'player_name', 'player_faction', 'created_at'],
        where: {
            game_id: gameId,
            type: 'loot'
        },
        order: [['created_at', 'ASC']],
        raw: true
    });

    const teamHQs = await getHqPositions(gameId);
    const hqByPositions = await getHqPositionLookup(gameId);

    // Group lootActivities by HQ Faction, player_faction, and created_at within LOOT_ACTIONS_MAX_SECONDS window
    // We'll assume activities that are within LOOT_ACTIONS_MAX_SECONDS of each other are in the same group
    const groupedLootActivities: {
        hq_faction: FactionColor
        player_faction: FactionColor | null,
        groupStart: number,
        totalVP: number,
        loots: typeof lootActivitiesRaw
    }[] = [];

    // Sort activities by HQ Faction, player_faction, then created_at
    const sortedLootActivities = lootActivitiesRaw.sort((a, b) => {
        if (a.x !== b.x) return a.x - b.x;
        if (a.y !== b.y) return a.y - b.y;
        if (a.player_faction !== b.player_faction) return (a.player_faction || '').toString().localeCompare((b.player_faction || '').toString());
        return (a.created_at as number) - (b.created_at as number);
    });

    for (const activity of sortedLootActivities) {
        const hqKey = `${activity.x}:${activity.y}`;
        const hqFaction = hqByPositions[hqKey];
        const faction = activity.player_faction;
        const actTime = Number(activity.created_at);

        // Try to find a group for this activity
        let foundGroup = groupedLootActivities.find(group =>
            group.hq_faction === hqFaction &&
            group.player_faction === faction &&
            // within group window
            Math.abs(actTime - group.groupStart) <= LOOT_ACTIONS_MAX_SECONDS
        );

        if (!foundGroup) {
            groupedLootActivities.push({
                hq_faction: hqFaction,
                player_faction: faction,
                groupStart: actTime,
                totalVP: activity.amount,
                loots: [activity]
            });
        } else {
            foundGroup.totalVP += activity.amount;
            foundGroup.loots.push(activity);
        }
    }

    const lootActivities = groupedLootActivities;
    const lootActions: LootAction[] = [];

    for (const lootActivity of lootActivities) {
        const playerFaction = lootActivity.player_faction;
        const hqFaction = lootActivity.hq_faction;
        const hqLocation = teamHQs[hqFaction];
        const minLootTime = lootActivity.groupStart - LOOT_ACTIONS_MAX_SECONDS;
        const maxLootTime = lootActivity.groupStart + LOOT_ACTIONS_MAX_SECONDS;

        // Get all eligible tile taking actions that could have led up to this loot
        const allPotentialConnectorTiles = await ActivitiesModel.findAll({
            attributes: ['x', 'y'],
            where: {
                game_id: gameId,
                player_faction: playerFaction,
                previous_faction: hqFaction,
                created_at: { [Op.between]: [minLootTime, maxLootTime] },
                captured: 1,
                type: 'soldiers_attack'
            },
            raw: true
        });

        // BFS to find all tiles connected to HQ
        const visited = new Set<string>();
        const queue: { x: number; y: number }[] = [{ x: hqLocation.x, y: hqLocation.y }];
        const tileSet = new Set<string>(allPotentialConnectorTiles.map(t => `${t.x},${t.y}`));
        const connectedTiles: { x: number; y: number }[] = [];

        // HQ will never be captured, and therefore not be in the tileSet unless we add it.
        tileSet.add(`${hqLocation.x},${hqLocation.y}`);

        while (queue.length > 0) {
            const current = queue.shift();
            const key = `${current.x},${current.y}`;
            if (visited.has(key) || !tileSet.has(key)) continue;
            visited.add(key);
            connectedTiles.push(current);

            // Look for neighboring tiles in tileSet (up, down, left, right)
            for (const delta of [
                { dx: -1, dy: 0 },
                { dx: 1, dy: 0 },
                { dx: 0, dy: -1 },
                { dx: 0, dy: 1 }
            ]) {
                const neighbor = { x: current.x + delta.dx, y: current.y + delta.dy };
                const neighborKey = `${neighbor.x},${neighbor.y}`;
                if (tileSet.has(neighborKey) && !visited.has(neighborKey)) {
                    queue.push(neighbor);
                }
            }
        }

        // Get all soldier and special unit actions within the timeframe AND on connected tiles only
        const tileActions = await ActivitiesModel.findAll({
            attributes: ['id', 'x', 'y', 'player_id', 'player_name', 'amount', 'captured', 'type', 'support_type', 'created_at'],
            where: {
                game_id: gameId,
                player_faction: playerFaction,
                created_at: { [Op.between]: [minLootTime, maxLootTime] },
                type: ['soldiers_attack', 'soldiers_defend', 'support_sent', 'fortification_workers_sent'],
                [Op.or]: connectedTiles
            },
            raw: true
        });

        const lootAction: LootAction = {
            lootingTeam: playerFaction,
            lootedTeam: hqFaction,
            totalVp: 0,
            totalTilesTaken: 0,
            soldiersUsed: 0,
            workersUsed: 0,
            supportsUsed: 0,
            startTime: lootActivity.groupStart,
            endTime: lootActivity.groupStart,
            participants: null
        };

        const participantsMap = new Map<number, LootActionParticipant>();
        for (const loot of lootActivity.loots) {
            const participantKey = loot.player_id;
            const vpAdded = loot.amount;
            const soldiersAdded = Math.round(vpAdded * SOLDIERS_TO_VP_RATIO);

            if (!participantsMap.has(participantKey)) {
                participantsMap.set(participantKey, {
                    playerId: loot.player_id,
                    playerName: loot.player_name,
                    soldiersUsed: 0,
                    supportsUsed: 0,
                    workersUsed: 0,
                    totalVp: 0,
                    tilesTakenCount: 0,
                    actions: []
                });
            }

            const participantEntry = participantsMap.get(participantKey);
            participantEntry.actions.push(loot);

            lootAction.totalVp += vpAdded;
            participantEntry.totalVp += vpAdded;

            lootAction.soldiersUsed += soldiersAdded;
            participantEntry.soldiersUsed += soldiersAdded;

            if (lootAction.startTime > loot.created_at) {
                lootAction.startTime = loot.created_at;
            }
            if (lootAction.endTime < loot.created_at) {
                lootAction.endTime = loot.created_at;
            }
        }

        for (const tileAction of tileActions) {
            const participantKey = tileAction.player_id;

            if (!participantsMap.has(participantKey)) {
                participantsMap.set(participantKey, {
                    playerId: tileAction.player_id,
                    playerName: tileAction.player_name,
                    soldiersUsed: 0,
                    supportsUsed: 0,
                    workersUsed: 0,
                    totalVp: 0,
                    tilesTakenCount: 0,
                    actions: []
                });
            }

            const participantEntry = participantsMap.get(participantKey);
            participantEntry.actions.push(tileAction);

            switch(tileAction.type) {
                case 'soldiers_attack':
                case 'soldiers_defend':
                    participantEntry.soldiersUsed += tileAction.amount;
                    lootAction.soldiersUsed += tileAction.amount;

                    participantEntry.tilesTakenCount += tileAction.captured ? 1 : 0;
                    lootAction.totalTilesTaken += tileAction.captured ? 1 : 0;
                    break;
                case 'support_sent':
                    participantEntry.supportsUsed += 1;
                    lootAction.supportsUsed += 1;
                    break;
                case 'fortification_workers_sent':
                    participantEntry.workersUsed += tileAction.amount;
                    lootAction.workersUsed += tileAction.amount;
                    break;
            }

            if (lootAction.startTime > tileAction.created_at) {
                lootAction.startTime = tileAction.created_at;
            }
            if (lootAction.endTime < tileAction.created_at) {
                lootAction.endTime = tileAction.created_at;
            }
        }

        const participants = Array.from(participantsMap.values())
            .sort((a, b) => b.totalVp - a.totalVp ||
                b.soldiersUsed - a.soldiersUsed ||
                b.supportsUsed - a.supportsUsed ||
                b.workersUsed - a.workersUsed
            );

        lootAction.participants = participants;

        lootActions.push(lootAction);
    }

    lootActions.sort((a, b) => b.totalVp - a.totalVp ||
        b.soldiersUsed - a.soldiersUsed ||
        b.supportsUsed - a.supportsUsed ||
        b.workersUsed - a.workersUsed
    );

    // Cache the results

    return lootActions;
}
