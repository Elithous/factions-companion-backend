import { ModelStatic, ModelOptions, ModelAttributes, DataTypes, Model, CreationOptional} from "sequelize";

export class BaseModel<
    TModelAttributes extends {},
    TModelCreationAttributes extends {}
> extends Model<
    TModelAttributes,
    TModelCreationAttributes
> {
    declare id: CreationOptional<number>;

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