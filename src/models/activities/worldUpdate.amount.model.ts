import { DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, ModelAttributes, ModelOptions, ModelStatic, NonAttribute } from "sequelize";
import { BaseModel } from "../base.model";
import { WorldUpdateModel } from "./worldUpdate.model";

export class WorldUpdateAmountModel extends BaseModel<InferAttributes<WorldUpdateAmountModel>, InferCreationAttributes<WorldUpdateAmountModel>> {
    declare updated_at: number;
    declare amount: number;
    declare data: any;

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
            data: {
                type: DataTypes.JSON
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