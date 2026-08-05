import { factionsConfig } from "../config";
import { HqConfigModel, HqEffectsModel, HqInfoModel } from "../types/apiResponses/hq.type";
import { FactionsGame } from "../types/apiResponses/factionsGame.type";
import { Leaderboard } from "../types/leaderboard.type";
import { PlayerActivity } from "../types/playerActivity.type";

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
    get_projects: { url: `${baseUrl}game/{gameId}/projects/list`, returnType: {} as any },
    get_old_projects: { url: `${baseUrl}game/{gameId}/projects/old`, returnType: {} as any },
    get_case_data: { url: `${baseUrl}game/{gameId}/activities/case`, returnType: [] as PlayerActivity[] },
    list_all_activities: { url: `${baseUrl}game/{gameId}/activities/list`, returnType: { items: [] as PlayerActivity[], count: 0 } },
    list_games: { url: `${baseUrl}games/list`, returnType: [] as FactionsGame[] }
}

export type Endpoint = keyof typeof endpointMap;
type EndpointReturnType<E extends Endpoint> = typeof endpointMap[E]['returnType'];

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