import { DataTypes, ModelAttributes, ModelStatic, ModelOptions, InferAttributes, InferCreationAttributes, Sequelize } from "sequelize";
import { BaseModel } from "./base.model";
import { HqConfigModel } from "../types/apiResponses/hq.type";

/**
 * Which kind of config a row holds.
 *
 * A game has several definition payloads, not just the HQ config, and they all
 * live in this table keyed by (game_id, type). Storing them matters because the
 * upstream endpoints stop answering once a game completes — without a copy, a
 * finished game's project trees are simply gone.
 */
export const GAME_CONFIG_TYPES = ['hq', 'talents', 'projects', 'personal_projects'] as const;
export type GameConfigKind = typeof GAME_CONFIG_TYPES[number];

export class GameConfigModel extends BaseModel<InferAttributes<GameConfigModel>, InferCreationAttributes<GameConfigModel>> {
    declare game_id: number;
    declare type: GameConfigKind;
    declare data: HqConfigModel;
    declare created_at?: string | Date;
    declare updated_at?: string | Date;

    static modelAttributes(): ModelAttributes {
        return {
            ...super.modelAttributes(),
            game_id: {
                type: DataTypes.INTEGER
            },
            type: {
                type: DataTypes.STRING,
                allowNull: false
            },
            data: {
                type: DataTypes.JSON
            },
            created_at: {
                type: DataTypes.DATE,
                defaultValue: Sequelize.fn('now')
            },
            updated_at: {
                type: DataTypes.DATE,
                defaultValue: Sequelize.fn('now')
            }
        }
    }

    static modelOptions(): ModelOptions {
        return {
            ...super.modelOptions(),
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            modelName: 'GameConfig',
            tableName: 'game_config',
            indexes: [
                { fields: ['game_id', 'type'] }
            ]
        }
    }

    static associate(models: {[key: string]: ModelStatic<any>}): void {
        super.associate(models);
    }
}

export declare type GameConfigType = typeof GameConfigModel;
export declare type GameConfigCtor = {
    new (): GameConfigModel;
} & GameConfigModel;