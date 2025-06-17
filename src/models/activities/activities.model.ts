import {
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    ModelAttributes,
    ModelOptions,
    ModelStatic
} from "sequelize";
import { BaseModel } from "../base.model";
import { PlayerActivityType } from "../../types/playerActivity.type";
import { FactionColor } from "../../types/faction.type";

export class ActivitiesModel extends BaseModel<InferAttributes<ActivitiesModel>, InferCreationAttributes<ActivitiesModel>> {
    declare id: number;
    declare x: number;
    declare y: number;
    declare amount: number;
    declare type: PlayerActivityType;
    // soldiers
    declare captured: boolean;
    declare previous_faction: string;
    // support_sent
    declare support_type: string;
    declare kill: boolean;
    declare power: number;
    declare killed_faction: FactionColor | null;
    // workers
    declare project_type: string;

    // resources_sent
    declare iron: number;
    declare wood: number;
    declare recipient: string;

    // spec_picked
    declare name: string;

    declare player_id: number;
    declare player_name: string;
    declare player_faction: FactionColor | null;
    declare game_id: number;
    declare created_at: number;
    declare updated_at: number;

    declare tile_player: string | null;
    declare tile_faction: FactionColor | null;
    declare tile_soldiers: number | null;

    declare raw_json_id: number;

    static modelAttributes(): ModelAttributes {
        return {
            // Do not use super attributes as we are using the id from factions.
            id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true
            },
            x: {
                type: DataTypes.INTEGER
            },
            y: {
                type: DataTypes.INTEGER
            },
            amount: {
                type: DataTypes.INTEGER
            },
            type: {
                type: DataTypes.STRING
            },
            captured: {
                type: DataTypes.BOOLEAN
            },
            previous_faction: {
                type: DataTypes.STRING
            },
            support_type: {
                type: DataTypes.STRING
            },
            kill: {
                type: DataTypes.BOOLEAN
            },
            power: {
                type: DataTypes.DECIMAL(6,2)
            },
            killed_faction: {
                type: DataTypes.STRING
            },
            project_type: {
                type: DataTypes.STRING
            },
            iron: {
                type: DataTypes.INTEGER
            },
            wood: {
                type: DataTypes.INTEGER
            },
            recipient: {
                type: DataTypes.STRING
            },
            name: {
                type: DataTypes.STRING
            },
            player_id: {
                type: DataTypes.INTEGER
            },
            player_name: {
                type: DataTypes.STRING
            },
            player_faction: {
                type: DataTypes.STRING
            },
            game_id: {
                type: DataTypes.INTEGER
            },
            created_at: {
                type: DataTypes.DECIMAL(16, 6)
            },
            updated_at: {
                type: DataTypes.DECIMAL(16, 6)
            },
            tile_player: {
                type: DataTypes.STRING
            },
            tile_faction: {
                type: DataTypes.STRING
            },
            tile_soldiers: {
                type: DataTypes.INTEGER
            },
            raw_json_id: {
                // I do not add this as a forgein key so associations aren't needed. This field is only for manual debugging anyway
                type: DataTypes.INTEGER
            }
        }
    }

    static modelOptions(): ModelOptions {
        return {
            ...super.modelOptions(),
            modelName: 'Activities',
            tableName: 'activities'
        }
    }

    declare static associations: {}

    static associate(models: {[key: string]: ModelStatic<any>}): void {
        super.associate(models);
    }
}

export declare type ActivitiesType = typeof ActivitiesModel;
export declare type ActivitiesCtor = {
    new (): ActivitiesModel;
} & ActivitiesModel; 