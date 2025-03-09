import express from 'express';
import { getSoldierStatsByFaction, getAvailableGames, getSoliderStatsByTile, getPlayerMvpLeaderboard, getGameTimespan, getGameConfig, allActivities } from '../controllers/reports.controller';

const router = express.Router();

router.get('/soldiers/faction', getSoldierStatsByFaction);
router.get('/soldiers/tile', getSoliderStatsByTile);

router.get('/leaderboard/mvp', getPlayerMvpLeaderboard);

router.get('/games', getAvailableGames);
router.get('/games/timespan', getGameTimespan);
router.get('/games/config', getGameConfig);

router.get('/activities/all', allActivities);

export default router;