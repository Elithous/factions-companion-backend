import { DataTypes, ModelAttributes, ModelStatic, ModelOptions, InferAttributes, InferCreationAttributes, Sequelize } from "sequelize";
import { BaseModel } from "./base.model";

export class SettingsModel extends BaseModel<InferAttributes<SettingsModel>, InferCreationAttributes<SettingsModel>> {
    declare key: string;
    declare data: any;
    declare created_at?: string | Date;
    declare updated_at?: string | Date;

    static modelAttributes(): ModelAttributes {
        return {
            ...super.modelAttributes(),
            key: {
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
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            modelName: 'Setting',
            tableName: 'setting'
        }
    }

    static associate(models: {[key: string]: ModelStatic<any>}): void {
        super.associate(models);
    }
}

export declare type SettingsType = typeof SettingsModel;
export declare type SettingsCtor = {
    new (): SettingsModel;
} & SettingsModel;