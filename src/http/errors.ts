import { NextFunction, Request, Response } from 'express';

/** An error carrying the HTTP status it should be reported with. */
export class HttpError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
        this.name = 'HttpError';
    }
}

export function badRequest(message: string) {
    return new HttpError(400, message);
}

/**
 * Terminal error handler. Must be registered after all routes.
 *
 * Only errors that say what status they want get one; anything else is a fault
 * on our side and reports 500. It used to blanket-default to 400, which made a
 * failing query look like a malformed request and hid the real cause.
 */
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);

    if (status >= 500) {
        // The route is included because the message alone rarely identifies it.
        console.error(`[${req.method} ${req.originalUrl}] ${message}`);
        console.error(error);
    }

    res.status(status).json({
        message,
        // Named so a 500 can be traced to a handler without reading the logs.
        path: req.originalUrl,
    });
}
