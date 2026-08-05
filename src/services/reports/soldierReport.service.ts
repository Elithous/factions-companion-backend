/** Soldier movement aggregated by faction pairing and by map tile. */

import { InferAttributes, WhereOptions } from "sequelize";
import { ActivitiesModel } from "../../models/activities/activities.model";
import { ReportType, withFilteredReportCache } from "./reportCache.service";

/** Attacks and defences are the only activity types that move soldiers. */
const SOLDIER_ACTIVITY_TYPES = ['soldiers_attack', 'soldiers_defend'];

type ActivityFilter = WhereOptions<InferAttributes<ActivitiesModel>>;

function fetchSoldierActivities(filter: ActivityFilter) {
    return ActivitiesModel.findAll({
        where: { ...filter, type: SOLDIER_ACTIVITY_TYPES }
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
    const soldierData = await fetchSoldierActivities(filter);

    const soldiersByFaction: { [sentFrom: string]: { [sentTo: string]: number } } = {};

    for (const entry of soldierData) {
        const playerFaction = entry.player_faction;
        // Default to the player's own faction when the tile was unowned.
        const prevFaction = entry.previous_faction || playerFaction;

        if (!soldiersByFaction[playerFaction]) {
            soldiersByFaction[playerFaction] = { [playerFaction]: 0 };
        }
        if (!soldiersByFaction[playerFaction][prevFaction]) {
            soldiersByFaction[playerFaction][prevFaction] = 0;
        }

        let amountToAdd = entry.amount;

        // Soldiers beyond what the tile held overflow into the player's own
        // faction total rather than counting against the previous owner.
        if (playerFaction !== prevFaction && entry.amount >= entry.tile_soldiers) {
            soldiersByFaction[playerFaction][playerFaction] += entry.tile_soldiers;
            amountToAdd -= entry.tile_soldiers;
        }

        soldiersByFaction[playerFaction][prevFaction] += amountToAdd;
    }

    return soldiersByFaction;
}

/** Soldiers sent, keyed by tile x then y. Feeds the map heatmap. */
export function generateSoldierStatsByTile(filter: ActivityFilter = {}) {
    return withFilteredReportCache(
        filter as InferAttributes<ActivitiesModel>,
        ReportType.SOLDIER_TILE,
        () => buildSoldierStatsByTile(filter)
    );
}

async function buildSoldierStatsByTile(filter: ActivityFilter) {
    const soldierData = await fetchSoldierActivities(filter);

    const soldiersByTile: { [x: number]: { [y: number]: number } } = {};
    for (const entry of soldierData) {
        soldiersByTile[entry.x] ??= {};
        soldiersByTile[entry.x][entry.y] = (soldiersByTile[entry.x][entry.y] || 0) + entry.amount;
    }

    return soldiersByTile;
}
