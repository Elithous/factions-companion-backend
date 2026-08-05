import { Op } from "sequelize";
import { apiFetch } from "../../clients/factionsApi";
import { ActivitiesModel } from "../../models/activities/activities.model";
import { GameConfigModel } from "../../models/config.model";
import { HqConfigModel } from "../../types/apiResponses/hq.type";
import { FactionColor } from "../../types/faction.type";

export async function getAvailableGameIds() {
    const gameIds = await ActivitiesModel.findAll({
        attributes: ['game_id'],
        group: ['game_id'],
        order: [['game_id', 'DESC']]
    }).then(ids => 
        ids.map(id => id.game_id)
    );

    return gameIds;
}

export async function getTimespan(gameId: string) {
    const minTime = await ActivitiesModel.min('created_at', {
        where: {
            game_id: gameId
        }
    });
    const maxTime = await ActivitiesModel.max('created_at', {
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
    const players = await ActivitiesModel.findAll({
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

export type HqPosition = { x: number, y: number };

/** Where each faction's HQ sits on the map, per the game's map config. */
export async function getHqPositions(gameId: string): Promise<Partial<Record<FactionColor, HqPosition>>> {
    const config = await getConfig(gameId);
    return config?.mapConfig?.hqs_positions ?? {};
}

/**
 * The inverse of `getHqPositions`: each HQ's `"x:y"` tile to its owning faction.
 *
 * Loot events record the tile they hit rather than the team they hit, so the
 * loot reports use this to work out who was being looted.
 */
export async function getHqPositionLookup(gameId: string): Promise<Record<string, FactionColor>> {
    const positions = await getHqPositions(gameId);

    const lookup: Record<string, FactionColor> = {};
    for (const [faction, position] of Object.entries(positions)) {
        lookup[`${position.x}:${position.y}`] = faction as FactionColor;
    }

    return lookup;
}
