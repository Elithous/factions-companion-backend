import { factionsConfig } from "../config";
import { HqConfigModel, HqEffectsModel, HqInfoModel } from "../types/apiResponses/hq.type";
import { FactionsGame } from "../types/apiResponses/factionsGame.type";
import { Leaderboard } from "../types/leaderboard.type";
import { PlayerActivity } from "../types/playerActivity.type";
import { PlayerProfileResponse } from "../types/apiResponses/playerProfile.type";

const baseUrl = factionsConfig.API_BASE_URL;

/**
 * Every upstream Factions endpoint the backend calls.
 *
 * `returnType` exists only to carry a type through to `apiFetch`'s return —
 * it is never read at runtime. `{gameId}` in a url is substituted per call.
 */
const endpointMap = {
    get_hq_info: { url: `${baseUrl}game/{gameId}/hq/info`, returnType: {} as HqInfoModel },
    get_hq_effects: { url: `${baseUrl}game/{gameId}/hq/effects`, returnType: {} as HqEffectsModel },
    get_hq_config: { url: `${baseUrl}game/{gameId}/hq/config`, returnType: {} as HqConfigModel },
    get_leaderboard: { url: `${baseUrl}game/{gameId}/leaderboard`, returnType: {} as Leaderboard },
    // The three project-tree definitions. Together they describe every node a
    // player can pick, which is what turns a bare `personal_activities` row into
    // a placed node with a parent and an effect.
    get_talents: { url: `${baseUrl}game/{gameId}/specialization/talents`, returnType: {} as unknown },
    get_projects: { url: `${baseUrl}game/{gameId}/projects/list`, returnType: {} as unknown },
    get_personal_projects: { url: `${baseUrl}game/{gameId}/projects/personal/list`, returnType: {} as unknown },
    get_old_projects: { url: `${baseUrl}game/{gameId}/projects/old`, returnType: {} as any },
    get_case_data: { url: `${baseUrl}game/{gameId}/activities/case`, returnType: [] as PlayerActivity[] },
    list_all_activities: { url: `${baseUrl}game/{gameId}/activities/list`, returnType: { items: [] as PlayerActivity[], count: 0 } },
    list_games: { url: `${baseUrl}games/list`, returnType: [] as FactionsGame[] },
    // Player-scoped rather than game-scoped: `{gameId}` carries the user id.
    get_player: { url: `${baseUrl}players/get/{gameId}`, returnType: {} as PlayerProfileResponse }
}

export type Endpoint = keyof typeof endpointMap;
type EndpointReturnType<E extends Endpoint> = typeof endpointMap[E]['returnType'];

/** The url an endpoint resolves to, for diagnostics. */
export function endpointUrl(endpoint: Endpoint, gameId: string): string {
    return endpointMap[endpoint].url.replace('{gameId}', gameId);
}

/** Whether an auth token is configured at all — the usual cause of a 401. */
export const hasAuthToken = () => !!factionsConfig.AUTH_TOKEN;

export async function apiFetch<E extends Endpoint>(
    endpoint: E,
    gameId: string,
    options?: {
        options?: RequestInit,
        queryParams?: Record<string, string>
    }
): Promise<EndpointReturnType<typeof endpoint>> {
    let url = endpointMap[endpoint].url.replace('{gameId}', gameId);

    if (options?.queryParams) {
        url += '?' + new URLSearchParams(options.queryParams).toString();
    }

    const response = await fetch(url, {
        ...(options?.options ?? {}),
        headers: {
            Authorization: `Bearer ${factionsConfig.AUTH_TOKEN}`
        }
    });

    if (!response.ok) {
        throw new Error(`Factions API ${endpoint} failed with status ${response.status}`);
    }

    return response.json();
}

/** Activity history for a single map tile. */
export function getCaseData(gameId: string, x: number, y: number) {
    return apiFetch('get_case_data', gameId, {
        queryParams: { x: x.toString(), y: y.toString() }
    });
}