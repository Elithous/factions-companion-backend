import { Request, Response } from 'express';

import { asyncHandler } from '../http/asyncHandler';
import { badRequest } from '../http/errors';
import { optionalIntQuery, optionalQuery, requireQuery } from '../http/queryParams';
import {
    generateTileDetail,
    TileDetailFilter,
} from '../services/reports/tileDetailReport.service';

/** Parses a query param that must be a whole number when present. */
function requireInt(req: Request, name: string): number {
    const value = parseInt(requireQuery(req, name), 10);
    if (isNaN(value)) {
        throw badRequest(`Parameter ${name} must be a number`);
    }
    return value;
}

function optionalFloat(req: Request, name: string): number | undefined {
    const raw = optionalQuery(req, name);
    if (raw === undefined) return undefined;

    const value = parseFloat(raw);
    return isNaN(value) ? undefined : value;
}

/** Full drill-down for one tile: support, ownership, players, buildings, workers. */
export const getTileDetail = asyncHandler(async (req: Request, res: Response) => {
    const gameId = requireQuery(req, 'gameId');
    const x = requireInt(req, 'tileX');
    const y = requireInt(req, 'tileY');

    const filter: TileDetailFilter = {
        playerId: optionalIntQuery(req, 'playerId'),
        fromFaction: optionalQuery(req, 'fromFaction'),
        toFaction: optionalQuery(req, 'toFaction'),
        dateStart: optionalFloat(req, 'dateStart'),
        dateEnd: optionalFloat(req, 'dateEnd'),
    };

    res.json(await generateTileDetail(gameId, x, y, filter));
});
