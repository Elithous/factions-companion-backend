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
 * Anything that isn't an `HttpError` is treated as a 400, matching the
 * behaviour of the per-handler try/catch blocks this replaces.
 */
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
    const status = error instanceof HttpError ? error.status : 400;
    const message = error instanceof Error ? error.message : String(error);

    if (status >= 500) {
        console.error(error);
    }

    res.status(status).json({ message });
}
