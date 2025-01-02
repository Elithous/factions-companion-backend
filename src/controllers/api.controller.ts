import { HqInfo } from "../types/hqInfo.type";

export type Endpoint = 'get_hq_info' | 'get_leaderboard' | 'get_projects' | 'get_old_projects';
const baseUrl = process.env.API_BASE_URL;

export async function apiFetch(endpoint: Endpoint, gameId: string = '0'): Promise<any> {
    const endpointMap: { [key in Endpoint]: string } = {
        get_hq_info: `${baseUrl}hq/info`,
        get_leaderboard: `${baseUrl}game/${gameId}/leaderboard`,
        get_projects: `${baseUrl}game/${gameId}/projects/list`,
        get_old_projects: `${baseUrl}game/${gameId}/projects/old`
    }

    const response = await fetch(endpointMap[endpoint], {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${process.env.AUTH_TOKEN}`
        }
    });

    if (!response.ok) {
        return Promise.reject(response.status);
    }

    return response.json();
}

export async function getHqInfo() {
    return (await apiFetch('get_hq_info')) as HqInfo;
}