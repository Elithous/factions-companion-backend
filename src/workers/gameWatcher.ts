import WebSocket from "ws";
import { factionsConfig } from "../config";
import ReconnectingWebSocket from "reconnecting-websocket"
import { PlayerActivity } from "../types/playerActivity.type";
import { handleMessage, processWorldMessages } from "../services/factionsWebsocket.service";
import { addToWatchList, getSetting, getWatchList, removeFromWatchList } from "../services/settings.service";
import { saveAllCaseData, savePastActivities, updateMissingTileData } from "../services/activities.service";
import { apiFetch } from "../clients/factionsApi";
import { invalidateCache } from "../services/reports/reportCache.service";
import { FactionsGame } from "../types/apiResponses/factionsGame.type";

const WORLD_SOCKET_FACTIONS = ['RED', 'BLUE', 'GREEN', 'YELLOW'] as const;
type WorldSocketFaction = (typeof WORLD_SOCKET_FACTIONS)[number];

const worldSockets: { [gameId: string]: ReconnectingWebSocket } = {};
const worldSocketFactions: { [gameId: string]: WorldSocketFaction } = {};
const worldSocketDiscovery: { [gameId: string]: Promise<WorldSocketFaction | null> } = {};
const parseIntervals: { [gameId: string]: NodeJS.Timeout } = {};

function buildWorldSocketUrl(gameId: string, faction: WorldSocketFaction) {
    const { WS_BASE_URL, AUTH_TOKEN } = factionsConfig;
    return `${WS_BASE_URL}game/${gameId}/${faction}?token=${AUTH_TOKEN}`;
}

function attachWorldSocketHandlers(ws: ReconnectingWebSocket) {
    ws.addEventListener('error', (event) => {
        console.log(event);
    });

    ws.addEventListener('message', (event) => {
        const json = JSON.parse(event.data);

        const message = JSON.stringify(json);
        console.log(`Received message from server: ${message}`);

        handleMessage('world_socket', json);
    });
}

async function discoverValidFaction(gameId: string): Promise<WorldSocketFaction | null> {
    return new Promise((resolve) => {
        let settled = false;
        let closedCount = 0;
        const probeSockets: WebSocket[] = [];

        const finish = (faction: WorldSocketFaction | null) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeout);
            for (const socket of probeSockets) {
                socket.removeAllListeners();
                if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                    socket.close();
                }
            }
            resolve(faction);
        };

        const timeout = setTimeout(() => {
            console.error(`Timed out discovering faction websocket for game ${gameId}`);
            finish(null);
        }, 15000);

        for (const faction of WORLD_SOCKET_FACTIONS) {
            const probe = new WebSocket(buildWorldSocketUrl(gameId, faction));
            probeSockets.push(probe);

            probe.on('open', () => finish(faction));

            probe.on('close', () => {
                closedCount++;
                if (closedCount === WORLD_SOCKET_FACTIONS.length) {
                    finish(null);
                }
            });

            probe.on('error', (error: Error) => {
                console.log(`${faction}: ${error.message}`);
            });
        }
    });
}

async function resolveWorldSocketFaction(gameId: string): Promise<WorldSocketFaction | null> {
    if (worldSocketFactions[gameId]) {
        return worldSocketFactions[gameId];
    }

    if (!worldSocketDiscovery[gameId]) {
        worldSocketDiscovery[gameId] = discoverValidFaction(gameId).finally(() => {
            delete worldSocketDiscovery[gameId];
        });
    }

    const faction = await worldSocketDiscovery[gameId];
    if (faction) {
        worldSocketFactions[gameId] = faction;
    }
    return faction;
}

export type FactionSocketData = {
    type: 'new_vote'
    id: number
} | {
    type: 'initial_activities'
    list: PlayerActivity[]
} | {
    type: 'new_activity'
    activity: PlayerActivity
}

export async function startWorldSocket(gameId: string) {
    const existing = worldSockets[gameId];
    if (
        existing?.readyState === WebSocket.OPEN ||
        existing?.readyState === WebSocket.CONNECTING
    ) {
        return;
    }

    const faction = await resolveWorldSocketFaction(gameId);
    if (!faction) {
        console.error(`No valid faction websocket for game ${gameId}`);
        return;
    }

    const ws = new ReconnectingWebSocket(buildWorldSocketUrl(gameId, faction), [], {
        WebSocket,
        debug: false
    });

    worldSockets[gameId] = ws;
    attachWorldSocketHandlers(ws);

    console.log(`Connected world socket for game ${gameId} on faction ${faction}`);
}

