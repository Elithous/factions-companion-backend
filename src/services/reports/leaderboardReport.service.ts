import { apiFetch } from "../../controllers/api.controller";
import { WorldUpdateModel } from "../../models/activities/worldUpdate.model";

export async function generatePlayerMvpLeaderboard(gameId: string) {
    const board = await apiFetch('get_leaderboard', gameId);

    const scores = board.map(entry => {
        return {
            name: entry.name,
            faction: entry.faction,
            score: (entry.sentSoldiers * 2) + entry.sentWorkers
        }
    });
    scores.sort((a, b) => b.score - a.score);

    return scores;
}