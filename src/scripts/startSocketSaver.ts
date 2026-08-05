import { assertConfig } from "../config";
import { initDB } from "../db";
import { startWorldSocket } from "../workers/gameWatcher";

/** Usage: npm run socket-saver -- GAME_ID=123 */
const gameIdArg = process.argv.find(value => value.startsWith('GAME_ID='));
if (!gameIdArg) {
    console.error('Missing required argument: GAME_ID=<id>');
    process.exit(1);
}

assertConfig();

initDB().then(() => startWorldSocket(gameIdArg.slice('GAME_ID='.length)));
