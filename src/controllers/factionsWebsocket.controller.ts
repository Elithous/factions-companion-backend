import WebSocket from "ws";
import ReconnectingWebSocket from "reconnecting-websocket"
import { PlayerActivity } from "../types/playerActivity.type";
import { handleMessage, processWorldMessages } from "../services/factionsWebsocket.service";
import { getSetting, setSetting } from "../services/settings.service";
import { saveAllCaseData, savePastActivities } from "../services/activities.service";
import { apiFetch } from "./api.controller";
import { FactionsGame } from "../types/apiResponses/factionsGame.type";

const worldSockets: { [gameId: string]: ReconnectingWebSocket } = {};
const factionSocket: { [gameId: string]: ReconnectingWebSocket } = {};
const parseIntervals: { [gameId: string]: NodeJS.Timeout } = {};

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
    if (!worldSockets[gameId]?.OPEN) {
        const worldSocketString = `${process.env.WS_BASE_URL}game/${gameId}/world_update`;
        const authToken = process.env.AUTH_TOKEN;

        const socketWithAuth = `${worldSocketString}?token=${authToken}`;
        // NOTE: WebSocket seems to have a weird issue with the way the token is processed.
        // Factions expects there to be a comma and a space between token and the auth token
        // while by default the WebSocket only does comma seperation. This is resolved in node_modules for me.
        const ws = new ReconnectingWebSocket(socketWithAuth, [], {
            WebSocket,
            debug: false
        });

        worldSockets[gameId] = ws;

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
}

export async function stopWorldSocket(gameId: string) {
    const socket = worldSockets[gameId];
    if (socket?.OPEN) {
        socket.close(1001);

        delete worldSockets[gameId];
    }
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

export async function watchGame(gameId: string) {
    saveAllCaseData(gameId);

    await startWorldSocket(gameId);
    await startPeriodicParsing(gameId);
    console.log(`Watching game ${gameId}`);
    // TODO: Also watch worker queue, leaderboard?, chat?
}

export async function setWatchGame(gameId: string) {
    const socketSetting = await getSetting('socket');
    socketSetting.watchList.push(gameId);
    setSetting('socket', socketSetting);

    watchGame(gameId);
}

export async function unsetWatchGame(gameId: string) {
    const socketSetting = await getSetting('socket');
    socketSetting.watchList = socketSetting.watchList.filter(id => id !== gameId);
    setSetting('socket', socketSetting);

    await stopWorldSocket(gameId);
    await stopPeriodicParsing(gameId);
    console.log(`Unwatched game ${gameId}`);
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

    // Get the current socket setting and watch list
    const socketSetting = await getSetting('socket');
    const watchList: string[] = socketSetting.watchList || [];

    // Filter games that are LOBBY or IN_PROGRESS and not already in the watch list
    const activeGames = games.filter(game =>
        (game.status === 'LOBBY' || game.status === 'IN_PROGRESS' || game.status === 'PLAYING') &&
        !watchList.includes(game.id.toString())
    );

    // Add each active game to the watch list and start watching
    for (const game of activeGames) {
        socketSetting.watchList.push(game.id.toString());
        await watchGame(game.id.toString());
        console.log(`Added game ${game.id} to watch list (status: ${game.status})`);
    }

    // Filter games that are COMPLETED and in the watch list
    const completedGames = games.filter(game =>
        game.status === 'COMPLETED' && watchList.includes(game.id.toString())
    );

    // Remove each completed game from the watch list and stop watching
    for (const game of completedGames) {
        socketSetting.watchList.filter(id => id !== game.id.toString());
        await unsetWatchGame(game.id.toString());
        console.log(`Removed game ${game.id} from watch list (status: ${game.status})`);

        // Update any missing data using the logs endpoint
        savePastActivities(game.id.toString());
    }

    // Save the updated watch list
    await setSetting('socket', socketSetting);
}