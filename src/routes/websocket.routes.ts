import express, { Request, Response } from 'express';

import { watchGame } from '../controllers/factionsWebsocket.controller';

const router = express.Router();

router.post('/watch/:gameId', async (req: Request<{gameId: string }>, res: Response) => {
    try {
        const gameId = req.params.gameId;
        if (!gameId) {
            throw new Error('Game ID not supplied.');
        }
        // TODO: Add validation and check if we are already watching this game.
        await watchGame(gameId);

        res.status(204).send();
    } catch (error) {
        res.status(400).json({ message: `Error setting up game watch: ${error}`});
    }
});

router.delete('/watch/:gameId', async (req: Request<{gameId: string }>, res: Response) => {
    try {
        const gameId = req.params.gameId;
        if (!gameId) {
            throw new Error('Game ID not supplied.');
        }
        // TODO: Add validation and check if we are already watching this game.
        await watchGame(gameId);

        res.status(204).send();
    } catch (error) {
        res.status(400).json({ message: `Error removing game watch: ${error}`});
    }
});

export default router;