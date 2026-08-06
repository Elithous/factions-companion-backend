import { DataTypes, Sequelize } from "sequelize";
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
    if (dbConfig.DB_NAME === undefined|| dbConfig.DB_HOST === undefined
        || dbConfig.DB_USER === undefined || dbConfig.DB_PASSWORD === undefined) {
        throw new Error('Database configuration is missing. Please check your environment variables.');
    }

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
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');
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
    await runMigrations();
}

/**
 * Schema changes `sequelize.sync()` won't make on its own.
 *
 * `sync()` creates missing tables but never alters existing ones, so a column
 * added to a model after the table exists has to be applied by hand. Each step
 * checks before acting, so this is safe to run on every boot.
 */
async function runMigrations() {
    const queryInterface = sequelize.getQueryInterface();

    try {
        const gameConfig = await queryInterface.describeTable('game_config');

        if (!gameConfig.type) {
            await queryInterface.addColumn('game_config', 'type', {
                type: DataTypes.STRING,
                allowNull: false,
                // Everything already stored is an HQ config.
                defaultValue: 'hq'
            });
            console.log('Migration: added game_config.type');
        }
    } catch (error) {
        console.error('Migration failed for game_config.type:', error);
    }

    /**
     * The cross-game player index runs two grouped scans of `activities`.
     * Without covering indexes both are full table scans, which on a table this
     * size is slow enough to time the request out.
     *
     * These are built once and can take a while on an existing table; the log
     * lines say when each starts and finishes.
     */
    await addIndexIfMissing('activities', ['player_id', 'player_name', 'updated_at']);
    await addIndexIfMissing('activities', ['player_id', 'game_id']);
}

async function addIndexIfMissing(table: string, fields: string[]) {
    const name = `${table}_${fields.join('_')}`;

    try {
        const existing = await sequelize.getQueryInterface().showIndex(table) as { name: string }[];
        if (existing.some(index => index.name === name)) return;

        console.log(`Migration: building index ${name} (this can take a while)...`);
        await sequelize.getQueryInterface().addIndex(table, fields, { name });
        console.log(`Migration: added index ${name}`);
    } catch (error) {
        // Non-fatal: the queries still work, just slower.
        console.error(`Migration failed for index ${name}:`, error);
    }
}
