/**
 * The project-tree definitions for a game.
 *
 * A `personal_activities` row records only the translation key and the tier, so
 * on its own it can't say what a pick actually did or what it was unlocked by.
 * These definitions supply the structure — the nodes, how they depend on each
 * other, and their effects — that picks get joined onto.
 *
 * Three separate trees, one per endpoint:
 *   - talents            (`specialization/talents`)
 *   - team projects      (`projects/list`)
 *   - personal projects  (`projects/personal/list`)
 *
 * The payloads are passed through unshaped for now. Normalising them into a
 * common node type needs the field names, and guessing at those would bake in
 * something that has to be unpicked later.
 * 
 * I will be asking Visslar to improve the reporting in this aspect to make what was picked more clear
 */

import { apiFetch, endpointUrl, hasAuthToken } from "../../clients/factionsApi";
import { GameConfigKind, GameConfigModel } from "../../models/config.model";

export type ProjectDefinitions = {
    gameId: string;
    talents: unknown;
    teamProjects: unknown;
    personalProjects: unknown;
    /** Which of the three failed to load, if any. */
    unavailable: string[];
    /**
     * Why each failure happened, keyed by endpoint. Surfaced in the response
     * rather than only logged — a bare "unavailable" says nothing about whether
     * the token is missing, the game is wrong, or the url is.
     */
    errors: Record<string, string>;
    /** The urls that were called, so a 404 can be checked against them. */
    attempted: Record<string, string>;
    /** False when AUTH_TOKEN is unset, which produces a 401 on every call. */
    hasAuthToken: boolean;
    /** Which trees were served from the database rather than upstream. */
    fromStore: string[];
};

/**
 * Definitions are fixed for the life of a game, so they're cached indefinitely
 * per game rather than re-fetched.
 */
const cache = new Map<string, ProjectDefinitions>();

type TreeEndpoint = 'get_talents' | 'get_projects' | 'get_personal_projects';

/** Which stored config kind each endpoint's payload is filed under. */
const STORED_AS: Record<TreeEndpoint, GameConfigKind> = {
    get_talents: 'talents',
    get_projects: 'projects',
    get_personal_projects: 'personal_projects',
};

type FetchOutcome = {
    unavailable: string[];
    errors: Record<string, string>;
    attempted: Record<string, string>;
    /** Which trees came from the database rather than upstream. */
    fromStore: string[];
};

async function readStored(gameId: string, kind: GameConfigKind): Promise<unknown | null> {
    const row = await GameConfigModel.findOne({ where: { game_id: gameId, type: kind } });
    return row?.data ?? null;
}

async function writeStored(gameId: string, kind: GameConfigKind, data: unknown) {
    const existing = await GameConfigModel.findOne({ where: { game_id: gameId, type: kind } });

    if (existing) {
        await existing.update({ data: data as never });
        return;
    }

    await GameConfigModel.create({
        game_id: parseInt(gameId, 10),
        type: kind,
        data: data as never,
    });
}

/**
 * One tree, from the database if we've stored it, otherwise from upstream.
 *
 * Upstream stops serving these once a game completes, so a successful fetch is
 * written straight back — that copy is the only way a finished game keeps its
 * definitions.
 */
async function fetchTree(
    endpoint: TreeEndpoint,
    gameId: string,
    outcome: FetchOutcome
): Promise<unknown> {
    const kind = STORED_AS[endpoint];
    outcome.attempted[endpoint] = endpointUrl(endpoint, gameId);

    try {
        const stored = await readStored(gameId, kind);
        if (stored) {
            outcome.fromStore.push(endpoint);
            return stored;
        }
    } catch (error) {
        console.error(`Failed to read stored ${kind} for game ${gameId}:`, error);
    }

    try {
        const data = await apiFetch(endpoint, gameId);

        // Persisting is best-effort: a write failure shouldn't lose data we
        // already have in hand.
        await writeStored(gameId, kind, data).catch(error =>
            console.error(`Failed to store ${kind} for game ${gameId}:`, error));

        return data;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to fetch ${endpoint} for game ${gameId}:`, error);
        outcome.unavailable.push(endpoint);
        outcome.errors[endpoint] = message;
        return null;
    }
}

/**
 * Stores a definition payload directly.
 *
 * For games that already completed: upstream won't serve them any more, so the
 * payload has to be supplied from a saved copy.
 */
export async function storeProjectDefinition(
    gameId: string,
    kind: GameConfigKind,
    data: unknown
) {
    await writeStored(gameId, kind, data);
    cache.delete(gameId);
}

export async function getProjectDefinitions(gameId: string): Promise<ProjectDefinitions> {
    const cached = cache.get(gameId);
    if (cached) return cached;

    const outcome: FetchOutcome = { unavailable: [], errors: {}, attempted: {}, fromStore: [] };
    const [talents, teamProjects, personalProjects] = await Promise.all([
        fetchTree('get_talents', gameId, outcome),
        fetchTree('get_projects', gameId, outcome),
        fetchTree('get_personal_projects', gameId, outcome),
    ]);

    const definitions: ProjectDefinitions = {
        gameId,
        talents,
        teamProjects,
        personalProjects,
        unavailable: outcome.unavailable,
        errors: outcome.errors,
        attempted: outcome.attempted,
        hasAuthToken: hasAuthToken(),
        fromStore: outcome.fromStore,
    };

    // Only cache a complete set; a partial one would stick around after a
    // transient upstream failure.
    if (!outcome.unavailable.length) cache.set(gameId, definitions);

    return definitions;
}

export function invalidateProjectDefinitions(gameId?: string) {
    if (gameId) cache.delete(gameId);
    else cache.clear();
}
