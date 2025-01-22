import express, { Request, Response } from 'express';
import { getSoldierStats } from '../controllers/reports.controller';

const router = express.Router();

router.get('/soldiers', async (req: Request, res: Response) => {
    try {
        const stats = await getSoldierStats();

        res.status(200).send(stats);
    } catch (error) {
        res.status(400).json({ message: `Error setting up game watch: ${error}`});
    }
});

export default router;