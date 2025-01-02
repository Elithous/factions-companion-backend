import { ModelStatic, ModelOptions, ModelAttributes, DataTypes, Model} from "sequelize";

export class BaseModel<
    TModelAttributes,
    TModelCreationAttributes
> extends Model<
    TModelAttributes,
    TModelCreationAttributes
> {
    declare id: number;

    static modelAttributes(): ModelAttributes {
            return {
                id: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    autoIncrement: true,
                    primaryKey: true
                }
            }
        }
    
    static modelOptions(): ModelOptions {
        return {
            timestamps: false,
            createdAt: false,
            updatedAt: false
        }
    }
    
    static associate(models: {[key: string]: ModelStatic<any>}): void {}
}