import { Op } from "sequelize";
import { apiFetch } from "../../clients/factionsApi";
import { sequelize } from "../../db";
import { ActivitiesModel } from "../../models/activities/activities.model";
import { GameConfigModel } from "../../models/config.model";
import { FactionsGame } from "../../types/apiResponses/factionsGame.type";
import { HqConfigModel } from "../../types/apiResponses/hq.type";
import { FactionColor } from "../../types/faction.type";

/** Games we hold activity for, newest first. Narrowed to one player's games when asked. */
export async function getAvailableGameIds(playerId?: number) {
    const gameIds = await ActivitiesModel.findAll({
        attributes: ['game_id'],
        where: playerId !== undefined ? { player_id: playerId } : {},
        group: ['game_id'],
        order: [['game_id', 'DESC']]
    }).then(ids =>
        ids.map(id => id.game_id)
    );

    return gameIds;
}

/** What the game picker needs to describe a game without opening it. */
export type GameSummary = {
    id: string;
    /** Game mode, e.g. STANDARD or SHORT. */
    mode: string | null;
    map: string | null;
    players: number | null;
    maxPlayers: number | null;
    status: string | null;
    winner: FactionColor | null;
};

/**
 * The upstream game index is the same for every caller and changes slowly, so
 * it's held briefly in memory rather than re-fetched for each page that mounts
 * the picker.
 */
const GAME_INDEX_TTL_MS = 5 * 60 * 1000;
let gameIndexCache: { fetchedAt: number; games: FactionsGame[] } | null = null;

async function getGameIndex(): Promise<FactionsGame[]> {
    if (gameIndexCache && Date.now() - gameIndexCache.fetchedAt < GAME_INDEX_TTL_MS) {
        return gameIndexCache.games;
    }

    try {
        // gameId is unused by this endpoint.
        const games = await apiFetch('list_games', '');
        gameIndexCache = { fetchedAt: Date.now(), games };
        return games;
    } catch (error) {
        // The picker is far more useful listing bare ids than failing outright,
        // so an upstream outage degrades instead of erroring.
        console.error('Failed to fetch the game index:', error);
        return gameIndexCache?.games ?? [];
    }
}

/**
 * Every game we hold activity for, annotated with whatever metadata we can find.
 *
 * The activity table is the source of truth for *which* games to list — those
 * are the ones with something to show. Mode, player count and status come from
 * the upstream index, and the map name falls back to the stored config, since
 * the index tends to drop games once they're long finished.
 */
export async function getAvailableGames(playerId?: number): Promise<GameSummary[]> {
    const [ids, index, configs] = await Promise.all([
        getAvailableGameIds(playerId),
        getGameIndex(),
        // Read the saved configs directly rather than via getConfig, which would
        // fire one upstream request per game on a cache miss.
        GameConfigModel.findAll({ attributes: ['game_id', 'data'], where: { type: 'hq' } }),
    ]);

    const byId = new Map(index.map(game => [String(game.id), game]));
    const mapNames = new Map(
        configs.map(config => [String(config.game_id), config.data?.mapConfig?.name ?? null])
    );

    return ids.map(id => {
        const key = String(id);
        const game = byId.get(key);

        return {
            id: key,
            mode: game?.type ?? null,
            map: game?.map ?? mapNames.get(key) ?? null,
            players: game?.numberOfPlayers ?? null,
            maxPlayers: game?.maxPlayers ?? null,
            status: game?.status ?? null,
            winner: game?.winner ?? null,
        };
    });
}

export async function getTimespan(gameId: string) {
    const minTime = await ActivitiesModel.min('created_at', {
        where: {
            game_id: gameId
        }
    });
    const maxTime = await ActivitiesModel.max('created_at', {
        where: {
            game_id: gameId
        }
    });

    return [minTime, maxTime];
}

export async function getConfig(gameId: string) {
    // TODO: Invalidate config after econ change
    const savedConfig = await GameConfigModel.findOne({
        where: { game_id: gameId, type: 'hq' }
    });
    let config: HqConfigModel;
    if (!savedConfig) {
        config = await apiFetch('get_hq_config', gameId);

        GameConfigModel.create({
            game_id: parseInt(gameId),
            type: 'hq',
            data: config
        });
    } else {
        config = savedConfig.data;
    }

    return config;
}

/**
 * Players who acted in one game, keyed by id.
 *
 * A player who renamed mid-game has two rows here, so they're folded to the
 * newest name per id rather than appearing twice in a picker.
 */
export async function getAllActivePlayers(gameId: string) {
    const rows = await ActivitiesModel.findAll({
        attributes: ['player_id', 'player_name', 'updated_at'],
        where: {
            game_id: gameId,
            player_id: { [Op.not]: null },
            player_name: { [Op.not]: null },
        },
        order: [['updated_at', 'ASC']],
        raw: true,
    });

    // Ascending order means the last write per id is the most recent name.
    const latestName = new Map<number, string>();
    for (const row of rows) {
        if (row.player_id === null || !row.player_name) continue;
        latestName.set(row.player_id, row.player_name);
    }

    return Array.from(latestName.entries())
        .map(([player_id, player_name]) => ({ player_id, player_name }))
        .sort((a, b) => a.player_name.localeCompare(b.player_name));
}

/**
 * How many defenders each terrain type starts the game with.
 *
 * A tile with defenders belongs to the neutral faction until somebody clears it;
 * everything else starts unowned. Anything not listed here has no garrison.
 */
export const TILE_DEFAULT_SOLDIERS: Record<string, number> = {
    'mine': 30,
    'tree': 30,
    'village': 50,
    'farm': 50,
    'bridge': 50,
    'temple': 200,
    'tower': 200,
    'city': 300,
    'mansion': 300,
    'castle': 500
};

/** Whether a terrain type spawns neutral defenders, and so starts NEUTRAL-owned. */
export function hasNeutralDefenders(terrain: string | null | undefined): boolean {
    return !!terrain && (TILE_DEFAULT_SOLDIERS[terrain] ?? 0) > 0;
}

/** The terrain type at a coordinate, or null when the map config is unavailable. */
export async function getTerrainAt(gameId: string, x: number, y: number): Promise<string | null> {
    try {
        const config = await getConfig(gameId);
        return config?.world?.[x]?.[y] ?? null;
    } catch {
        // The drill-down is still useful without terrain, so a config failure
        // shouldn't take the whole report down with it.
        return null;
    }
}

export type HqPosition = { x: number, y: number };

/** Where each faction's HQ sits on the map, per the game's map config. */
export async function getHqPositions(gameId: string): Promise<Partial<Record<FactionColor, HqPosition>>> {
    const config = await getConfig(gameId);
    return config?.mapConfig?.hqs_positions ?? {};
}

/**
 * The inverse of `getHqPositions`: each HQ's `"x:y"` tile to its owning faction.
 *
 * Loot events record the tile they hit rather than the team they hit, so the
 * loot reports use this to work out who was being looted.
 */
export async function getHqPositionLookup(gameId: string): Promise<Record<string, FactionColor>> {
    const positions = await getHqPositions(gameId);

    const lookup: Record<string, FactionColor> = {};
    for (const [faction, position] of Object.entries(positions)) {
        lookup[`${position.x}:${position.y}`] = faction as FactionColor;
    }

    return lookup;
}
