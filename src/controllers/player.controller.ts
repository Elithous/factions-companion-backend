import { Request, Response } from 'express';

import { asyncHandler } from '../http/asyncHandler';
import { badRequest } from '../http/errors';
import { listQuery, numberListQuery, requireQuery } from '../http/queryParams';
import {
    generatePlayerActionCounts,
    generatePlayerStatsByPlayerName,
} from '../services/reports/activityReport.service';
import {
    generateApmLeaderboard,
    generatePlayerLootLeaderboard,
    generatePlayerMvpLeaderboard,
} from '../services/reports/playerReport.service';

/** APM is measured over rolling windows; default to a single 60 second window. */
const DEFAULT_APM_TIMESPANS = [60];

export const getPlayerMvpLeaderboard = asyncHandler(async (req: Request, res: Response) => {
    res.json(await generatePlayerMvpLeaderboard(requireQuery(req, 'gameId')));
});

export const getPlayerLootLeaderboard = asyncHandler(async (req: Request, res: Response) => {
    res.json(await generatePlayerLootLeaderboard(requireQuery(req, 'gameId')));
});

export const getPlayerApmLeaderboard = asyncHandler(async (req: Request, res: Response) => {
    const gameId = requireQuery(req, 'gameId');

    const requested = numberListQuery(req, 'timespan');
    const timespans = (requested.length ? requested : DEFAULT_APM_TIMESPANS).sort((a, b) => a - b);

    const results = await Promise.all(
        timespans.map(async timespan => ({
            timespan,
            stats: await generateApmLeaderboard(gameId, timespan),
        }))
    );

    res.json(results);
});

export const getPlayerActionCounts = asyncHandler(async (req: Request, res: Response) => {
    const gameId = requireQuery(req, 'gameId');
    const types = listQuery(req, 'types');

    if (!types.length) {
        throw badRequest('Missing required parameter: types');
    }

    res.json(await generatePlayerActionCounts(gameId, types));
});

export const getPlayerStatsByPlayerName = asyncHandler(async (req: Request, res: Response) => {
    const gameId = requireQuery(req, 'gameId');
    const { playerName } = req.params;

    if (!playerName) {
        throw badRequest('Missing required parameter: playerName');
    }

    res.json(await generatePlayerStatsByPlayerName(gameId, playerName));
});
