/**
 * Public HTTP API. It serves reports from the database and never opens game
 * websockets. Collection runs in the separate worker process (worker.ts).
 */
import cors from 'cors';
import express, { Express, Request, Response } from 'express';

import { assertConfig, serverConfig } from './config';
import { initDB } from './db';
import { warnIfAdminKeyMissing } from './http/adminAuth';
import { errorHandler } from './http/errors';
import { parseTrustProxy } from './http/rateLimit';
import routes from './routes';
import { initSettings } from './services/settings.service';

function createServer(): Express {
    const app = express();

    // Decides what req.ip is, which the rate limiter keys on.
    app.set('trust proxy', parseTrustProxy());
    app.use(cors());
    // Definition payloads are posted whole and run to tens of thousands of
    // lines, so the default 100kb body limit is raised.
    app.use(express.json({ limit: '10mb' }));
    app.get('/', (_req: Request, res: Response) => {
        res.send('Express Server');
    });
    app.use('/', routes);
    app.use(errorHandler);

    return app;
}

async function start() {
    assertConfig();
    warnIfAdminKeyMissing();

    await initDB();
    await initSettings();

    const app = createServer();
    app.listen(serverConfig.PORT, () => {
        console.log(`[server]: Server is running at http://localhost:${serverConfig.PORT}`);
    });
}

start().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
