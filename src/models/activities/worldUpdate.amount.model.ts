import { DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, ModelAttributes, ModelOptions, ModelStatic, NonAttribute } from "sequelize";
import { BaseModel } from "../base.model";
import { WorldUpdateModel } from "./worldUpdate.model";

export class WorldUpdateAmountModel extends BaseModel<InferAttributes<WorldUpdateAmountModel>, InferCreationAttributes<WorldUpdateAmountModel>> {
    declare updated_at: number;
    declare amount: number;
    // soldiers
    declare captured: boolean;
    declare previous_faction: string;
    // support_sent
    declare support_type: string;
    declare kill: boolean;
    declare power: number;
    declare killed_faction: string;
    // workers
    declare project_type: string;

    declare raw_json_id: number;

    declare worldUpdate: NonAttribute<WorldUpdateModel>;
    declare world_update_parent: ForeignKey<WorldUpdateModel['id']>;

    static modelAttributes(): ModelAttributes {
        return {
            ...super.modelAttributes(),
            updated_at: {
                type: DataTypes.DECIMAL(16, 6)
            },
            amount: {
                type: DataTypes.INTEGER
            },
            captured: {
                type: DataTypes.BOOLEAN
            },
            previous_faction: {
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
            raw_json_id: {
                // I do not add this as a forgein key so associations aren't needed. This field is only for manual debugging anyway
                type: DataTypes.INTEGER
            }
        }
    }

    static modelOptions(): ModelOptions {
        return {
            ...super.modelOptions(),
            modelName: 'WorldUpdate_Amount',
            tableName: 'world_update_amount'
        }
    }

    static associate(models: {[key: string]: ModelStatic<any>}): void {
        super.associate(models);

        this.belongsTo(models.WorldUpdate, {
            as: 'worldUpdate',
            onDelete: 'CASCADE',
            foreignKey: {
                name: 'world_update_parent',
                allowNull: false
            }
        });
    }
}

export declare type WorldUpdateAmountType = typeof WorldUpdateAmountModel;
export declare type WorldUpdateAmountCtor = {
    new (): WorldUpdateAmountModel;
} & WorldUpdateAmountModel;