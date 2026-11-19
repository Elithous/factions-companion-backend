import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import { serverConfig } from '../config';

const ONE_MINUTE = 60 * 1000;

/**
 * Turns TRUST_PROXY into Express's `trust proxy` setting.
 *
 * A hop count ("1") or an address list ("loopback", "10.0.0.0/8") is passed
 * through. "true" is refused: it trusts any X-Forwarded-For a client sends,
 * so every client could pick its own IP.
 */
export function parseTrustProxy(value = serverConfig.TRUST_PROXY): number | string | false {
    const trimmed = value?.trim();
    if (!trimmed || trimmed === 'false') return false;
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);

    if (trimmed === 'true') {
        console.warn('[server]: TRUST_PROXY=true would let clients spoof their IP. Ignoring it; use a hop count such as 1.');
        return false;
    }

    return trimmed;
}

function limiter(limit: number) {
    return rateLimit({
        windowMs: ONE_MINUTE,
        limit,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { message: 'Too many requests. Please slow down and try again shortly.' },
    });
}

/** REPORT_RATE_LIMIT value that turns the report limit off. */
const RATE_LIMIT_DISABLED = -1;

const noLimit = (_req: Request, _res: Response, next: NextFunction) => next();

/**
 * Public report reads. Generous enough for someone clicking around quickly.
 *
 * Off when REPORT_RATE_LIMIT is -1: behind a proxy that hides visitors' IPs
 * (such as the Vercel rewrite in front of Docker Desktop), every visitor would
 * otherwise share one limit.
 */
export const reportRateLimit = serverConfig.REPORT_RATE_LIMIT === RATE_LIMIT_DISABLED
    ? noLimit
    : limiter(serverConfig.REPORT_RATE_LIMIT);

export function warnIfReportRateLimitDisabled() {
    if (serverConfig.REPORT_RATE_LIMIT === RATE_LIMIT_DISABLED) {
        console.warn('[server]: REPORT_RATE_LIMIT is -1, so report routes are not rate-limited.');
    }
}

/** Admin routes. Low, so that guessing the key isn't practical. */
export const adminRateLimit = limiter(20);

/**
 * Lets browsers (and a CDN, if one is added later) reuse report responses
 * briefly. The worker only parses new data every few minutes, so 30s costs
 * nothing in freshness. Errors override this with no-store.
 */
export function shortPublicCache(req: Request, res: Response, next: NextFunction) {
    if (req.method === 'GET') {
        res.set('Cache-Control', 'public, max-age=30');
    }
    next();
}
