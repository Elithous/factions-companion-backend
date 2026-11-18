import express, { Request, Response } from 'express';

import { requireAdmin } from '../http/adminAuth';
import { asyncHandler } from '../http/asyncHandler';
import { badRequest } from '../http/errors';
import { processWorldMessages } from '../services/factionsWebsocket.service';
import { addToWatchList, getWatchList, removeFromWatchList } from '../services/settings.service';

/** Query strings are always strings; anything other than "true"/"false" is unset. */
function parseBoolean(value: unknown): boolean | undefined {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
}

function parseGameId(value: string): string {
    if (!/^\d+$/.test(value)) throw badRequest(`Invalid game id: ${value}`);
    return value;
}

const router = express.Router();

// Every route here changes what we collect or rewrites stored data.
router.use(requireAdmin);

router.get('/watch', asyncHandler(async (_req: Request, res: Response) => {
    res.json({ watchList: await getWatchList() });
}));

/**
 * These only edit the stored watch list. The worker picks up the change on
 * its next sync (within ~30s), hence 202 rather than 204.
 */
router.post('/watch/:gameId', asyncHandler(async (req: Request<{ gameId: string }>, res: Response) => {
    const added = await addToWatchList(parseGameId(req.params.gameId));
    res.status(202).json({ changed: added });
}));

router.delete('/watch/:gameId', asyncHandler(async (req: Request<{ gameId: string }>, res: Response) => {
    const removed = await removeFromWatchList(parseGameId(req.params.gameId));
    res.status(202).json({ changed: removed });
}));

/** Re-parses stored raw messages. `?reprocess=true` wipes and rebuilds everything. */
router.post('/parse', asyncHandler(async (req: Request, res: Response) => {
    await processWorldMessages(parseBoolean(req.query.reprocess));
    res.status(204).send();
}));

export default router;
