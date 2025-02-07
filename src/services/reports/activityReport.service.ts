import { InferAttributes, WhereOptions } from "sequelize";
import { WorldUpdateModel } from "../../models/activities/worldUpdate.model";

export async function generateSoldierStatsByFaction(filter?: WhereOptions<InferAttributes<WorldUpdateModel>>) {
    if (!filter) filter = {};
    const soldierData = await WorldUpdateModel.findAll({
        where: {
            ...filter,
            type: ['soldiers_attack', 'soldiers_defend']
        }
    });

    // Aggregate soldiers sent by faction and faction sent to
    const soldiersByFaction: { [sentFrom: string]: { [sentTo: string]: number } } = {}

    for (const entry of soldierData) {
        // If the previous faction is null, that means all soldiers should be considered defense.
        if (entry.previous_faction === null) {
            entry.previous_faction = entry.player_faction;
        }

        if (!soldiersByFaction[entry.player_faction]) {
            soldiersByFaction[entry.player_faction] = {};
        }
        if (!soldiersByFaction[entry.player_faction][entry.previous_faction]) {
            soldiersByFaction[entry.player_faction][entry.previous_faction] = 0;
        }
        if (!soldiersByFaction[entry.player_faction][entry.player_faction]) {
            soldiersByFaction[entry.player_faction][entry.player_faction] = 0;
        }

        // If there was overflow, apply the overflowed amount to the player faction
        if (entry.player_faction !== entry.previous_faction &&
            entry.amount >= entry.tile_soldiers) {
            soldiersByFaction[entry.player_faction][entry.player_faction] += entry.tile_soldiers;
            entry.amount -= entry.tile_soldiers;
        }

        soldiersByFaction[entry.player_faction][entry.previous_faction] += entry.amount;
    }

    return soldiersByFaction;
}

export async function generateSoldierStatsByTile(filter?: WhereOptions<InferAttributes<WorldUpdateModel>>) {
    if (!filter) filter = {};
    const soldierData = await WorldUpdateModel.findAll({
        where: {
            ...filter,
            type: ['soldiers_attack', 'soldiers_defend']
        }
    });

    // Aggregate soldiers sent by tile x and y
    const soldiersByTile: { [x: number]: { [y: number]: number } } = {}
    for (const entry of soldierData) {
        if (!soldiersByTile[entry.x]) {
            soldiersByTile[entry.x] = {};
        }
        if (!soldiersByTile[entry.x][entry.y]) {
            soldiersByTile[entry.x][entry.y] = 0;
        }
        soldiersByTile[entry.x][entry.y] += entry.amount;
    }

    return soldiersByTile;
}