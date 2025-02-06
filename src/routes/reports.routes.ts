import express, { Request, Response } from 'express';
import { getSoldierStats, getAvailableGames } from '../controllers/reports.controller';

const router = express.Router();

router.get('/soldiers', getSoldierStats);

router.get('/games', getAvailableGames);

export default router;