import { DataTypes, ModelAttributes, ModelStatic, ModelOptions, InferAttributes, InferCreationAttributes, Sequelize } from "sequelize";
import { BaseModel } from "./base.model";

export class GameSettingsModel extends BaseModel<InferAttributes<GameSettingsModel>, InferCreationAttributes<GameSettingsModel>> {
    declare tag: string;
    declare data: any;
    declare created_at: string | Date;
    declare updated_at: string | Date;

    static modelAttributes(): ModelAttributes {
        return {
            ...super.modelAttributes(),
            tag: {
                type: DataTypes.STRING
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
            modelName: 'GameSetting',
            tableName: 'game_setting'
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