import cors from 'cors';
import express, { Express, Request, Response } from 'express';

import { assertConfig, serverConfig } from './config';
import { initDB } from './db';
import { errorHandler } from './http/errors';
import routes from './routes';
import { processWorldMessages } from './services/factionsWebsocket.service';
import { getSetting, initSettings } from './services/settings.service';
import { updateAllActiveGame, watchGame } from './workers/gameWatcher';

/** How often to rescan the upstream game list for games to start/stop watching. */
const ACTIVE_GAME_POLL_MS = 60 * 60 * 1000;

/** Reconnect to every game that was on the watch list when we last shut down. */
async function resumeWatchedGames() {
    const setting = await getSetting('socket');
    setting?.watchList?.forEach(gameId => watchGame(gameId));
}

function startActiveGamePolling() {
    const poll = () =>
        updateAllActiveGame().catch(err => console.error('Error updating active games:', err));

    poll();
    setInterval(poll, ACTIVE_GAME_POLL_MS);
}

function createServer(): Express {
    const app = express();

    app.use(cors());
    app.get('/', (_req: Request, res: Response) => {
        res.send('Express Server');
    });
    app.use('/', routes);
    app.use(errorHandler);

    return app;
}

async function start() {
    assertConfig();

    await initDB();
    await initSettings();
    await processWorldMessages();

    await resumeWatchedGames();
    startActiveGamePolling();

    const app = createServer();
    app.listen(serverConfig.PORT, () => {
        console.log(`[server]: Server is running at http://localhost:${serverConfig.PORT}`);
    });
}

start().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
