import express from 'express';
import {
    getSoldierStatsByFaction,
    getAvailableGames,
    getSoliderStatsByTile,
    getPlayerMvpLeaderboard,
    getGameTimespan,
    getGameConfig,
    allActivities,
    getPlayerApmLeaderboard,
    getTileLeaderboard,
    getPlayerActionCounts,
    getActivePlayers,
    getPlayerStatsByPlayerName,
    getResourcesSentLeaderboard,
    getResourcesReceivedLeaderboard,
    getBuildingKillLeaderboard,
    getBuildingPillageLeaderboard,
    getBuildingPlacementLeaderboard,
    getBuildingSupplyLeaderboard,
    getPlayerLootLeaderboard,
} from '../controllers/reports.controller';

const router = express.Router();

// Player-related routes
router.get('/player/mvp', getPlayerMvpLeaderboard);
router.get('/player/apm', getPlayerApmLeaderboard);
router.get('/player/actions', getPlayerActionCounts);
router.get('/player/active', getActivePlayers);
router.get('/player/stats/:playerName', getPlayerStatsByPlayerName);
router.get('/player/loot', getPlayerLootLeaderboard);

// Soldier-related routes
router.get('/soldiers/faction', getSoldierStatsByFaction);
router.get('/soldiers/tile', getSoliderStatsByTile);

// Game-related routes
router.get('/games', getAvailableGames);
router.get('/games/timespan', getGameTimespan);
router.get('/games/config', getGameConfig);

// Other routes
router.get('/tile', getTileLeaderboard);
router.get('/resources/sent', getResourcesSentLeaderboard);
router.get('/resources/received', getResourcesReceivedLeaderboard);
router.get('/activities/all', allActivities);
router.get('/buildings/kills', getBuildingKillLeaderboard);
router.get('/buildings/pillaged', getBuildingPillageLeaderboard);
router.get('/buildings/placement', getBuildingPlacementLeaderboard);
router.get('/buildings/supply', getBuildingSupplyLeaderboard);

export default router;