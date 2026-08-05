import { Request, Response } from 'express';

import { asyncHandler } from '../http/asyncHandler';
import { buildActivityFilter } from '../http/queryParams';
import {
    generateSoldierStatsByFaction,
    generateSoldierStatsByTile,
} from '../services/reports/soldierReport.service';

export const getSoldierStatsByFaction = asyncHandler(async (req: Request, res: Response) => {
    const filter = buildActivityFilter(req, { includeTile: true });
    res.json(await generateSoldierStatsByFaction(filter));
});

export const getSoldierStatsByTile = asyncHandler(async (req: Request, res: Response) => {
    // No tile narrowing here — this report aggregates across every tile.
    const filter = buildActivityFilter(req);
    res.json(await generateSoldierStatsByTile(filter));
});
