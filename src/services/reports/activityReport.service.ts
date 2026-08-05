/** Raw activity access and per-player activity summaries. */

import { InferAttributes, WhereOptions } from "sequelize";
import { ActivitiesModel } from "../../models/activities/activities.model";
import { sequelize } from "../../db";
import { getSetting } from "../settings.service";
import { ReportType, withReportCache } from "./reportCache.service";

export async function getAllActivities(filter?: WhereOptions<InferAttributes<ActivitiesModel>>) {
    return await ActivitiesModel.findAll({
        where: {
            ...filter
        }
    });
}

/** How many activities of the given types each player performed. */
export function generatePlayerActionCounts(gameId: string, types: string[]) {
    return withReportCache(gameId, ReportType.PLAYER_ACTIONS, () => buildPlayerActionCounts(gameId, types), { types });
}

async function buildPlayerActionCounts(gameId: string, types: string[]) {
    const actionCounts = await ActivitiesModel.findAll({
        attributes: [
            'player_name',
            [sequelize.fn('COUNT', sequelize.col('updated_at')), 'actions']
        ],
        where: {
            game_id: gameId,
            type: types
        },
        group: ['player_name'],
        order: [[sequelize.fn('COUNT', sequelize.col('updated_at')), 'DESC']],
        raw: true
    });

    return actionCounts;
}

/** Activity types that describe changes to a player's village. */
const BUILD_ACTIVITY_TYPES = [
    'building_built', 'building_upgraded', 'building_destroyed', 'hq_upgraded'
] as const;

/** Activity types that describe a player's own progression choices. */
const PERSONAL_ACTIVITY_TYPES = [
    'talent_picked', 'spec_picked', 'personal_project_picked'
] as const;

type BuildActivityType = typeof BUILD_ACTIVITY_TYPES[number];
type PersonalActivityType = typeof PERSONAL_ACTIVITY_TYPES[number];

type PlayerStats = {
    playerName: string
    buildActivities: {
        type: BuildActivityType
        name: string
        level: number
        timestamp: number
    }[]
    personalActivities: {
        type: PersonalActivityType
        name: string
        category: string
        tier: number
        timestamp: number
    }[]
}

/**
 * A player's build and progression history, for the player stats timeline.
 * Players can opt out of being shown; those return `{ error: 'player_hidden' }`.
 */
export async function generatePlayerStatsByPlayerName(gameId: string, playerName: string) {
    if ((await getSetting("hiddenPlayers"))?.includes(playerName)) {
        return { error: 'player_hidden' };
    }

    return withReportCache(gameId, ReportType.PLAYER_STATS, () => buildPlayerStats(gameId, playerName), { playerName });
}

async function buildPlayerStats(gameId: string, playerName: string): Promise<PlayerStats> {
    const activities = await ActivitiesModel.findAll({
        where: {
            game_id: gameId,
            player_name: playerName,
            type: [...BUILD_ACTIVITY_TYPES, ...PERSONAL_ACTIVITY_TYPES]
        },
        order: [['created_at', 'ASC']]
    });

    const buildActivities = activities
        .filter(a => (BUILD_ACTIVITY_TYPES as readonly string[]).includes(a.type))
        .map(a => ({
            type: a.type as BuildActivityType,
            name: a.name,
            level: (a.data as any).level ?? null,
            timestamp: a.created_at
        }));

    const personalActivities = activities
        .filter(a => (PERSONAL_ACTIVITY_TYPES as readonly string[]).includes(a.type))
        .map(a => ({
            type: a.type as PersonalActivityType,
            name: a.name,
            category: (a.data as any).category ?? null,
            tier: (a.data as any).tier ?? null,
            timestamp: a.created_at
        }));

    return { playerName, buildActivities, personalActivities };
}
