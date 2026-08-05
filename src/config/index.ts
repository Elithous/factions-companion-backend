import 'dotenv/config';

/**
 * Every environment variable the app reads, in one place. Nothing else should
 * touch `process.env` directly.
 *
 * Reading config never throws — call `assertConfig()` during startup to get a
 * single clear error listing everything that's missing, instead of a mysql
 * connection failure or an upstream 401 much later on.
 */

export const serverConfig = {
    PORT: process.env.PORT || '4000',
};

export const dbConfig = {
    DB_NAME: process.env.DB_NAME,
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
};

/** Upstream Factions game API and websocket. */
export const factionsConfig = {
    WS_BASE_URL: process.env.WS_BASE_URL,
    API_BASE_URL: process.env.API_BASE_URL,
    AUTH_TOKEN: process.env.AUTH_TOKEN,
};

/** Variables the app cannot start without. */
const REQUIRED_VARS = [
    'DB_NAME', 'DB_HOST', 'DB_USER', 'DB_PASSWORD',
    'WS_BASE_URL', 'API_BASE_URL', 'AUTH_TOKEN',
] as const;

export function assertConfig() {
    const missing = REQUIRED_VARS.filter(name => !process.env[name]);

    if (missing.length) {
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}. ` +
            `Copy .env.defaults to .env and fill them in.`
        );
    }
}

export default { ...serverConfig, ...dbConfig, ...factionsConfig };
