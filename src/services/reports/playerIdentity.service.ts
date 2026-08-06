import { QueryTypes } from "sequelize";

import { sequelize } from "../../db";

export type PlayerIdentity = {
    playerId: number;
    /** Most recently seen username. */
    name: string;
    /** Every username this id has used, newest first. Includes `name`. */
    names: string[];
    /** Distinct games this player appears in. */
    games: number;
    latestGameId: string;
    /** Unix seconds of their most recent recorded activity. */
    lastSeen: number;
};

type NameRow = {
    player_id: number;
    player_name: string | null;
    last_seen: number | null;
};

type CountRow = {
    player_id: number;
    games: number;
    latest_game_id: number | null;
};

/**
 * The index is a full scan and group of the activity table, so it's held in
 * memory rather than rebuilt per request. Renames only surface once the window
 * lapses, which is fine for a lookup list.
 */
const PLAYER_INDEX_TTL_MS = 10 * 60 * 1000;

let cache: { fetchedAt: number; players: PlayerIdentity[] } | null = null;
let inFlight: Promise<PlayerIdentity[]> | null = null;

async function buildPlayerIndex(): Promise<PlayerIdentity[]> {
    // Two passes rather than one: game counts have to be distinct per *player*,
    // and a player who used two names inside a single game would otherwise have
    // that game counted twice.
    const [nameRows, countRows] = await Promise.all([
        sequelize.query<NameRow>(`
            SELECT player_id, player_name, MAX(updated_at) AS last_seen
            FROM activities
            WHERE player_id IS NOT NULL AND player_name IS NOT NULL
            GROUP BY player_id, player_name
        `, { type: QueryTypes.SELECT }),
        sequelize.query<CountRow>(`
            SELECT player_id,
                   COUNT(DISTINCT game_id) AS games,
                   MAX(game_id) AS latest_game_id
            FROM activities
            WHERE player_id IS NOT NULL
            GROUP BY player_id
        `, { type: QueryTypes.SELECT }),
    ]);

    const namesById = new Map<number, { name: string; lastSeen: number }[]>();
    for (const row of nameRows) {
        if (!row.player_name) continue;

        const list = namesById.get(row.player_id) ?? [];
        list.push({ name: row.player_name, lastSeen: Number(row.last_seen) || 0 });
        namesById.set(row.player_id, list);
    }

    const players: PlayerIdentity[] = [];
    for (const row of countRows) {
        const seen = (namesById.get(row.player_id) ?? [])
            .sort((a, b) => b.lastSeen - a.lastSeen);

        // No usable name at all: nothing to show in a picker, so skip it rather
        // than surfacing a bare id.
        if (!seen.length) continue;

        players.push({
            playerId: row.player_id,
            name: seen[0].name,
            names: seen.map(entry => entry.name),
            games: Number(row.games) || 0,
            latestGameId: String(row.latest_game_id ?? ''),
            // `seen` is sorted newest first, so the head is the latest activity.
            lastSeen: seen[0].lastSeen,
        });
    }

    return players.sort((a, b) => a.name.localeCompare(b.name));
}

/** Every player, newest name first. Cached; concurrent callers share one build. */
export async function getPlayerIndex(): Promise<PlayerIdentity[]> {
    if (cache && Date.now() - cache.fetchedAt < PLAYER_INDEX_TTL_MS) {
        return cache.players;
    }

    // Without this, several reports rendering at once each kick off their own
    // full table scan.
    if (!inFlight) {
        inFlight = buildPlayerIndex()
            .then(players => {
                cache = { fetchedAt: Date.now(), players };
                return players;
            })
            .finally(() => { inFlight = null; });
    }

    return inFlight;
}

/** Drops the cached index. Used after data changes that would make it stale. */
export function invalidatePlayerIndex() {
    cache = null;
}

/** `playerId` to display name, for labelling reports that group by id. */
export async function getPlayerNames(): Promise<Map<number, string>> {
    const players = await getPlayerIndex();
    return new Map(players.map(player => [player.playerId, player.name]));
}

/**
 * Resolves a username to a player id.
 *
 * Only used for migrating name-keyed data. A name that two different players
 * have used at different times is genuinely ambiguous, so the most recent
 * holder wins and the caller is told it was ambiguous.
 */
export async function resolvePlayerIdByName(
    name: string
): Promise<{ playerId: number | null; ambiguous: boolean }> {
    const players = await getPlayerIndex();
    const matches = players.filter(player =>
        player.names.some(candidate => candidate.toLowerCase() === name.toLowerCase())
    );

    if (!matches.length) return { playerId: null, ambiguous: false };
    if (matches.length === 1) return { playerId: matches[0].playerId, ambiguous: false };

    const newest = matches.reduce((best, player) =>
        Number(player.latestGameId) > Number(best.latestGameId) ? player : best
    );
    return { playerId: newest.playerId, ambiguous: true };
}
