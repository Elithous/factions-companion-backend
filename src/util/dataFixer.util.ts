import { Attributes, Op } from "sequelize";
import { ActivitiesModel } from "../models/activities/activities.model";
import { sequelize } from "../controllers/database.controller";

export async function addMissingTileData() {
    const entriesWithMissing = await ActivitiesModel.findAll({
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
        const previous = await getPreviousActivity(entry);
        
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

function getPreviousActivity(activity: Attributes<ActivitiesModel>) {
    // This is ugly but the easiest way I know to get the previous tile data.
    const subQuery = `(
                select
                    MAX(updated_at)
                from
                    activities
                where (1=1)
                    and type in ('soldiers_attack', 'soldiers_defend')
                    and x = ${activity.x}
                    and y = ${activity.y}
                    and updated_at < ${activity.updated_at}
            )`;

    return ActivitiesModel.findOne({
        where: {
            x: activity.x,
            y: activity.y,
            updated_at: { [Op.eq]: sequelize.literal(subQuery)}
        }
    });
}