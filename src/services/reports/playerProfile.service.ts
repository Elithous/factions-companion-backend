import { QueryTypes } from "sequelize";

import { apiFetch } from "../../clients/factionsApi";
import { sequelize } from "../../db";
import { PlayerProfileResponse } from "../../types/apiResponses/playerProfile.type";
import { getPlayerIndex } from "./playerIdentity.service";

/** Career total and per-game average. */
export type StatSummary = {
    /** Career total, across every game regardless of what the average counts. */
    total: number;
    average: number;
    /** Games the average is computed over. */
    countedGames: number;
};

export type CareerTotals = {
    soldiers: StatSummary;
    workers: StatSummary;
    resources: StatSummary;
    wood: StatSummary;
    iron: StatSummary;
    supports: StatSummary;
    knight: StatSummary;
    guardian: StatSummary;
    mapBuildings: StatSummary;
};

export type PlayerProfile = {
    playerId: number;
    name: string;
    /** Every name this player has used, newest first. */
    names: string[];
    avatarUrl: string | null;
    /** Unix seconds of their last activity, per upstream. */
    lastSeen: number | null;
    /** Their rating. Null when the upstream profile couldn't be read. */
    score: number | null;
    gamesPlayed: number;
    gamesWon: number;
    /** Games where they were best player. */
    mvps: number;
    clan: { id: number; name: string; tagline: string } | null;
    /** Games played as each faction colour, from our own activity log. */
    factionCounts: Record<string, number>;
    totals: CareerTotals;
    /** When this profile was assembled, unix seconds. */
    refreshedAt: number;
    /** True when the upstream profile was unavailable and only local data is present. */
    upstreamUnavailable: boolean;
};

/**
 * Profiles are cached because assembling one runs an upstream call plus a
 * grouped scan of the activity log. The Update button clears the entry.
 */
const cache = new Map<number, PlayerProfile>();

export function invalidatePlayerProfile(playerId?: number) {
    if (playerId === undefined) cache.clear();
    else cache.delete(playerId);
}

/* -------------------------------------------------------------------------- */
/* Outlier-trimmed averages                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Career total and per-game average.
 *
 * `counted` optionally restricts which games the average is computed over — the
 * support rows use it to skip games where that support wasn't sent. The total
 * always spans every game regardless.
 */
function summarise(values: number[], counted?: boolean[]): StatSummary {
    const total = values.reduce((sum, value) => sum + value, 0);

    const sample = counted ? values.filter((_, index) => counted[index]) : values;
    const countedGames = sample.length;
    const average = countedGames
        ? sample.reduce((sum, value) => sum + value, 0) / countedGames
        : 0;

    return { total, average, countedGames };
}

/* -------------------------------------------------------------------------- */
/* Contribution totals from the activity log                                  */
/* -------------------------------------------------------------------------- */

type PerGameRow = {
    game_id: number;
    soldiers: number | null;
    workers: number | null;
    wood: number | null;
    iron: number | null;
    supports: number | null;
    knight: number | null;
    guardian: number | null;
    map_buildings: number | null;
};

/**
 * One row per game, so each stat can be summarised across games rather than
 * across raw activities — an average has to be per game to mean anything.
 */
async function getPerGameTotals(playerId: number): Promise<PerGameRow[]> {
    return sequelize.query<PerGameRow>(`
        SELECT
            game_id,
            SUM(CASE WHEN type IN ('soldiers_attack','soldiers_defend') THEN amount ELSE 0 END) AS soldiers,
            SUM(CASE WHEN type IN ('fortification_workers_sent','improvement_workers_sent',
                                   'dismantle_workers_sent','workers_sent','event_workers_sent')
                     THEN amount ELSE 0 END) AS workers,
            SUM(CASE WHEN type = 'resources_sent' THEN IFNULL(wood, 0) ELSE 0 END) AS wood,
            SUM(CASE WHEN type = 'resources_sent' THEN IFNULL(iron, 0) ELSE 0 END) AS iron,
            SUM(CASE WHEN type = 'support_sent' THEN 1 ELSE 0 END) AS supports,
            SUM(CASE WHEN type = 'support_sent' AND LOWER(support_type) = 'knight' THEN 1 ELSE 0 END) AS knight,
            SUM(CASE WHEN type = 'support_sent' AND LOWER(support_type) = 'guardian' THEN 1 ELSE 0 END) AS guardian,
            SUM(CASE WHEN type = 'map_building_started' THEN 1 ELSE 0 END) AS map_buildings
        FROM activities
        WHERE player_id = :playerId
        GROUP BY game_id
    `, { replacements: { playerId }, type: QueryTypes.SELECT });
}

