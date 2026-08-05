import express from 'express';

import {
    getActivePlayers,
    getAvailableGames,
    getGameConfig,
    getGameTimespan,
} from '../controllers/game.controller';
import {
    allActivities,
    getBuildingKillLeaderboard,
    getBuildingPillageLeaderboard,
    getBuildingPlacementLeaderboard,
    getBuildingSupplyLeaderboard,
    getLootActions,
    getResourcesReceivedLeaderboard,
    getResourcesSentLeaderboard,
    getTileLeaderboard,
} from '../controllers/leaderboard.controller';
import {
    getPlayerActionCounts,
    getPlayerApmLeaderboard,
    getPlayerLootLeaderboard,
    getPlayerMvpLeaderboard,
    getPlayerStatsByPlayerName,
} from '../controllers/player.controller';
import {
    getSoldierStatsByFaction,
    getSoldierStatsByTile,
} from '../controllers/soldier.controller';

const router = express.Router();

// Players
router.get('/player/mvp', getPlayerMvpLeaderboard);
router.get('/player/apm', getPlayerApmLeaderboard);
router.get('/player/actions', getPlayerActionCounts);
router.get('/player/active', getActivePlayers);
router.get('/player/loot', getPlayerLootLeaderboard);
router.get('/player/stats/:playerName', getPlayerStatsByPlayerName);

// Soldiers
router.get('/soldiers/faction', getSoldierStatsByFaction);
router.get('/soldiers/tile', getSoldierStatsByTile);

// Games
router.get('/games', getAvailableGames);
router.get('/games/timespan', getGameTimespan);
router.get('/games/config', getGameConfig);

// Buildings
router.get('/buildings/kills', getBuildingKillLeaderboard);
router.get('/buildings/pillaged', getBuildingPillageLeaderboard);
router.get('/buildings/placement', getBuildingPlacementLeaderboard);
router.get('/buildings/supply', getBuildingSupplyLeaderboard);

// Resources
router.get('/resources/sent', getResourcesSentLeaderboard);
router.get('/resources/received', getResourcesReceivedLeaderboard);

// Misc
router.get('/tile', getTileLeaderboard);
router.get('/loot/actions', getLootActions);
router.get('/activities/all', allActivities);

export default router;
