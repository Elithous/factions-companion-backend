import { QueryTypes } from "sequelize";
import { apiFetch } from "../../controllers/api.controller";
import { sequelize } from "../../controllers/database.controller";
import { ActivitiesModel } from "../../models/activities/activities.model";
import { cacheReport, getCachedReport, ReportType } from "./reportCache.service";

export async function generatePlayerMvpLeaderboard(gameId: string) {
    // Check cache first
    const cachedData = await getCachedReport(gameId, ReportType.PLAYER_MVP);
    if (cachedData) {
        return cachedData;
    }

    // If no cache, generate the report
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

    // Cache the results
    await cacheReport(gameId, ReportType.PLAYER_MVP, scores);

    return scores;
}

export async function generateApmLeaderboard(gameId: string, timespan: number, uniqueOnly: boolean = false) {
    // Parameter to differentiate different timespan values
    const params = { timespan, uniqueOnly };

    // Check cache first
    const cachedData = await getCachedReport(gameId, ReportType.APM, params);
    if (cachedData) {
        return cachedData;
    }

    const allActions = await ActivitiesModel.findAll({
        attributes: {
            include: ['updated_at', 'player_name', 'x', 'y']
        },
        where: {
            game_id: gameId
        },
        order: ['updated_at']
    })
    const playerActions: Record<string, { time: number, x: number, y: number }[]> = {};
    for (const action of allActions) {
        if (!playerActions[action.player_name]) {
            playerActions[action.player_name] = [];
        }

        if (uniqueOnly) {
            // Only add if this x,y combination hasn't been seen in the current window
            const lastAction = playerActions[action.player_name][playerActions[action.player_name].length - 1];
            if (!lastAction || lastAction.x !== action.x || lastAction.y !== action.y) {
                playerActions[action.player_name].push({
                    time: action.updated_at,
                    x: action.x,
                    y: action.y
                });
            }
        } else {
            playerActions[action.player_name].push({
                time: action.updated_at,
                x: action.x,
                y: action.y
            });
        }
    }

    const leaderboard: { [player: string]: number } = {};

    for (const [player, actions] of Object.entries(playerActions)) {
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

        leaderboard[player] = highestApm;
    }

    const sortedLeaderboard = Object.entries(leaderboard).sort((a, b) => b[1] - a[1]);

    // Cache the results with parameters
    await cacheReport(gameId, ReportType.APM, sortedLeaderboard, params);

    return sortedLeaderboard;
}

export async function generateTileLeaderboard(gameId: string) {
    // Check cache first
    const cachedData = await getCachedReport(gameId, ReportType.TILE);
    if (cachedData) {
        return cachedData;
    }

    const allTileUpdates = await ActivitiesModel.findAll({
        attributes: ['player_name', 'updated_at', 'x', 'y', 'captured'],
        where: {
            game_id: gameId,
            captured: true
        },
        order: ['updated_at']
    });

    // Track current and max tile counts for each player
    const playerTileCounts: { [player: string]: Set<string> } = {};
    const playerMaxTiles: { [player: string]: number } = {};

    // Process updates chronologically to track ownership
    for (const update of allTileUpdates) {
        // Initialize player sets if needed
        if (!playerTileCounts[update.player_name]) {
            playerTileCounts[update.player_name] = new Set();
        }

        // Add tile to player's set
        const tileKey = `${update.x},${update.y}`;

        // Remove tile from previous owner's set if it exists
        for (const [player, tiles] of Object.entries(playerTileCounts)) {
            if (player !== update.player_name && tiles.delete(tileKey)) {
                break; // Exit once we find and remove the tile
            }
        }

        // Add to new owner's set
        playerTileCounts[update.player_name].add(tileKey);

        // Update max tile count for this player
        const currentCount = playerTileCounts[update.player_name].size;
        playerMaxTiles[update.player_name] = Math.max(
            currentCount,
            playerMaxTiles[update.player_name] || 0
        );
    }

    // Sort players by their max tile count
    const sortedLeaderboard = Object.entries(playerMaxTiles)
        .sort((a, b) => b[1] - a[1]);
    // Calculate the total number of distinct tiles captured
    const allTiles = new Set<string>();
    Object.values(playerTileCounts).forEach(playerTiles => {
        playerTiles.forEach(tile => allTiles.add(tile));
    });
    const totalDistinctTiles = allTiles.size;

    // Add percentage to each leaderboard entry
    const leaderboardWithPercentage = sortedLeaderboard.map(([player, count]) => {
        const percentage = totalDistinctTiles > 0 ? ((count as number) / totalDistinctTiles * 100).toFixed(1) : '0.0';
        return [player, count, `${percentage}%`];
    });

    // Cache the results
    await cacheReport(gameId, ReportType.TILE, leaderboardWithPercentage);

    return leaderboardWithPercentage;
}