async function getFactionCounts(playerId: number): Promise<Record<string, number>> {
    const rows = await sequelize.query<{ player_faction: string | null; games: number }>(`
        SELECT player_faction, COUNT(DISTINCT game_id) AS games
        FROM activities
        WHERE player_id = :playerId AND player_faction IS NOT NULL
        GROUP BY player_faction
    `, { replacements: { playerId }, type: QueryTypes.SELECT });

    const counts: Record<string, number> = {};
    for (const row of rows) {
        if (!row.player_faction) continue;
        counts[String(row.player_faction).toUpperCase()] = Number(row.games) || 0;
    }
    return counts;
}

const column = (rows: PerGameRow[], key: keyof PerGameRow) =>
    rows.map(row => Number(row[key]) || 0);

function buildTotals(rows: PerGameRow[]): CareerTotals {
    const wood = column(rows, 'wood');
    const iron = column(rows, 'iron');
    const supports = column(rows, 'supports');

    const knight = column(rows, 'knight');
    const guardian = column(rows, 'guardian');

    /**
     * Support averages only count games where that support was actually sent
     * Excluding games where a player didn't chose a support spec.
     */
    const sent = (values: number[]) => values.map(value => value > 0);

    return {
        soldiers: summarise(column(rows, 'soldiers')),
        workers: summarise(column(rows, 'workers')),
        // Resources is the combined figure, summarised on the per-game sum
        // rather than by adding two already-trimmed averages.
        resources: summarise(wood.map((value, index) => value + iron[index])),
        wood: summarise(wood),
        iron: summarise(iron),
        supports: summarise(supports, sent(supports)),
        knight: summarise(knight, sent(knight)),
        guardian: summarise(guardian, sent(guardian)),
        mapBuildings: summarise(column(rows, 'map_buildings')),
    };
}

/* -------------------------------------------------------------------------- */

export async function getPlayerProfile(
    playerId: number,
    options: { refresh?: boolean } = {}
): Promise<PlayerProfile> {
    if (options.refresh) cache.delete(playerId);

    const cached = cache.get(playerId);
    if (cached) return cached;

    let upstream: PlayerProfileResponse | null = null;
    try {
        // This endpoint is player-scoped; the client's `{gameId}` slot carries
        // the user id.
        upstream = await apiFetch('get_player', String(playerId));
    } catch (error) {
        console.error(`Failed to fetch upstream profile for player ${playerId}:`, error);
    }

    const [perGame, factionCounts, index] = await Promise.all([
        getPerGameTotals(playerId),
        getFactionCounts(playerId),
        getPlayerIndex(),
    ]);

    const local = index.find(entry => entry.playerId === playerId);

    const profile: PlayerProfile = {
        playerId,
        // Upstream is the more current name; the local index is the fallback.
        name: upstream?.player.username ?? local?.name ?? `Player ${playerId}`,
        names: upstream?.previousUsernames?.length
            ? upstream.previousUsernames
            : local?.names ?? [],
        avatarUrl: upstream?.player.avatarUrl ?? null,
        lastSeen: upstream?.player.lastSeen ?? local?.lastSeen ?? null,
        score: upstream?.player.score ?? null,
        // Upstream counts every game they played; ours only counts games we
        // hold activity for, so prefer theirs.
        gamesPlayed: upstream?.playerStats.gamesPlayed ?? local?.games ?? 0,
        gamesWon: upstream?.playerStats.gamesWon ?? 0,
        mvps: upstream?.playerStats.bestPlayer ?? 0,
        clan: upstream?.playerFaction ?? null,
        factionCounts,
        totals: buildTotals(perGame),
        refreshedAt: Math.floor(Date.now() / 1000),
        upstreamUnavailable: upstream === null,
    };

    cache.set(playerId, profile);
    return profile;
}
