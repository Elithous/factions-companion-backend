import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { initDB } from './controllers/database.controller';
import { getSetting, initSettings } from './services/settings.service';
import routes from './routes';
import { startWorldSocket } from './controllers/factionsWebsocket.controller';
import config from './config/config';
import { saveAllCaseData } from './services/activities.service';

async function start() {
    await initDB();
    await initSettings();

    // TODO: Get currently watched games and start their threads.
    // Watch websockets and process the information
    getSetting('socket').then(setting => {
        if (setting?.watchList) {
            setting.watchList.forEach(value => startWorldSocket(value));
        }
    });
    // Get current game settings to allow cost calcs
    // Maybe something with the map?

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