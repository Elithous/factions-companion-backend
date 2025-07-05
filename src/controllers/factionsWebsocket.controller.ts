import WebSocket from "ws";
import ReconnectingWebSocket from "reconnecting-websocket"
import fs from 'fs';
import { PlayerActivity } from "../types/playerActivity.type";
import { handleMessage, processWorldMessages } from "../services/factionsWebsocket.service";
import { getSetting, setSetting } from "../services/settings.service";
import { saveAllCaseData } from "../services/activities.service";

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