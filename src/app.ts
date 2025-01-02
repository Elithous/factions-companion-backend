import { getHqInfo } from './controllers/api.controller';
import { displayCosts } from './util/optimizer';
import { showData } from './util/jank-parser';
import { initDB } from './controllers/database.controller';
import { processHistoricalWorldSocket } from './services/factionsWebsocket.service';

async function start() {
    await initDB();
    processHistoricalWorldSocket('./src/tmplog_end.txt');
    // console.log(await getHqInfo());
    // displayCosts('HQ', { maxLevel: 30 });
    // showData(gameId);

}

start();

// Start WebSocket listeners
// startWorldSocket(gameId);