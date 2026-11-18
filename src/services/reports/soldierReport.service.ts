/** Soldier movement aggregated by faction pairing and by map tile. */

import { InferAttributes, WhereOptions } from "sequelize";
import { ActivitiesModel } from "../../models/activities/activities.model";
import { getTimespan } from "./gameReport.service";
import { ReportType, withFilteredReportCache } from "./reportCache.service";

/** Attacks and defences are the only activity types that move soldiers. */
const SOLDIER_ACTIVITY_TYPES = ['soldiers_attack', 'soldiers_defend'];

/** Worker deliveries aimed at a map tile rather than the player's own village. */
const WORKER_ACTIVITY_TYPES = [
    'fortification_workers_sent',
    'improvement_workers_sent',
    'dismantle_workers_sent',
];

export type UnitType = 'soldiers' | 'workers';

const UNIT_ACTIVITY_TYPES: Record<UnitType, string[]> = {
    soldiers: SOLDIER_ACTIVITY_TYPES,
    workers: WORKER_ACTIVITY_TYPES,
};

type ActivityFilter = WhereOptions<InferAttributes<ActivitiesModel>>;

function fetchActivities(filter: ActivityFilter, unitType: UnitType = 'soldiers') {
    return ActivitiesModel.findAll({
        where: { ...filter, type: UNIT_ACTIVITY_TYPES[unitType] ?? SOLDIER_ACTIVITY_TYPES }
    });
}

/** Soldiers sent, keyed by the sending faction then the faction holding the tile. */
export function generateSoldierStatsByFaction(filter: ActivityFilter = {}) {
    return withFilteredReportCache(
        filter as InferAttributes<ActivitiesModel>,
        ReportType.SOLDIER_FACTION,
        () => buildSoldierStatsByFaction(filter)
    );
}

async function buildSoldierStatsByFaction(filter: ActivityFilter) {
    const soldierData = await fetchActivities(filter);

    const soldiersByFaction: { [sentFrom: string]: { [sentTo: string]: number } } = {};

    for (const entry of soldierData) {
        const playerFaction = entry.player_faction || 'NEUTRAL';
        // Default to the player's own faction when the tile was unowned.
        const prevFaction = entry.previous_faction || playerFaction;

        if (!soldiersByFaction[playerFaction]) {
            soldiersByFaction[playerFaction] = { [playerFaction]: 0 };
        }
        if (!soldiersByFaction[playerFaction][prevFaction]) {
            soldiersByFaction[playerFaction][prevFaction] = 0;
        }

        let amountToAdd = entry.amount;
        const tileSoldiers = entry.tile_soldiers ?? 0;

        // Soldiers beyond what the tile held overflow into the player's own
        // faction total rather than counting against the previous owner.
        if (playerFaction !== prevFaction && entry.amount >= tileSoldiers) {
            soldiersByFaction[playerFaction][playerFaction] += tileSoldiers;
            amountToAdd -= tileSoldiers;
        }

        soldiersByFaction[playerFaction][prevFaction] += amountToAdd;
    }

    return soldiersByFaction;
}

/**
 * Units sent, keyed by tile x then y. Feeds the map heatmap.
 *
 * `unitType` switches which activities are counted so the heatmap can show
 * worker contributions as well as soldier pushes. It's part of the cache key —
 * the two produce completely different numbers for the same filter.
 */
export function generateUnitStatsByTile(
    filter: ActivityFilter = {},
    unitType: UnitType = 'soldiers'
) {
    // Passed straight through rather than cast to InferAttributes: the cache
    // helper only wants a plain params object, and `unit_type` is a cache-key
    // discriminator, not a column.
    return withFilteredReportCache(
        { ...filter, unit_type: unitType },
        ReportType.SOLDIER_TILE,
        () => buildSoldierStatsByTile(filter, unitType)
    );
}

async function buildSoldierStatsByTile(filter: ActivityFilter, unitType: UnitType) {
    const activities = await fetchActivities(filter, unitType);

    const unitsByTile: { [x: number]: { [y: number]: number } } = {};
    for (const entry of activities) {
        unitsByTile[entry.x] ??= {};
        unitsByTile[entry.x][entry.y] = (unitsByTile[entry.x][entry.y] || 0) + entry.amount;
    }

    return unitsByTile;
}

/** Slices in a map timeline. Enough to scrub smoothly, small enough to send whole. */
const TIMELINE_BUCKETS = 60;

export type UnitTimeline = {
    /** Unix seconds; the game's full span, so every metric shares one axis. */
    start: number;
    end: number;
    bucketSeconds: number;
    buckets: number;
    /** `[x, y, units per bucket]`, one entry per tile that saw any. */
    tiles: [number, number, number[]][];
};

/**
 * The by-tile heatmap split into time slices, for replaying a game.
 *
 * Sent whole so scrubbing happens in the browser. Replaying through the date
 * filter instead would cost two uncached requests per step.
 * Date bounds in `filter` are ignored: the timeline always spans the game.
 */
export function generateUnitTimeline(filter: ActivityFilter, unitType: UnitType = 'soldiers') {
    const { created_at: _dates, ...undated } = filter as Record<string, unknown>;

    return withFilteredReportCache(
        { ...undated, unit_type: unitType },
        ReportType.UNIT_TIMELINE,
        () => buildUnitTimeline(undated as ActivityFilter, unitType)
    );
}

async function buildUnitTimeline(filter: ActivityFilter, unitType: UnitType): Promise<UnitTimeline> {
    const gameId = String((filter as { game_id?: unknown }).game_id);
    const [activities, timespan] = await Promise.all([
        ActivitiesModel.findAll({
            attributes: ['x', 'y', 'amount', 'created_at'],
            where: { ...filter, type: UNIT_ACTIVITY_TYPES[unitType] ?? SOLDIER_ACTIVITY_TYPES },
            raw: true,
        }),
        getTimespan(gameId),
    ]);

    const start = Number(timespan[0]) || 0;
    const end = Number(timespan[1]) || start;
    const bucketSeconds = Math.max(1, Math.ceil((end - start + 1) / TIMELINE_BUCKETS));

    const tiles = new Map<string, [number, number, number[]]>();
    for (const activity of activities) {
        if (activity.x === null || activity.y === null) continue;

        const key = `${activity.x}:${activity.y}`;
        let tile = tiles.get(key);
        if (!tile) {
            tile = [activity.x, activity.y, new Array(TIMELINE_BUCKETS).fill(0)];
            tiles.set(key, tile);
        }

        const bucket = Math.min(
            TIMELINE_BUCKETS - 1,
            Math.max(0, Math.floor((Number(activity.created_at) - start) / bucketSeconds))
        );
        tile[2][bucket] += Number(activity.amount) || 0;
    }

    return { start, end, bucketSeconds, buckets: TIMELINE_BUCKETS, tiles: [...tiles.values()] };
}
