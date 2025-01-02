import 'dotenv/config';

export const WS_BASE_URL = process.env.WS_BASE_URL;
export const API_BASE_URL = process.env.API_BASE_URL;
export const AUTH_TOKEN = process.env.AUTH_TOKEN;

export const GAME_ID = process.env.GAME_ID;

export default {
    WS_BASE_URL,
    API_BASE_URL,
    AUTH_TOKEN,
    GAME_ID
}