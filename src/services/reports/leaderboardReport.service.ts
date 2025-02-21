import { apiFetch } from "../../controllers/api.controller";
import { WorldUpdateModel } from "../../models/activities/worldUpdate.model";

export async function generatePlayerMvpLeaderboard(gameId: string) {
    const board = await apiFetch('get_leaderboard', gameId);

    const solderScoreMulti = +gameId <= 22 ? 2 : 1.8;

    const scores = board.map(entry => {
        const soldierScore = entry.sentSoldiers * solderScoreMulti;
        const workerScore = entry.sentWorkers;

        return {
            name: entry.name,
            faction: entry.faction,
            score: soldierScore + workerScore
        }
    });
    scores.sort((a, b) => b.score - a.score);

    return scores;
}