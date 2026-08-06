/** Map-building leaderboards: kills, pillaging, placement and supply. */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../db";
import { ReportType, withReportCache } from "./reportCache.service";

export function generateBuildingKillsLeaderboard(gameId: string) {
    return withReportCache(gameId, ReportType.BUILDING_KILLS, () => buildBuildingKillsLeaderboard(gameId));
}

async function buildBuildingKillsLeaderboard(gameId: string) {
    const killData = await sequelize.query(`
        SELECT x.x, x.y, x.player_faction, x.support_type as building,
            SUM(data->>'$.soldiers_destroyed') kills
        FROM activities x
        WHERE game_id = :gameId and type = 'map_building_activated'
        GROUP BY x, y, building, player_faction
        ORDER BY kills desc
        `, {
            replacements: { gameId },
            type: QueryTypes.SELECT
        });

    return killData;
}

type BuildingPillageEventRow = {
    player_name: string | null;
    tile_player: string | null;
    pillage_type: string;
    x: number | null;
    y: number | null;
    building: string | null;
    pillaged_iron: number | null;
    pillaged_wood: number | null;
};

export type BuildingPillageLocationEntry = {
    x: number;
    y: number;
    building: string;
    totalIron: number;
    totalWood: number;
    totalPillaged: number;
    eventCount: number;
    pillageCount: number;
};

export type BuildingPillageLeaderboardEntry = {
    player: string;
    totalIron: number;
    totalWood: number;
    totalPillaged: number;
    eventCount: number;
    pillageCount: number;
    locations: BuildingPillageLocationEntry[];
};

export function generateBuildingPillageLeaderboard(gameId: string) {
    return withReportCache(gameId, ReportType.BUILDING_PILLAGED, () => buildBuildingPillageLeaderboard(gameId));
}

async function buildBuildingPillageLeaderboard(gameId: string) {
    const pillageEvents = await sequelize.query<BuildingPillageEventRow>(`
        SELECT
            prev.player_name,
            pillage.tile_player,
            pillage.type AS pillage_type,
            pillage.x,
            pillage.y,
            pillage.name AS building,
            CAST(IFNULL(pillage.data->>'$.pillaged_iron', 0) AS UNSIGNED) AS pillaged_iron,
            CAST(IFNULL(pillage.data->>'$.pillaged_wood', 0) AS UNSIGNED) AS pillaged_wood
        FROM activities pillage
        JOIN activities prev ON prev.id = pillage.id - 1 AND prev.game_id = pillage.game_id
        WHERE pillage.game_id = :gameId
            AND pillage.type IN ('map_building_decayed', 'map_building_contested', 'map_building_destroyed')
        `, {
        replacements: { gameId },
        type: QueryTypes.SELECT
    });

    const byPlayer = new Map<string, BuildingPillageLeaderboardEntry & { locationMap: Map<string, BuildingPillageLocationEntry> }>();

    for (const event of pillageEvents) {
        const iron = Number(event.pillaged_iron) || 0;
        const wood = Number(event.pillaged_wood) || 0;
        const isContested = event.pillage_type === 'map_building_contested';
        const playerName = isContested
            ? (event.player_name ?? 'unknown')
            : (event.tile_player ?? 'unknown');
        const groupKey = playerName;
        const x = Number(event.x) || 0;
        const y = Number(event.y) || 0;
        const building = event.building ?? 'unknown';
        const locationKey = `${x},${y},${building}`;

        if (!byPlayer.has(groupKey)) {
            byPlayer.set(groupKey, {
                player: playerName,
                totalIron: 0,
                totalWood: 0,
                totalPillaged: 0,
                eventCount: 0,
                pillageCount: 0,
                locations: [],
                locationMap: new Map()
            });
        }

        const entry = byPlayer.get(groupKey)!;
        entry.totalIron += iron;
        entry.totalWood += wood;
        entry.totalPillaged += iron + wood;
        entry.eventCount += 1;
        if (iron + wood > 0) {
            entry.pillageCount += 1;
        }

        if (!entry.locationMap.has(locationKey)) {
            entry.locationMap.set(locationKey, {
                x,
                y,
                building,
                totalIron: 0,
                totalWood: 0,
                totalPillaged: 0,
                eventCount: 0,
                pillageCount: 0
            });
        }

        const location = entry.locationMap.get(locationKey)!;
        location.totalIron += iron;
        location.totalWood += wood;
        location.totalPillaged += iron + wood;
        location.eventCount += 1;
        if (iron + wood > 0) {
            location.pillageCount += 1;
        }
    }

    const data = Array.from(byPlayer.values())
        .map(({ locationMap, ...entry }) => ({
            ...entry,
            locations: Array.from(locationMap.values())
                .sort((a, b) =>
                    b.totalPillaged - a.totalPillaged ||
                    b.eventCount - a.eventCount ||
                    b.pillageCount - a.pillageCount
                )
        }))
        .sort((a, b) =>
            b.totalPillaged - a.totalPillaged ||
            b.eventCount - a.eventCount ||
            b.pillageCount - a.pillageCount
        );

    return data;
}

type BuildingPlacementEventRow = {
    player_id: number | null;
    player_name: string | null;
    x: number | null;
    y: number | null;
    building: string | null;
};

export type BuildingPlacementLocationEntry = {
    x: number;
    y: number;
    building: string;
    count: number;
};

export type BuildingPlacementLeaderboardEntry = {
    player_id: number | null;
    player: string;
    placements: number;
    locations: BuildingPlacementLocationEntry[];
};

export function generateBuildingPlacementLeaderboard(gameId: string) {
    return withReportCache(gameId, ReportType.BUILDING_PLACEMENT, () => buildBuildingPlacementLeaderboard(gameId));
}

