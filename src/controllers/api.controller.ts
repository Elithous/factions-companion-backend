import { HqConfigModel, HqEffectsModel, HqInfoModel } from "../types/apiResponses/hq.type";
import { FactionsGame } from "../types/apiResponses/factionsGame.type";
import { Leaderboard } from "../types/leaderboard.type";
import { PlayerActivity } from "../types/playerActivity.type";

const baseUrl = process.env.API_BASE_URL;
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
    let url = endpointMap[endpoint].url;

    // Replace string substitutions
    const replacements = { gameId };
    url = url.replace( // https://stackoverflow.com/a/61634647
        /{(\w+)}/g,
        (placeholderWithDelimiters, placeholderWithoutDelimiters) =>
            replacements.hasOwnProperty(placeholderWithoutDelimiters) ?
                replacements[placeholderWithoutDelimiters] : placeholderWithDelimiters
    );

    if (options?.queryParams) {
        url += '?' + new URLSearchParams(options.queryParams).toString();
    }

    const response = await fetch(url, {
        ...(options?.options ?? {}),
        headers: {
            Authorization: `Bearer ${process.env.AUTH_TOKEN}`
        }
    });

    if (!response.ok) {
        return Promise.reject(response.status);
    }

    return response.json();
}

// export async function getHqInfo() {
//     return (await apiFetch('get_hq_info')) as HqInfo;
// }

export async function getCaseData(gameId: string, x: number, y: number) {
    const params = { x: x.toString(), y: y.toString() };
    return apiFetch('get_case_data', gameId, { queryParams: params });
}