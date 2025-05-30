import { Op } from "sequelize";
import { apiFetch } from "../../controllers/api.controller";
import { WorldUpdateModel } from "../../models/activities/worldUpdate.model";
import { GameConfigModel } from "../../models/config.model";
import { HqConfigModel } from "../../types/apiResponses/hq.type";

export async function getAvailableGameIds() {
    const gameIds = await WorldUpdateModel.findAll({
        attributes: ['game_id'],
        group: ['game_id'],
        order: [['game_id', 'DESC']]
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

export async function getConfig(gameId: string) {
    // TODO: Invalidate config after econ change
    const savedConfig = await GameConfigModel.findOne({ where: { game_id: gameId } });
    let config: HqConfigModel;
    if (!savedConfig) {
        config = await apiFetch('get_hq_config', gameId);

        GameConfigModel.create({
            game_id: parseInt(gameId),
            data: config
        });
    } else {
        config = savedConfig.data;
    }

    return config;
}

export async function getAllActivePlayers(gameId: string) {
    const players = await WorldUpdateModel.findAll({
        attributes: ['player_id', 'player_name'],
        where: {
            game_id: gameId,
            player_name: {
                [Op.not]: null
            }
        },
        group: ['player_id', 'player_name'],
        order: ['player_id']
    });

    return players;
}