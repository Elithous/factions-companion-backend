import { getHqInfo } from './controllers/api.controller';
import { displayCosts } from './util/optimizer';
import { showData } from './util/jank-parser';
import { initDB } from './controllers/database.controller';
import { processWorldMessages, readWorldMessagesFile } from './services/factionsWebsocket.service';

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