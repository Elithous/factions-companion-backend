import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route handler so a rejected promise becomes a normal Express
 * error instead of an unhandled rejection.
 *
 * Every handler used to carry its own try/catch with a bespoke message; this
 * plus `errorHandler` replaces all of them.
 */
export function asyncHandler(
    handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
    return (req, res, next) => {
        handler(req, res, next).catch(next);
    };
}
