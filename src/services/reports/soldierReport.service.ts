/** Soldier movement aggregated by faction pairing and by map tile. */

import { InferAttributes, WhereOptions } from "sequelize";
import { ActivitiesModel } from "../../models/activities/activities.model";
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
