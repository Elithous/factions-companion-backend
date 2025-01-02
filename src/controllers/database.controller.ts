import { Sequelize } from "sequelize";
import config from '../config/config';
import factionsConfig from '../config/factions.config';
import { WorldUpdateModel } from '../models/activities/worldUpdate.model';
import { RawJsonModel } from '../models/rawJson.model';
import { WorldUpdateAmountModel } from '../models/activities/worldUpdate.amount.model';

export let sequelize: Sequelize;

const models = [
    WorldUpdateModel,
    WorldUpdateAmountModel,
    RawJsonModel
];

export async function initDB() {
    sequelize = new Sequelize(
        `game-${factionsConfig.GAME_ID}`,
        config.DB_USER,
        config.DB_PASSWORD,
        {
            host: config.DB_HOST,
            dialect: 'mysql'
        }
    );

    try {
        sequelize.authenticate().then(() => {
            console.log('Connection has been established successfully.');
        });
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }

    // Initialize all db models.
    for (let model of models) {
        model.init(model.modelAttributes(), {
            sequelize,
            ...model.modelOptions()
        });
    }

    for (let model of models) {
        model.associate(sequelize.models);
    }

    await sequelize.sync();
}
