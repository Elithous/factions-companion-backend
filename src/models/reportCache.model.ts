import { DataTypes, ModelAttributes, ModelStatic, ModelOptions, InferAttributes, InferCreationAttributes, Sequelize } from "sequelize";
import { BaseModel } from "./base.model";

export class ReportCacheModel extends BaseModel<InferAttributes<ReportCacheModel>, InferCreationAttributes<ReportCacheModel>> {
    declare game_id: string;
    declare report_type: string;
    declare parameters: string;
    declare data: any;
    declare created_at: string | Date;
    declare revalidate_at: string | Date;

    static modelAttributes(): ModelAttributes {
        return {
            ...super.modelAttributes(),
            game_id: {
                type: DataTypes.STRING,
                allowNull: false
            },
            report_type: {
                type: DataTypes.STRING,
                allowNull: false
            },
            parameters: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ''
            },
            data: {
                type: DataTypes.JSON,
                allowNull: false
            },
            created_at: {
                type: DataTypes.DATE,
                defaultValue: Sequelize.fn('now')
            },
            revalidate_at: {
                type: DataTypes.DATE,
                allowNull: false
            }
        }
    }

    static modelOptions(): ModelOptions {
        return {
            ...super.modelOptions(),
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: false,
            modelName: 'ReportCache',
            tableName: 'report_cache',
            indexes: [
                {
                    unique: true,
                    fields: ['game_id', 'report_type', 'parameters']
                }
            ]
        }
    }

    static associate(models: {[key: string]: ModelStatic<any>}): void {
        super.associate(models);
    }
}

export default ReportCacheModel; 