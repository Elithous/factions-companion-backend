import { Sequelize } from "sequelize";
import { dbConfig } from '../config';
import { ActivitiesModel } from '../models/activities/activities.model';
import { RawJsonModel } from '../models/rawJson.model';
import { SettingsModel } from "../models/setting.model";
import { GameConfigModel } from "../models/config.model";
import ReportCacheModel from "../models/reportCache.model";

export let sequelize: Sequelize;

const models = [
    ActivitiesModel,
    RawJsonModel,
    SettingsModel,
    GameConfigModel,
    ReportCacheModel
];

export async function initDB() {
    sequelize = new Sequelize(
        dbConfig.DB_NAME,
        dbConfig.DB_USER,
        dbConfig.DB_PASSWORD,
        {
            host: dbConfig.DB_HOST,
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
