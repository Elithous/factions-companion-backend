import { DataTypes, ModelAttributes, ModelStatic, ModelOptions, InferAttributes, InferCreationAttributes, Sequelize } from "sequelize";
import { BaseModel } from "./base.model";
import { HqConfigModel } from "../types/apiResponses/hq.type";

export class GameConfigModel extends BaseModel<InferAttributes<GameConfigModel>, InferCreationAttributes<GameConfigModel>> {
    declare game_id: number;
    declare data: HqConfigModel;
    declare created_at?: string | Date;
    declare updated_at?: string | Date;

    static modelAttributes(): ModelAttributes {
        return {
            ...super.modelAttributes(),
            game_id: {
                type: DataTypes.INTEGER
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
            tableName: 'game_config'
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