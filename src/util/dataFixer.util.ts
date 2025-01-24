import { Attributes, Op } from "sequelize";
import { WorldUpdateModel } from "../models/activities/worldUpdate.model";
import { sequelize } from "../controllers/database.controller";

export async function addMissingTileData() {
    const entriesWithMissing = await WorldUpdateModel.findAll({
        where: {
            type: ['soldiers_attack', 'soldiers_defend'],
            [Op.or]: {
                tile_soldiers: { [Op.eq]: null },
                [Op.and]: {
                    tile_soldiers: { [Op.ne]: 0 },
                    tile_faction: { [Op.eq]: null }
                }
            }
        },
        order: ['updated_at']
    });

    for (const entry of entriesWithMissing) {
        const previous = await getPreviousWorldUpdate(entry);
        
        // Default to tiles staying the same
        entry.tile_faction = previous?.tile_faction ?? entry.player_faction;
        entry.tile_player = previous?.tile_player ?? entry.player_name;
        // If it's a defence, add amount to tile.
        entry.tile_soldiers = (previous?.tile_soldiers ?? 0) + (entry.type === 'soldiers_defend' ? entry.amount : 0);

        if (entry.type === 'soldiers_attack') {
            // If it's an attack, remove soldiers from tile, then check for a capture.
            entry.tile_soldiers -= entry.amount;
            if (entry.tile_soldiers < 0) {
                // Tile was captured
                entry.tile_player = entry.player_name;
                entry.tile_faction = entry.player_faction;
                entry.tile_soldiers *= -1; // Overflow soldiers are added to defence
            }
            else if (entry.tile_soldiers === 0) {
                // Tile was neutralized
                entry.tile_player = entry.player_name;
                entry.tile_faction = null;
                entry.tile_soldiers = 0;
            }
        }
        
        await entry.save();
    }
}

function getPreviousWorldUpdate(worldUpdate: Attributes<WorldUpdateModel>) {
    // This is ugly but the easiest way I know to get the previous tile data.
    const subQuery = `(
                select
                    MAX(updated_at)
                from
                    world_update
                where (1=1)
                    and type in ('soldiers_attack', 'soldiers_defend')
                    and x = ${worldUpdate.x}
                    and y = ${worldUpdate.y}
                    and updated_at < ${worldUpdate.updated_at}
            )`;

    return WorldUpdateModel.findOne({
        where: {
            x: worldUpdate.x,
            y: worldUpdate.y,
            updated_at: { [Op.eq]: sequelize.literal(subQuery)}
        }
    });
}