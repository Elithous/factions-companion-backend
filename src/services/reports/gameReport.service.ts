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