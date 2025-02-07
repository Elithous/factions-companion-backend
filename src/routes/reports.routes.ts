import express, { Request, Response } from 'express';
import { getSoldierStatsByFaction, getAvailableGames, getSoliderStatsByTile } from '../controllers/reports.controller';

const router = express.Router();

router.get('/soldiers/faction', getSoldierStatsByFaction);
router.get('/soldiers/tile', getSoliderStatsByTile);

router.get('/games', getAvailableGames);

export default router;