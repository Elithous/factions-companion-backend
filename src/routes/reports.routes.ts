import express from 'express';

import { requireAdmin } from '../http/adminAuth';
import {
    getActivePlayers,
    getAllPlayers,
    getAvailableGames,
    getBuildingCatalogue,
    getGameConfig,
    getGameSummary,
    getGameTimespan,
    getPlayerIdentity,
    getProjectTrees,
    importProjectTree,
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
    getPlayerProfileById,
    getPlayerStatsByPlayerId,
} from '../controllers/player.controller';
import {
    getSoldierStatsByFaction,
    getUnitStatsByTile,
    getUnitTimeline,
} from '../controllers/units.controller';
import { getTileDetail } from '../controllers/tile.controller';

const router = express.Router();

// Players
router.get('/player/mvp', getPlayerMvpLeaderboard);
router.get('/player/apm', getPlayerApmLeaderboard);
router.get('/player/actions', getPlayerActionCounts);
router.get('/player/active', getActivePlayers);
router.get('/player/all', getAllPlayers);
router.get('/player/identity/:playerId', getPlayerIdentity);
router.get('/player/loot', getPlayerLootLeaderboard);
router.get('/player/stats/:playerId', getPlayerStatsByPlayerId);
router.get('/player/profile/:playerId', getPlayerProfileById);

// Soldiers
router.get('/soldiers/faction', getSoldierStatsByFaction);
router.get('/units/tile', getUnitStatsByTile);
router.get('/units/timeline', getUnitTimeline);

// Games
router.get('/games', getAvailableGames);
router.get('/games/timespan', getGameTimespan);
router.get('/games/summary', getGameSummary);
router.get('/games/config', getGameConfig);
router.get('/games/buildings', getBuildingCatalogue);
router.get('/games/projects', getProjectTrees);
// Overwrites stored definitions, so it's admin-only like the /websocket routes.
router.post('/games/projects', requireAdmin, importProjectTree);

// Buildings
router.get('/buildings/kills', getBuildingKillLeaderboard);
router.get('/buildings/pillaged', getBuildingPillageLeaderboard);
router.get('/buildings/placement', getBuildingPlacementLeaderboard);
router.get('/buildings/supply', getBuildingSupplyLeaderboard);

// Resources
router.get('/resources/sent', getResourcesSentLeaderboard);
router.get('/resources/received', getResourcesReceivedLeaderboard);

// Tiles
router.get('/tile', getTileLeaderboard);
router.get('/tile/detail', getTileDetail);

// Misc
router.get('/loot/actions', getLootActions);
router.get('/activities/all', allActivities);

export default router;
