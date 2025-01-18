import { getHqInfo } from './controllers/api.controller';
import { displayCosts } from './util/optimizer';
import { showData } from './util/jank-parser';
import { initDB } from './controllers/database.controller';
import { processWorldMessages, readWorldMessagesFile } from './services/factionsWebsocket.service';
import express, { Express, Request, Response } from 'express';

async function start() {
    await initDB();
    // await processWorldMessagesFile('./src/tmp/log_end.txt');
    // await processWorldMessages(true);
    console.log('Online!');
    // console.log(await getHqInfo());
    // displayCosts('HQ', { maxLevel: 30 });
    // showData(gameId);

}

start();

// Start WebSocket listeners
// startWorldSocket(gameId);

// Express setup
const app: Express = express();
const port = 3000;

app.get('/', (req: Request, res: Response) => {
    res.send('Express Server');
});

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});