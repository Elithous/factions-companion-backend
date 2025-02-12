import { FactionColor } from "../types/faction.type";
import { apiFetch } from "../controllers/api.controller";

async function parseLeaderboard(gameId: string) {
    const rawJson = await apiFetch('get_leaderboard', gameId);

    let leaderboard: {
        [faction in FactionColor]: number
    } = rawJson.reduce((prev: { [faction in FactionColor]: number }, curr) => {
        return {
            ...prev,
            [curr.faction]: (prev[curr.faction] || 0) + curr.sentWorkers
        }
    }, {} as any);

    return leaderboard;
}

async function parseProjects(gameId: string) {
    const rawJson: {
        name: string,
        faction: FactionColor,
        hqLevel: number,
        sentSoldier: number,
        sentWorkers: number,
        casesCaptured: number
    }[] = await apiFetch('get_projects', gameId);

    let projects: {
        [faction in FactionColor]: number
    } = rawJson['event'].reduce((prev: any, curr: any) => {
        Object.keys(curr.workers).forEach(faction => {
            prev[faction] = (prev[faction] || 0) + curr.workers[faction]
        });
        return prev;
    }, {});

    return projects;
}

async function parseOldProjects(gameId: string) {
    const rawJson: {
        name: string,
        workers: { [faction in FactionColor]: number }
    }[] = await apiFetch('get_old_projects', gameId);

    let projects: {
        [faction in FactionColor]: number
    } = rawJson.reduce((prev: any, curr: any) => {
        Object.keys(curr.workers).forEach(faction => {
            prev[faction] = (prev[faction] || 0) + curr.workers[faction]
        });
        return prev;
    }, {});

    return projects;
}


async function showData(gameId: string) {
    let leaderboard = await parseLeaderboard(gameId);
    let projects = await parseProjects(gameId);
    let old = await parseOldProjects(gameId);
    

    console.log(leaderboard);
    console.log(projects);
    console.log(old);
}

export { parseLeaderboard, parseProjects, parseOldProjects, showData };