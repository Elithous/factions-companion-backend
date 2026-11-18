/**
 * Ingestion worker: holds the game websockets, saves raw messages and parses
 * them into activities. It serves no HTTP. The public API (app.ts) runs as a
 * separate process, so a traffic spike or API crash can't interrupt collection.
 *
 * Run exactly one worker. Two would both connect to every game and store
 * every message twice.
 */
import { assertConfig } from './config';
import { initDB } from './db';
import { processWorldMessages } from './services/factionsWebsocket.service';
import { initSettings } from './services/settings.service';
import { reconcileWatchedGames, updateAllActiveGame } from './workers/gameWatcher';

/** How often to rescan the upstream game list for games to start/stop watching. */
const ACTIVE_GAME_POLL_MS = 60 * 60 * 1000;

/** How quickly a watch/unwatch made through the admin API takes effect. */
const WATCH_LIST_SYNC_MS = 30 * 1000;

function every(intervalMs: number, label: string, task: () => Promise<unknown>) {
    const run = () => task().catch(error => console.error(`[worker]: ${label} failed:`, error));
    run();
    setInterval(run, intervalMs);
}

async function start() {
    assertConfig();

    await initDB();
    await initSettings();
    await processWorldMessages();

    // The sync also reconnects every game left on the list at last shutdown.
    every(WATCH_LIST_SYNC_MS, 'watch list sync', reconcileWatchedGames);
    every(ACTIVE_GAME_POLL_MS, 'active game poll', updateAllActiveGame);

    console.log('[worker]: Ingestion worker started');
}

start().catch(error => {
    console.error('Failed to start worker:', error);
    process.exit(1);
});
