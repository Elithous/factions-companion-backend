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
    getPlayerActionCounts
} from '../controllers/reports.controller';

const router = express.Router();

// Player-related routes
router.get('/player/mvp', getPlayerMvpLeaderboard);
router.get('/player/apm', getPlayerApmLeaderboard);
router.get('/player/actions', getPlayerActionCounts);

// Soldier-related routes
router.get('/soldiers/faction', getSoldierStatsByFaction);
router.get('/soldiers/tile', getSoliderStatsByTile);

// Game-related routes
router.get('/games', getAvailableGames);
router.get('/games/timespan', getGameTimespan);
router.get('/games/config', getGameConfig);

// Other routes
router.get('/tile', getTileLeaderboard);
router.get('/activities/all', allActivities);

export default router;