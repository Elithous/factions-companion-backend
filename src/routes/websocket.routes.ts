import express, { Request, Response } from 'express';

import { unsetWatchGame, setWatchGame } from '../controllers/factionsWebsocket.controller';
import { processWorldMessages } from '../services/factionsWebsocket.service';

// converts boolean strings to booleans
function parseBoolean(string) {
    return string === "true" ? true : string === "false" ? false : undefined;
};

const router = express.Router();

router.post('/watch/:gameId', async (req: Request<{gameId: string }>, res: Response) => {
    try {
        const gameId = req.params.gameId;
        if (!gameId) {
            throw new Error('Game ID not supplied.');
        }
        // TODO: Add validation and check if we are already watching this game.
        await setWatchGame(gameId);

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
        await unsetWatchGame(gameId);

        res.status(204).send();
    } catch (error) {
        res.status(400).json({ message: `Error removing game watch: ${error}`});
    }
});

router.post('/parse', async (req: Request<{}, { reprocess: string}>, res: Response) => {
    try {
        const reprocess = parseBoolean(req.query.reprocess)
        await processWorldMessages(reprocess);

        res.status(204).send();
    } catch (error) {
        res.status(400).json({ message: `Error processing messages: ${error}`});
    }
});

export default router;