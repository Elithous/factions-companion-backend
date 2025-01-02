import {
    Association,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    ModelAttributes,
    ModelOptions,
    ModelStatic,
    NonAttribute,
    HasManyCreateAssociationMixin
} from "sequelize";
import { BaseModel } from "../base.model";
import { WorldUpdateAmountModel } from "./worldUpdate.amount.model";

export class WorldUpdateModel extends BaseModel<InferAttributes<WorldUpdateModel>, InferCreationAttributes<WorldUpdateModel>> {
    declare id: number;
    declare type: string;
    declare created_at: number;
    declare player: number;
    declare name: string;
    declare faction: string;
    declare game_id: number;
    declare x: number;
    declare y: number;
    declare raw_json_id: number;

    declare amounts?: NonAttribute<WorldUpdateAmountModel[]>;

    static modelAttributes(): ModelAttributes {
        return {
            // Do not use super attributes as we are using the id from factions.
            id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true
            },
            type: {
                type: DataTypes.STRING
            },
            created_at: {
                type: DataTypes.DECIMAL(16, 6)
            },
            player: {
                type: DataTypes.INTEGER
            },
            name: {
                type: DataTypes.STRING
            },
            faction: {
                type: DataTypes.STRING
            },
            game_id: {
                type: DataTypes.INTEGER
            },
            x: {
                type: DataTypes.INTEGER
            },
            y: {
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
            modelName: 'WorldUpdate',
            tableName: 'world_update'
        }
    }

    declare static associations: {
        amounts: Association<WorldUpdateModel, WorldUpdateAmountModel>;
    }

    static associate(models: {[key: string]: ModelStatic<any>}): void {
        super.associate(models);

        this.hasMany(models.WorldUpdate_Amount, {
            as: 'amounts',
            onDelete: 'CASCADE',
            foreignKey: {
                name: 'world_update_parent',
                allowNull: false
            }
        });
    }

    // Since TS cannot determine model association at compile time
    // we have to declare them here purely virtually
    // these will not exist until `Model.init` was called.
    declare createAmount: HasManyCreateAssociationMixin<WorldUpdateAmountModel, 'world_update_parent'>;
}

export declare type WorldUpdateType = typeof WorldUpdateModel;
export declare type WorldUpdateCtor = {
    new (): WorldUpdateModel;
} & WorldUpdateModel;