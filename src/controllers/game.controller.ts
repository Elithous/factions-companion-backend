import { Request, Response } from 'express';

import { asyncHandler } from '../http/asyncHandler';
import { requireQuery } from '../http/queryParams';
import { getAllActivePlayers, getAvailableGameIds, getConfig, getTimespan } from '../services/reports/gameReport.service';

export const getAvailableGames = asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getAvailableGameIds());
});

export const getGameTimespan = asyncHandler(async (req: Request, res: Response) => {
    res.json(await getTimespan(requireQuery(req, 'gameId')));
});

export const getGameConfig = asyncHandler(async (req: Request, res: Response) => {
    res.json(await getConfig(requireQuery(req, 'gameId')));
});

export const getActivePlayers = asyncHandler(async (req: Request, res: Response) => {
    res.json(await getAllActivePlayers(requireQuery(req, 'gameId')));
});