export async function generateResourcesSentLeaderboard(gameId: string) {
    // Check cache first
    const cachedData = await getCachedReport(gameId, ReportType.RESOURCES_SENT);
    if (cachedData) {
        return cachedData;
    }

    const allResourceSends = await ActivitiesModel.findAll({
        attributes: ['player_name', 'iron', 'wood', 'recipient'],
        where: {
            game_id: gameId,
            type: 'resources_sent'
        },
        order: ['player_name']
    });

    // Aggregate resources sent by player and recipient
    const playerResources: { [player: string]: { totalIron: number, totalWood: number, recipients: { [recipient: string]: { iron: number, wood: number } } } } = {};

    for (const send of allResourceSends) {
        const player = send.player_name;
        const recipient = send.recipient || 'unknown';
        const iron = send.iron || 0;
        const wood = send.wood || 0;

        // Initialize player entry if needed
        if (!playerResources[player]) {
            playerResources[player] = {
                totalIron: 0,
                totalWood: 0,
                recipients: {}
            };
        }

        // Initialize recipient entry if needed
        if (!playerResources[player].recipients[recipient]) {
            playerResources[player].recipients[recipient] = {
                iron: 0,
                wood: 0
            };
        }

        // Add to totals
        playerResources[player].totalIron += iron;
        playerResources[player].totalWood += wood;
        playerResources[player].recipients[recipient].iron += iron;
        playerResources[player].recipients[recipient].wood += wood;
    }

    // Convert to sorted array format
    const sortedLeaderboard = Object.entries(playerResources)
        .map(([player, data]) => ({
            player,
            totalIron: data.totalIron,
            totalWood: data.totalWood,
            totalResources: data.totalIron + data.totalWood,
            recipients: data.recipients
        }))
        .sort((a, b) => b.totalResources - a.totalResources);


    // Sort recipients for each player by total resources sent to them
    sortedLeaderboard.forEach(entry => {
        entry.recipients = Object.fromEntries(
            Object.entries(entry.recipients)
                .sort(([, a], [, b]) => (b.iron + b.wood) - (a.iron + a.wood))
        );
    });
    // Cache the results
    await cacheReport(gameId, ReportType.RESOURCES_SENT, sortedLeaderboard);

    return sortedLeaderboard;
}

export async function generateResourcesReceivedLeaderboard(gameId: string) {
    // Check cache first
    const cachedData = await getCachedReport(gameId, ReportType.RESOURCES_RECEIVED);
    if (cachedData) {
        return cachedData;
    }

    const allResourceSends = await ActivitiesModel.findAll({
        attributes: ['player_name', 'iron', 'wood', 'recipient', 'player_faction'],
        where: {
            game_id: gameId,
            type: 'resources_sent'
        },
        order: ['recipient']
    });

    // Aggregate resources received by recipient and sender
    const recipientResources: { [recipient: string]: { totalIron: number, totalWood: number, senders: { [sender: string]: { iron: number, wood: number } } } } = {};

    for (const send of allResourceSends) {
        const sender = send.player_name;
        const recipient = send.recipient || 'unknown';
        const iron = send.iron || 0;
        const wood = send.wood || 0;
        const senderFaction = send.player_faction;

        // Skip if recipient is unknown or empty
        if (!recipient || recipient === 'unknown') {
            continue;
        }

        // Handle special case where recipient is "all" - use sender's faction color
        const displayRecipient = recipient === 'all' ? `all (${senderFaction || 'unknown'})` : recipient;

        // Initialize recipient entry if needed
        if (!recipientResources[displayRecipient]) {
            recipientResources[displayRecipient] = {
                totalIron: 0,
                totalWood: 0,
                senders: {}
            };
        }

        // Initialize sender entry if needed
        if (!recipientResources[displayRecipient].senders[sender]) {
            recipientResources[displayRecipient].senders[sender] = {
                iron: 0,
                wood: 0
            };
        }

        // Add to totals
        recipientResources[displayRecipient].totalIron += iron;
        recipientResources[displayRecipient].totalWood += wood;
        recipientResources[displayRecipient].senders[sender].iron += iron;
        recipientResources[displayRecipient].senders[sender].wood += wood;
    }

    // Convert to sorted array format
    const sortedLeaderboard = Object.entries(recipientResources)
        .map(([recipient, data]) => ({
            recipient,
            totalIron: data.totalIron,
            totalWood: data.totalWood,
            totalResources: data.totalIron + data.totalWood,
            senders: data.senders
        }))
        .sort((a, b) => b.totalResources - a.totalResources);

    // Sort senders for each recipient by total resources received from them
    sortedLeaderboard.forEach(entry => {
        entry.senders = Object.fromEntries(
            Object.entries(entry.senders)
                .sort(([, a], [, b]) => (b.iron + b.wood) - (a.iron + a.wood))
        );
    });

    // Cache the results
    await cacheReport(gameId, ReportType.RESOURCES_RECEIVED, sortedLeaderboard);

    return sortedLeaderboard;
}

export async function generateBuildingKillsLeaderboard(gameId: string) {
    // Check cache first
    const cachedData = await getCachedReport(gameId, ReportType.BUILDING_KILLS);
    if (cachedData) {
        return cachedData;
    }

    const killData = await sequelize.query(`
        SELECT x.x, x.y, x.player_faction, x.support_type as building,
            SUM(IFNULL(data->>'$.soldiers_destroyed', data->>'$.fortification_removed')) kills
        FROM activities x
        WHERE game_id = :gameId and type = 'map_building_activated'
        GROUP BY x, y, building, player_faction
        ORDER BY kills desc
        `, {
            replacements: { gameId },
            type: QueryTypes.SELECT
        });

    // Cache the results
    await cacheReport(gameId, ReportType.BUILDING_KILLS, killData);

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

export async function generateBuildingPillageLeaderboard(gameId: string) {
    const cachedData = await getCachedReport(gameId, ReportType.BUILDING_PILLAGED);
    if (cachedData) {
        return cachedData;
    }

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

    await cacheReport(gameId, ReportType.BUILDING_PILLAGED, data);

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

export async function generateBuildingPlacementLeaderboard(gameId: string) {
    const cachedData = await getCachedReport(gameId, ReportType.BUILDING_PLACEMENT);
    if (cachedData) {
        return cachedData;
    }

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

    await cacheReport(gameId, ReportType.BUILDING_PLACEMENT, data);

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

export async function generateBuildingSupplyLeaderboard(gameId: string) {
    const cachedData = await getCachedReport(gameId, ReportType.BUILDING_SUPPLY);
    if (cachedData) {
        return cachedData;
    }

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

    await cacheReport(gameId, ReportType.BUILDING_SUPPLY, data);

    return data;
}

