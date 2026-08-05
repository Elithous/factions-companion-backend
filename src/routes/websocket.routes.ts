import express, { Request, Response } from 'express';

import { asyncHandler } from '../http/asyncHandler';
import { processWorldMessages } from '../services/factionsWebsocket.service';
import { setWatchGame, unsetWatchGame } from '../workers/gameWatcher';

/** Query strings are always strings; anything other than "true"/"false" is unset. */
function parseBoolean(value: unknown): boolean | undefined {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
}

const router = express.Router();

// TODO: Add validation and check whether we are already watching this game.
router.post('/watch/:gameId', asyncHandler(async (req: Request<{ gameId: string }>, res: Response) => {
    await setWatchGame(req.params.gameId);
    res.status(204).send();
}));

router.delete('/watch/:gameId', asyncHandler(async (req: Request<{ gameId: string }>, res: Response) => {
    await unsetWatchGame(req.params.gameId);
    res.status(204).send();
}));

/** Re-parses stored raw messages. `?reprocess=true` wipes and rebuilds everything. */
router.post('/parse', asyncHandler(async (req: Request, res: Response) => {
    await processWorldMessages(parseBoolean(req.query.reprocess));
    res.status(204).send();
}));

export default router;
