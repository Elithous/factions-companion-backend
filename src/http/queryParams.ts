import { InferAttributes, Op, WhereAttributeHashValue, WhereOptions } from 'sequelize';
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

    const playerName = optionalQuery(req, 'playerName');
    if (playerName) filter.player_name = playerName;

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

    const createdAt: WhereAttributeHashValue<number> = {};
    const dateStart = parseFloat(optionalQuery(req, 'dateStart') ?? '');
    const dateEnd = parseFloat(optionalQuery(req, 'dateEnd') ?? '');
    if (dateStart) createdAt[Op.gte] = dateStart;
    if (dateEnd) createdAt[Op.lte] = dateEnd;
    if (createdAt[Op.gte] || createdAt[Op.lte]) {
        filter.created_at = createdAt;
    }

    return filter;
}
