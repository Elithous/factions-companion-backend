import { Request, Response } from 'express';

import { asyncHandler } from '../http/asyncHandler';
import { badRequest } from '../http/errors';
import { listQuery, numberListQuery, optionalQuery, requireQuery } from '../http/queryParams';
import { getPlayerProfile } from '../services/reports/playerProfile.service';
import {
    generatePlayerActionCounts,
    generatePlayerStats,
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

/**
 * A player's career profile. `refresh=true` rebuilds it rather than serving the
 * cached copy — that's what the Update button calls.
 */
export const getPlayerProfileById = asyncHandler(async (req: Request, res: Response) => {
    const playerId = parseInt(req.params.playerId, 10);

    if (isNaN(playerId)) {
        throw badRequest('Parameter playerId must be a number');
    }

    const refresh = optionalQuery(req, 'refresh') === 'true';
    res.json(await getPlayerProfile(playerId, { refresh }));
});

export const getPlayerStatsByPlayerId = asyncHandler(async (req: Request, res: Response) => {
    const gameId = requireQuery(req, 'gameId');
    const playerId = parseInt(req.params.playerId, 10);

    if (isNaN(playerId)) {
        throw badRequest('Parameter playerId must be a number');
    }

    res.json(await generatePlayerStats(gameId, playerId));
});
