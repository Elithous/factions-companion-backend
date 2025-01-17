import WebSocket from "ws";
import ReconnectingWebSocket from "reconnecting-websocket"
import fs from 'fs';
import { PlayerActivity } from "../types/playerActivity.type";
import { handleMessage } from "../services/factionsWebsocket.service";

const worldSockets: { [gameId: number]: ReconnectingWebSocket } = {};
const factionSocket: { [gameId: number]: ReconnectingWebSocket } = {};

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
        // NOTE: WebSocket seems to have a weird issue with the way the token is processed.
        // Factions expects there to be a comma and a space between token and the auth token
        // while by default the WebSocket only does comma seperation. This is resolved in node_modules for me.
        const ws = new ReconnectingWebSocket(worldSocketString, ['Token', process.env.AUTH_TOKEN], {
            WebSocket,
            debug: false
        });

        worldSockets[gameId] = ws;
    }
    const worldSocket = worldSockets[gameId];
    
    worldSocket.addEventListener('error', (event) => {
      console.log(event);
    });
    
    worldSocket.addEventListener('message', (event) => {
      const json = JSON.parse(event.data);

      const message = JSON.stringify(json);
      console.log(`Received message from server: ${message}`);

      handleMessage('world_socket', json);
    });
}