import { HqInfo } from "../types/hqInfo.type";
import { PlayerActivity } from "../types/playerActivity.type";

export type Endpoint = 'get_hq_info' | 'get_leaderboard' | 'get_projects' | 'get_old_projects' | 'get_case_data';
const baseUrl = process.env.API_BASE_URL;

export async function apiFetch(
    endpoint: Endpoint,
    gameId: string,
    options?: {
        options?: RequestInit,
        queryParams?: Record<string, string>
    }
): Promise<any> {
    const endpointMap: { [key in Endpoint]: string } = {
        get_hq_info: `${baseUrl}hq/info`,
        get_leaderboard: `${baseUrl}game/${gameId}/leaderboard`,
        get_projects: `${baseUrl}game/${gameId}/projects/list`,
        get_old_projects: `${baseUrl}game/${gameId}/projects/old`,
        get_case_data: `${baseUrl}game/${gameId}/activities/case`
    }
    let url = endpointMap[endpoint];
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
    return apiFetch('get_case_data', gameId, { queryParams: params }) as Promise<PlayerActivity[]>;
}