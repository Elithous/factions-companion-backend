import { DataTypes, ModelAttributes, ModelStatic, ModelOptions, InferAttributes, InferCreationAttributes, Sequelize } from "sequelize";
import { BaseModel } from "./base.model";

export class RawJsonModel extends BaseModel<InferAttributes<RawJsonModel>, InferCreationAttributes<RawJsonModel>> {
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
            tableName: 'raw_json'
        }
    }

    static associate(models: {[key: string]: ModelStatic<any>}): void {
        super.associate(models);
    }
}

export declare type RawJsonType = typeof RawJsonModel;
export declare type RawJsonCtor = {
    new (): RawJsonModel;
} & RawJsonModel;