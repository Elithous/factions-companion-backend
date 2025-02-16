import { WorldUpdateModel } from "../../models/activities/worldUpdate.model";

export async function getAvailableGameIds() {
    const gameIds = await WorldUpdateModel.findAll({
        attributes: ['game_id'],
        group: ['game_id']
    }).then(ids => 
        ids.map(id => id.game_id)
    );

    return gameIds;
}

export async function getTimespan(gameId: string) {
    const minTime = await WorldUpdateModel.min('created_at', {
        where: {
            game_id: gameId
        }
    });
    const maxTime = await WorldUpdateModel.max('created_at', {
        where: {
            game_id: gameId
        }
    });

    return [minTime, maxTime];
}