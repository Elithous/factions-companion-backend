import { Request, Response } from 'express';

import { asyncHandler } from '../http/asyncHandler';
import { buildActivityFilter, optionalQuery } from '../http/queryParams';
import {
    generateSoldierStatsByFaction,
    generateUnitStatsByTile,
    UnitType,
} from '../services/reports/soldierReport.service';

/** Anything unrecognised falls back to soldiers rather than returning nothing. */
const toUnitType = (value: string | undefined): UnitType =>
    value === 'workers' ? 'workers' : 'soldiers';

export const getSoldierStatsByFaction = asyncHandler(async (req: Request, res: Response) => {
    const filter = buildActivityFilter(req, { includeTile: true });
    res.json(await generateSoldierStatsByFaction(filter));
});

export const getUnitStatsByTile = asyncHandler(async (req: Request, res: Response) => {
    // No tile narrowing here — this report aggregates across every tile.
    const filter = buildActivityFilter(req);
    const unitType = toUnitType(optionalQuery(req, 'unitType'));
    res.json(await generateUnitStatsByTile(filter, unitType));
});
