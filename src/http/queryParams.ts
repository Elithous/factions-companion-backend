import { InferAttributes, Op, WhereOperators, WhereOptions } from 'sequelize';
import { Request } from 'express';

import { ActivitiesModel } from '../models/activities/activities.model';
import { badRequest } from './errors';

type ActivityFilter = WhereOptions<InferAttributes<ActivitiesModel>>;

/** Reads a query param that the endpoint cannot run without. */
export function requireQuery(req: Request, name: string): string {
    const value = req.query[name];
    if (typeof value !== 'string' || !value) {
        throw badRequest(`Missing required parameter: ${name}`);
    }
    return value;
}

export function optionalQuery(req: Request, name: string): string | undefined {
    const value = req.query[name];
    return typeof value === 'string' && value ? value : undefined;
}

/** Reads an optional whole-number query param, ignoring anything unparseable. */
export function optionalIntQuery(req: Request, name: string): number | undefined {
    const raw = optionalQuery(req, name);
    if (raw === undefined) return undefined;

    const value = parseInt(raw, 10);
    return isNaN(value) ? undefined : value;
}

/** Reads a whole-number query param the endpoint cannot run without. */
export function requireIntQuery(req: Request, name: string): number {
    const value = parseInt(requireQuery(req, name), 10);
    if (isNaN(value)) {
        throw badRequest(`Parameter ${name} must be a number`);
    }
    return value;
}

/** Parses a comma-separated query param into a list. Empty entries are dropped. */
export function listQuery(req: Request, name: string): string[] {
    const raw = req.query[name];
    const values = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(',') : [];
    return values.map(value => value.trim()).filter(Boolean);
}

/** Parses a comma-separated query param into finite numbers. */
export function numberListQuery(req: Request, name: string): number[] {
    return listQuery(req, name)
        .map(value => parseFloat(value))
        .filter(value => !isNaN(value));
}

/**
 * Builds the `where` clause shared by the soldier reports.
 *
 * `includeTile` is off for the by-tile report, which aggregates across all
 * tiles and so must not be narrowed to one.
 */
export function buildActivityFilter(req: Request, options: { includeTile?: boolean } = {}): ActivityFilter {
    const filter: ActivityFilter = {
        game_id: requireQuery(req, 'gameId'),
    };

    const playerId = optionalIntQuery(req, 'playerId');
    if (playerId !== undefined) filter.player_id = playerId;

    const fromFaction = optionalQuery(req, 'fromFaction');
    if (fromFaction) filter.player_faction = fromFaction;

    const toFaction = optionalQuery(req, 'toFaction');
    if (toFaction) filter.previous_faction = toFaction;

    if (options.includeTile) {
        const tileX = optionalQuery(req, 'tileX');
        const tileY = optionalQuery(req, 'tileY');
        if (tileX && tileY) {
            filter.x = tileX;
            filter.y = tileY;
        }
    }

    const createdAt: WhereOperators<number> = {};
    const dateStart = parseFloat(optionalQuery(req, 'dateStart') ?? '');
    const dateEnd = parseFloat(optionalQuery(req, 'dateEnd') ?? '');
    if (dateStart) createdAt[Op.gte] = dateStart;
    if (dateEnd) createdAt[Op.lte] = dateEnd;
    if (createdAt[Op.gte] || createdAt[Op.lte]) {
        filter.created_at = createdAt;
    }

    return filter;
}
