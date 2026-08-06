import { Request, Response } from 'express';

import { asyncHandler } from '../http/asyncHandler';
import { optionalIntQuery, optionalQuery, requireQuery } from '../http/queryParams';
import {
    getAllActivePlayers,
    getAvailableGames as listAvailableGames,
    getConfig,
    getTimespan,
} from '../services/reports/gameReport.service';
import { generateBuildingCatalogue } from '../services/reports/buildingCatalogue.service';
import { getPlayerIndex } from '../services/reports/playerIdentity.service';
import {
    getProjectDefinitions,
    storeProjectDefinition,
} from '../services/reports/projectDefinition.service';
import { GAME_CONFIG_TYPES, GameConfigKind } from '../models/config.model';
import { badRequest } from '../http/errors';

/** `playerId` narrows the list to games that player took part in. */
export const getAvailableGames = asyncHandler(async (req: Request, res: Response) => {
    res.json(await listAvailableGames(optionalIntQuery(req, 'playerId')));
});

/**
 * Raw project-tree definitions for a game: talents, team projects and personal
 * projects. Served unshaped so the payloads can be inspected before they're
 * normalised into a common node type.
 */
export const getProjectTrees = asyncHandler(async (req: Request, res: Response) => {
    res.json(await getProjectDefinitions(requireQuery(req, 'gameId')));
});

/**
 * Stores a project-tree definition for a game.
 *
 * The upstream endpoints stop answering once a game completes, so a finished
 * game's trees can only be filled in from a copy taken while it was live.
 * Body: the raw payload. Query: `gameId` and `type`.
 */
export const importProjectTree = asyncHandler(async (req: Request, res: Response) => {
    const gameId = requireQuery(req, 'gameId');
    const type = requireQuery(req, 'type') as GameConfigKind;

    if (!(GAME_CONFIG_TYPES as readonly string[]).includes(type)) {
        throw badRequest(`type must be one of: ${GAME_CONFIG_TYPES.join(', ')}`);
    }

    if (!req.body || (Array.isArray(req.body) && !req.body.length)) {
        throw badRequest('Request body must be the definition payload');
    }

    await storeProjectDefinition(gameId, type, req.body);
    res.json({ stored: true, gameId, type });
});

/** Every player across every game, for picking a player before a game. */
export const getAllPlayers = asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getPlayerIndex());
});

export const getGameTimespan = asyncHandler(async (req: Request, res: Response) => {
    res.json(await getTimespan(requireQuery(req, 'gameId')));
});

export const getGameConfig = asyncHandler(async (req: Request, res: Response) => {
    res.json(await getConfig(requireQuery(req, 'gameId')));
});

/**
 * Building catalogue for a game. `gameId` is optional — omitted, it falls back
 * to the newest game, so the calculator works without a selection.
 */
export const getBuildingCatalogue = asyncHandler(async (req: Request, res: Response) => {
    res.json(await generateBuildingCatalogue(optionalQuery(req, 'gameId')));
});

export const getActivePlayers = asyncHandler(async (req: Request, res: Response) => {
    res.json(await getAllActivePlayers(requireQuery(req, 'gameId')));
});