async function buildBuildingPlacementLeaderboard(gameId: string) {
    const placementEvents = await sequelize.query<BuildingPlacementEventRow>(`
        SELECT
            player_id,
            player_name,
            x,
            y,
            name AS building
        FROM activities
        WHERE game_id = :gameId
            AND type = 'map_building_started'
        `, {
        replacements: { gameId },
        type: QueryTypes.SELECT
    });

    const byPlayer = new Map<string, BuildingPlacementLeaderboardEntry & { locationMap: Map<string, BuildingPlacementLocationEntry> }>();

    for (const event of placementEvents) {
        const playerId = event.player_id ?? null;
        const playerName = event.player_name ?? 'unknown';
        const groupKey = playerId !== null ? `id:${playerId}` : `name:${playerName}`;
        const x = Number(event.x) || 0;
        const y = Number(event.y) || 0;
        const building = event.building ?? 'unknown';
        const locationKey = `${x},${y},${building}`;

        if (!byPlayer.has(groupKey)) {
            byPlayer.set(groupKey, {
                player_id: playerId,
                player: playerName,
                placements: 0,
                locations: [],
                locationMap: new Map()
            });
        }

        const entry = byPlayer.get(groupKey)!;
        entry.placements += 1;

        if (!entry.locationMap.has(locationKey)) {
            entry.locationMap.set(locationKey, {
                x,
                y,
                building,
                count: 0
            });
        }

        entry.locationMap.get(locationKey)!.count += 1;
    }

    const data = Array.from(byPlayer.values())
        .map(({ locationMap, ...entry }) => ({
            ...entry,
            locations: Array.from(locationMap.values())
                .sort((a, b) => b.count - a.count || a.building.localeCompare(b.building))
        }))
        .sort((a, b) => b.placements - a.placements || a.player.localeCompare(b.player));

    return data;
}

type BuildingSupplyEventRow = {
    player_id: number | null;
    player_name: string | null;
    x: number | null;
    y: number | null;
    building: string | null;
    color: string | null;
    iron: number | null;
    wood: number | null;
    workers: number | null;
};

export type BuildingSupplyLocationEntry = {
    x: number;
    y: number;
    building: string;
    color: string;
    totalIron: number;
    totalWood: number;
    totalWorkers: number;
    totalResources: number;
    eventCount: number;
};

export type BuildingSupplyLeaderboardEntry = {
    player_id: number | null;
    player: string;
    totalIron: number;
    totalWood: number;
    totalWorkers: number;
    totalResources: number;
    eventCount: number;
    locations: BuildingSupplyLocationEntry[];
};

export function generateBuildingSupplyLeaderboard(gameId: string) {
    return withReportCache(gameId, ReportType.BUILDING_SUPPLY, () => buildBuildingSupplyLeaderboard(gameId));
}

async function buildBuildingSupplyLeaderboard(gameId: string) {
    const supplyEvents = await sequelize.query<BuildingSupplyEventRow>(`
        SELECT
            player_id,
            player_name,
            x,
            y,
            name AS building,
            tile_faction AS color,
            CAST(IFNULL(data->>'$.iron', 0) AS UNSIGNED) AS iron,
            CAST(IFNULL(data->>'$.wood', 0) AS UNSIGNED) AS wood,
            CAST(IFNULL(data->>'$.workers', 0) AS UNSIGNED) AS workers
        FROM activities
        WHERE game_id = :gameId
            AND type = 'map_building_supplied'
        `, {
        replacements: { gameId },
        type: QueryTypes.SELECT
    });

    const byPlayer = new Map<string, BuildingSupplyLeaderboardEntry & { locationMap: Map<string, BuildingSupplyLocationEntry> }>();

    for (const event of supplyEvents) {
        const iron = Number(event.iron) || 0;
        const wood = Number(event.wood) || 0;
        const workers = Number(event.workers) || 0;
        const resources = iron + wood + workers;
        const playerId = event.player_id ?? null;
        const playerName = event.player_name ?? 'unknown';
        const groupKey = playerId !== null ? `id:${playerId}` : `name:${playerName}`;
        const x = Number(event.x) || 0;
        const y = Number(event.y) || 0;
        const color = event.color ?? 'unknown';
        const building = event.building ?? 'unknown';
        const locationKey = `${x},${y},${building},${color}`;

        if (!byPlayer.has(groupKey)) {
            byPlayer.set(groupKey, {
                player_id: playerId,
                player: playerName,
                totalIron: 0,
                totalWood: 0,
                totalWorkers: 0,
                totalResources: 0,
                eventCount: 0,
                locations: [],
                locationMap: new Map()
            });
        }

        const entry = byPlayer.get(groupKey)!;
        entry.totalIron += iron;
        entry.totalWood += wood;
        entry.totalWorkers += workers;
        entry.totalResources += resources;
        entry.eventCount += 1;

        if (!entry.locationMap.has(locationKey)) {
            entry.locationMap.set(locationKey, {
                x,
                y,
                building,
                color,
                totalIron: 0,
                totalWood: 0,
                totalWorkers: 0,
                totalResources: 0,
                eventCount: 0
            });
        }

        const location = entry.locationMap.get(locationKey)!;
        location.totalIron += iron;
        location.totalWood += wood;
        location.totalWorkers += workers;
        location.totalResources += resources;
        location.eventCount += 1;
    }

    const data = Array.from(byPlayer.values())
        .map(({ locationMap, ...entry }) => ({
            ...entry,
            locations: Array.from(locationMap.values())
                .sort((a, b) => b.totalResources - a.totalResources || b.eventCount - a.eventCount)
        }))
        .sort((a, b) => b.totalResources - a.totalResources || b.eventCount - a.eventCount);

    return data;
}