export async function stopWorldSocket(gameId: string) {
    // Close in any state: a ReconnectingWebSocket that is still connecting
    // would otherwise keep retrying after we've dropped our reference to it.
    worldSockets[gameId]?.close(1001);

    delete worldSockets[gameId];
    delete worldSocketFactions[gameId];
}

export async function startPeriodicParsing(gameId: string) {
    // Clear any existing interval for this game
    if (parseIntervals[gameId]) {
        clearInterval(parseIntervals[gameId]);
    }

    // Set up interval to parse websocket data every 5 minutes
    parseIntervals[gameId] = setInterval(async () => {
        try {
            console.log(`Processing websocket data for game ${gameId}`);
            await processWorldMessages(false);
        } catch (error) {
            console.error(`Error processing websocket data for game ${gameId}:`, error);
        }
    }, 5 * 60 * 1000); // 5 minutes in milliseconds

    console.log(`Started periodic parsing for game ${gameId} (every 5 minutes)`);
}

export async function stopPeriodicParsing(gameId: string) {
    if (parseIntervals[gameId]) {
        clearInterval(parseIntervals[gameId]);
        delete parseIntervals[gameId];
        console.log(`Stopped periodic parsing for game ${gameId}`);
    }
}

/** Games this process currently has a socket and parse timer for. */
const activeWatches = new Set<string>();

/** Starts collecting a game in this process. Safe to call more than once. */
export async function watchGame(gameId: string) {
    if (activeWatches.has(gameId)) return;
    activeWatches.add(gameId);

    saveAllCaseData(gameId);

    await startWorldSocket(gameId);
    await startPeriodicParsing(gameId);
    console.log(`Watching game ${gameId}`);
    // TODO: Also watch worker queue, leaderboard?, chat?
}

/** Stops collecting a game in this process. Doesn't touch the stored watch list. */
export async function stopWatchingGame(gameId: string) {
    if (!activeWatches.delete(gameId)) return;

    await stopWorldSocket(gameId);
    await stopPeriodicParsing(gameId);
    console.log(`Unwatched game ${gameId}`);
}

/**
 * Brings this process's sockets in line with the stored watch list.
 *
 * The API only edits the list, and the worker calls this on a timer. That's
 * how a watch/unwatch request reaches the sockets without the two processes
 * sharing memory.
 */
export async function reconcileWatchedGames() {
    const watchList = new Set(await getWatchList());

    for (const gameId of watchList) {
        if (!activeWatches.has(gameId)) await watchGame(gameId);
    }
    for (const gameId of [...activeWatches]) {
        if (!watchList.has(gameId)) await stopWatchingGame(gameId);
    }
}

// Function to start periodic parsing for all currently watched games
export async function startPeriodicParsingForAllWatchedGames() {
    const socketSetting = await getSetting('socket');
    if (socketSetting?.watchList) {
        for (const gameId of socketSetting.watchList) {
            await startPeriodicParsing(gameId);
        }
        console.log(`Started periodic parsing for ${socketSetting.watchList.length} watched games`);
    }
}

// Function to stop periodic parsing for all games
export async function stopAllPeriodicParsing() {
    for (const gameId in parseIntervals) {
        await stopPeriodicParsing(gameId);
    }
    console.log('Stopped all periodic parsing');
}

// Adds all games in LOBBY or IN_PROGRESS to the watch list if not already present
export async function updateAllActiveGame() {
    // Fetch all games from the API
    let games: FactionsGame[] = [];
    try {
        // The second argument to apiFetch is gameId, but for list_games it is not used, so pass an empty string
        games = await apiFetch('list_games', '');
    } catch (error) {
        console.error('Failed to fetch games:', error);
        return;
    }

    // Each change is a small read-modify-write of the stored list, so an
    // admin edit made through the API meanwhile isn't overwritten by a stale copy.
    for (const game of games) {
        const gameId = game.id.toString();

        if (game.status === 'LOBBY' || game.status === 'IN_PROGRESS' || game.status === 'PLAYING') {
            if (await addToWatchList(gameId)) {
                console.log(`Added game ${gameId} to watch list (status: ${game.status})`);
            }
        }
        else if (game.status === 'COMPLETED') {
            if (await removeFromWatchList(gameId)) {
                console.log(`Removed game ${gameId} from watch list (status: ${game.status})`);

                // Update any missing data using the logs endpoint
                // A finished game's reports are cached forever, so any built
                // before this backfill landed would otherwise stay incomplete.
                savePastActivities(gameId)
                    .then(() => updateMissingTileData(gameId))
                    .then(() => invalidateCache(gameId))
                    .catch(error => console.error(`Error backfilling game ${gameId}:`, error));
            }
        }
    }

    await reconcileWatchedGames();
}