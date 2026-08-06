/** Raw activity access and per-player activity summaries. */

import { InferAttributes, WhereOptions } from "sequelize";
import { ActivitiesModel } from "../../models/activities/activities.model";
import { sequelize } from "../../db";
import { getSetting } from "../settings.service";
import { getPlayerNames } from "./playerIdentity.service";
import {
    getProjectTrees,
    resolvePicks,
    type NodeEffect,
    type ProjectNode,
} from "./projectTree.service";
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
    const rows = await ActivitiesModel.findAll({
        attributes: [
            'player_id',
            [sequelize.fn('COUNT', sequelize.col('updated_at')), 'actions']
        ],
        where: {
            game_id: gameId,
            type: types
        },
        group: ['player_id'],
        order: [[sequelize.fn('COUNT', sequelize.col('updated_at')), 'DESC']],
        raw: true
    }) as unknown as { player_id: number; actions: number }[];

    const names = await getPlayerNames();

    return rows.map(row => ({
        player_id: row.player_id,
        player_name: names.get(row.player_id) ?? `Player ${row.player_id}`,
        actions: Number(row.actions) || 0,
    }));
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
    playerId: number
    /** Latest known name, for display. */
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
        /** 1-based position in the order this type's picks were taken. */
        order: number
        /** Node id once resolved, null when it couldn't be pinned down. */
        nodeId: number | null
        /** The prerequisite node, when known. */
        parentId: number | null
        /** What the node grants. Empty until it resolves. */
        effects: NodeEffect[]
        /** True when several nodes matched and none could be ruled out. */
        ambiguous: boolean
    }[]
}

/**
 * A player's build and progression history, for the player stats timeline.
 * Players can opt out of being shown; those return `{ error: 'player_hidden' }`.
 */
export async function generatePlayerStats(gameId: string, playerId: number) {
    if ((await getSetting("hiddenPlayers"))?.includes(playerId)) {
        return { error: 'player_hidden' };
    }

    return withReportCache(gameId, ReportType.PLAYER_STATS, () => buildPlayerStats(gameId, playerId), { playerId });
}

async function buildPlayerStats(gameId: string, playerId: number): Promise<PlayerStats> {
    const activities = await ActivitiesModel.findAll({
        where: {
            game_id: gameId,
            player_id: playerId,
            type: [...BUILD_ACTIVITY_TYPES, ...PERSONAL_ACTIVITY_TYPES]
        },
        order: [['created_at', 'ASC']]
    });

    const playerName = (await getPlayerNames()).get(playerId)
        ?? activities[activities.length - 1]?.player_name
        ?? `Player ${playerId}`;

    const buildActivities = activities
        .filter(a => (BUILD_ACTIVITY_TYPES as readonly string[]).includes(a.type))
        .map(a => ({
            type: a.type as BuildActivityType,
            name: a.name,
            level: (a.data as any).level ?? null,
            timestamp: a.created_at
        }));

    const rawPicks = activities
        .filter(a => (PERSONAL_ACTIVITY_TYPES as readonly string[]).includes(a.type))
        .map(a => ({
            type: a.type as PersonalActivityType,
            name: a.name,
            category: (a.data as any).category ?? null,
            tier: (a.data as any).tier ?? null,
            timestamp: a.created_at
        }));

    const personalActivities = await resolveAgainstTrees(gameId, rawPicks);

    return { playerId, playerName, buildActivities, personalActivities };
}

/** Which tree each kind of pick is drawn from. `spec_picked` isn't a node. */
const TREE_FOR_TYPE: Partial<Record<PersonalActivityType, 'talents' | 'personal_projects'>> = {
    talent_picked: 'talents',
    personal_project_picked: 'personal_projects',
};

type RawPersonalPick = {
    type: PersonalActivityType;
    name: string;
    category: string | null;
    tier: number | null;
    timestamp: number;
};

/**
 * Attaches each pick to the node it refers to.
 *
 * Picks are resolved per tree, because the replay that disambiguates them
 * depends on which prerequisites are already satisfied *within that tree*.
 * `spec_picked` has no tree — it's the specialization itself — so it passes
 * through unresolved with its own ordering.
 *
 * A missing or unreadable definition leaves everything unresolved rather than
 * failing: the picks themselves are still worth showing.
 */
async function resolveAgainstTrees(gameId: string, picks: RawPersonalPick[]) {
    let trees: Awaited<ReturnType<typeof getProjectTrees>> | null = null;
    try {
        trees = await getProjectTrees(gameId);
    } catch (error) {
        console.error(`No project trees for game ${gameId}; picks stay unresolved:`, error);
    }

    const resolved: PlayerStats['personalActivities'] = [];

    for (const type of PERSONAL_ACTIVITY_TYPES) {
        const ofType = picks.filter(pick => pick.type === type);
        if (!ofType.length) continue;

        const treeKind = TREE_FOR_TYPE[type];
        const nodes: ProjectNode[] = treeKind && trees ? trees[treeKind] : [];

        resolvePicks(ofType, nodes).forEach(match => {
            const source = ofType.find(pick => pick.timestamp === match.timestamp && pick.name === match.name);

            resolved.push({
                type,
                name: match.name,
                // The node's category is authoritative — a pick's own category
                // can disagree, and the node is what the tree is built from.
                category: match.node?.category ?? source?.category ?? null as never,
                tier: match.tier as never,
                timestamp: match.timestamp,
                order: match.order,
                nodeId: match.node?.id ?? null,
                parentId: match.parentId,
                effects: match.node?.effects ?? [],
                ambiguous: match.ambiguous,
            });
        });
    }

    return resolved;
}
