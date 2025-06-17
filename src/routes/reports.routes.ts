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
    getResourcesSentLeaderboard,
    getResourcesReceivedLeaderboard
} from '../controllers/reports.controller';

const router = express.Router();

// Player-related routes
router.get('/player/mvp', getPlayerMvpLeaderboard);
router.get('/player/apm', getPlayerApmLeaderboard);
router.get('/player/actions', getPlayerActionCounts);
router.get('/player/active', getActivePlayers);

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

export default router;