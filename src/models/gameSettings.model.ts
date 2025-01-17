import { DataTypes, ModelAttributes, ModelStatic, ModelOptions, InferAttributes, InferCreationAttributes, Sequelize } from "sequelize";
import { BaseModel } from "./base.model";

export class GameSettingsModel extends BaseModel<InferAttributes<GameSettingsModel>, InferCreationAttributes<GameSettingsModel>> {
    declare type: string;
    declare data: any;
    declare created_at: string | Date;

    static modelAttributes(): ModelAttributes {
        return {
            ...super.modelAttributes(),
            type: {
                type: DataTypes.STRING
            },
            data: {
                type: DataTypes.JSON
            },
            created_at: {
                type: DataTypes.DATE,
                defaultValue: Sequelize.fn('now')
            }
        }
    }

    static modelOptions(): ModelOptions {
        return {
            ...super.modelOptions(),
            modelName: 'RawJson',
            tableName: 'raw_json'
        }
    }

    static associate(models: {[key: string]: ModelStatic<any>}): void {
        super.associate(models);
    }
}

export declare type GameSettingsType = typeof GameSettingsModel;
export declare type GameSettingsCtor = {
    new (): GameSettingsModel;
} & GameSettingsModel;