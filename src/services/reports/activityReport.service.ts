import { InferAttributes, WhereOptions } from "sequelize";
import { ActivitiesModel } from "../../models/activities/activities.model";
import { cacheReport, getCachedReport, ReportType } from "./reportCache.service";
import { sequelize } from "../../controllers/database.controller";

export async function generateSoldierStatsByFaction(filter?: WhereOptions<InferAttributes<ActivitiesModel>>) {
    if (!filter) filter = {};

    const cacheFilter = { ...filter } as InferAttributes<ActivitiesModel>;
    let useCache = true;

    // Don't use cache if filtering by dates
    if (cacheFilter.created_at || cacheFilter.updated_at) {
        useCache = false;
    }

    // Check cache first if game ID exists in filter and we can use cache
    if (useCache) {
        const cachedData = await getCachedReport(`${cacheFilter.game_id}`, ReportType.SOLDIER_FACTION, cacheFilter);
        if (cachedData) {
            return cachedData;
        }
    }

    const soldierData = await ActivitiesModel.findAll({
        where: {
            ...filter,
            type: ['soldiers_attack', 'soldiers_defend']
        }
    });

    // Aggregate soldiers sent by faction and faction sent to
    const soldiersByFaction: { [sentFrom: string]: { [sentTo: string]: number } } = {};

    // Process all entries in a single pass
    for (const entry of soldierData) {
        const playerFaction = entry.player_faction;
        const prevFaction = entry.previous_faction || playerFaction; // Default to player faction if null

        // Initialize nested objects if needed
        if (!soldiersByFaction[playerFaction]) {
            soldiersByFaction[playerFaction] = { [playerFaction]: 0 };
        }

        if (!soldiersByFaction[playerFaction][prevFaction]) {
            soldiersByFaction[playerFaction][prevFaction] = 0;
        }

        let amountToAdd = entry.amount;

        // Handle overflow case
        if (playerFaction !== prevFaction && entry.amount >= entry.tile_soldiers) {
            soldiersByFaction[playerFaction][playerFaction] += entry.tile_soldiers;
            amountToAdd -= entry.tile_soldiers;
        }

        soldiersByFaction[playerFaction][prevFaction] += amountToAdd;
    }

    // Cache the results if we can use cache
    if (useCache) {
        const cacheDuration = 1000 * 5 * 60; // 5 minutes
        await cacheReport(`${cacheFilter.game_id}`, ReportType.SOLDIER_FACTION, soldiersByFaction, cacheFilter, cacheDuration);
    }

    return soldiersByFaction;
}

export async function generateSoldierStatsByTile(filter?: WhereOptions<InferAttributes<ActivitiesModel>>) {
    if (!filter) filter = {};

    const cacheFilter = { ...filter } as InferAttributes<ActivitiesModel>;
    let useCache = true;

    // Don't use cache if filtering by dates
    if (cacheFilter.created_at || cacheFilter.updated_at) {
        useCache = false;
    }

    // Check cache first if game ID exists in filter and we can use cache
    if (useCache) {
        const cachedData = await getCachedReport(`${cacheFilter.game_id}`, ReportType.SOLDIER_TILE, cacheFilter);
        if (cachedData) {
            return cachedData;
        }
    }

    const soldierData = await ActivitiesModel.findAll({
        where: {
            ...filter,
            type: ['soldiers_attack', 'soldiers_defend']
        }
    });

    // Aggregate soldiers sent by tile x and y
    const soldiersByTile: { [x: number]: { [y: number]: number } } = {}
    for (const entry of soldierData) {
        if (!soldiersByTile[entry.x]) {
            soldiersByTile[entry.x] = {};
        }
        if (!soldiersByTile[entry.x][entry.y]) {
            soldiersByTile[entry.x][entry.y] = 0;
        }
        soldiersByTile[entry.x][entry.y] += entry.amount;
    }

    // Cache the results if we can use cache
    if (useCache) {
        const cacheDuration = 1000 * 5 * 60; // 5 minutes
        await cacheReport(`${cacheFilter.game_id}`, ReportType.SOLDIER_TILE, soldiersByTile, cacheFilter, cacheDuration);
    }

    return soldiersByTile;
}

export async function getAllActivities(filter?: WhereOptions<InferAttributes<ActivitiesModel>>) {
    return await ActivitiesModel.findAll({
        where: {
            ...filter
        }
    });
}

export async function generatePlayerActionCounts(gameId: string, types: string[]) {
    // Check cache first
    const cachedData = await getCachedReport(gameId, ReportType.PLAYER_ACTIONS, { types });
    if (cachedData) {
        return cachedData;
    }

    // If no cache, generate the report
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

    // Cache the results
    await cacheReport(gameId, ReportType.PLAYER_ACTIONS, actionCounts, { types });

    return actionCounts;
}