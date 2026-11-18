import { createHash, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

import { adminConfig } from '../config';
import { HttpError } from './errors';

/** Hashing first gives both sides the same length, which timingSafeEqual needs. */
function digest(value: string) {
    return createHash('sha256').update(value).digest();
}

/** Accepts `Authorization: Bearer <key>` or `X-Admin-Key: <key>`. */
function readPresentedKey(req: Request): string | undefined {
    const auth = req.header('authorization');
    if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();

    return req.header('x-admin-key')?.trim() || undefined;
}

/**
 * Guards routes that change what we collect or rewrite stored data.
 *
 * If ADMIN_API_KEY is not configured, the routes stay closed instead of
 * running unprotected.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
    const expected = adminConfig.ADMIN_API_KEY;
    if (!expected) {
        // 403, not 5xx: this is a deliberate refusal, and a 5xx would log a
        // stack trace for every bot that probes the route.
        return next(new HttpError(403, 'Admin routes are disabled: ADMIN_API_KEY is not set.'));
    }

    const presented = readPresentedKey(req);
    if (!presented || !timingSafeEqual(digest(presented), digest(expected))) {
        return next(new HttpError(401, 'Missing or invalid admin key.'));
    }

    next();
}

export function warnIfAdminKeyMissing() {
    if (!adminConfig.ADMIN_API_KEY) {
        console.warn('[server]: ADMIN_API_KEY is not set, so admin routes (/websocket/*) are disabled.');
    }
}
