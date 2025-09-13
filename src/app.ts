import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { initDB } from './controllers/database.controller';
import { getSetting, initSettings } from './services/settings.service';
import routes from './routes';
import { watchGame, updateAllActiveGame } from './controllers/factionsWebsocket.controller';
import config from './config/config';

async function start() {
    await initDB();
    await initSettings();

    // TODO: Get currently watched games and start their threads.
    // Watch websockets and process the information
    getSetting('socket').then(setting => {
        if (setting?.watchList) {
            setting.watchList.forEach(value => watchGame(value));
        }
    });
    // Get current game settings to allow cost calcs
    // Maybe something with the map?
    // savePastActivities('31');

    // Periodically check for new active games to watch every hour
    setInterval(() => {
        updateAllActiveGame().catch(err => console.error('Error in watchAllActiveGames:', err));
    }, 60 * 60 * 1000); // 1 hour in milliseconds

    // Run once on startup
    updateAllActiveGame().catch(err => console.error('Error in watchAllActiveGames (startup):', err));

    // Express setup
    const app: Express = express();
    const port = config.PORT;

    app.use(cors());
    app.use('/', routes);

    app.get('/', (req: Request, res: Response) => {
        res.send('Express Server');
    });

    app.listen(port, () => {
        console.log(`[server]: Server is running at http://localhost:${port}`);
    });
}

start();