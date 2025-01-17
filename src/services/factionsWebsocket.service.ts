import fs from 'fs';
import { RawJsonModel } from "../models/rawJson.model";
import { WorldUpdateModel } from "../models/activities/worldUpdate.model";
import { PlayerActivity, PlayerActivityType } from "../types/playerActivity.type";
import { CreationAttributes, InferAttributes, Op, Sequelize } from 'sequelize';
import { WorldUpdateAmountModel } from '../models/activities/worldUpdate.amount.model';

type QueueTypes = 'world_socket'

const saveInterval = 5000;
const queueLimit = 100;
const messageQueue: {[type in QueueTypes]: any[]} = { world_socket: [] };
const messageIntervals: {[type in QueueTypes]: NodeJS.Timeout } = { world_socket: null };

export async function handleMessage(type: QueueTypes, rawJson: any) {
    // Start up the save interval if it's not started.
    if (!messageIntervals[type]) {
        messageIntervals[type] = setInterval(() => saveMessages(type), saveInterval);
    }

    try {
        const queue = messageQueue[type];
        queue.push(rawJson);
    
        if (queue.length >= queueLimit) {
            saveMessages(type);
        }

    } catch (error) {
        console.error('Error processing Factions WebSocket:', error);
    }
}

async function saveMessages(type: QueueTypes) {
    const queue = messageQueue[type];
    if (queue.length === 0) {
        return;
    }

    const batch = queue.splice(0, queueLimit);
    const processedBatch = batch.map(obj => ({ type, data: obj }));
    try {
        await RawJsonModel.bulkCreate(processedBatch, { ignoreDuplicates: true });

        console.log(`Saved ${batch.length} raw json records.`);
    } catch (error) {
        console.error('Error saving Factions WebSocket raw:', error);
    }
}

export async function processWorldMessages(reprocess: boolean = false) {
    if (reprocess) {
        // Clear old data and re-process everything from json data.
        await WorldUpdateModel.destroy({ cascade: true, where: {} });
    }

    const type: QueueTypes = 'world_socket';
    // TODO: Change the processed check to be on the raw json table or amount table
    const unprocessedMessages = await RawJsonModel.findAll({
        attributes: ['id', 'data'],
        where: {
            type,
            id: {
                [Op.notIn]: Sequelize.literal(`(
                    SELECT DISTINCT
                        raw_json_id
                    FROM world_update_amount
                )`)
            }
        }
    });

    try {
        const processedIds = [];
        for (const rawJson of unprocessedMessages) {
            const data = rawJson.data;
            const activity = data.activity as PlayerActivity;
            if (data?.type === PlayerActivityType.INITIAL_ACTIVITIES) {
                // Do nothing for now
                // With activity ids we can check if we missed anything after a restart.
                continue;
            }
            if (activity?.id) {
                // Skip the id if it's already processed.
                if (processedIds.includes(activity.id)) {
                    continue;
                }
                processedIds.push (activity.id);

                // Find all duplicate id entries
                const amounts = unprocessedMessages
                    .filter(message => message.data?.activity?.id === activity.id)
                    .map(message => {
                        const activity = message.data.activity as PlayerActivity;
                        return {
                            amount: activity.amount,
                            updated_at: activity.updated_at,
                            raw_json_id: rawJson.id,
                            support_type: activity.name,
                            ...activity.data
                        };
                        
                    });
                // Upsert so we don't get an error on a race condition for the entry being created.
                const worldUpdate: CreationAttributes<WorldUpdateModel> & { amounts: CreationAttributes<WorldUpdateAmountModel>; } = {
                    ...activity,
                    player: activity.player.id,
                    name: activity.player.username,
                    amounts
                };

                saveWorldMessages(worldUpdate);
            }
        }
        saveWorldMessages(null, false);
    } catch (error) {
        // Print out the error for now so the process keeps running.
        console.log(error);
    }
    
}

const updateQueue: CreationAttributes<WorldUpdateModel>[] = [];
async function saveWorldMessages(model: CreationAttributes<WorldUpdateModel>, bulk: boolean = true) {
    if (model) {
        updateQueue.push(model);
    }

    if (!bulk || updateQueue.length >= queueLimit) {
        const batch = updateQueue.splice(0, queueLimit);
        WorldUpdateModel.bulkCreate(
            batch,
            {
                updateOnDuplicate: ['id'],
                include: [{
                    model: WorldUpdateAmountModel,
                    as: 'amounts'
                }]
            });
    }
}

export async function readWorldMessagesFile(path: string) {
    const file = fs.readFileSync(path).toString();
    file.split('\n').forEach(line => handleMessage('world_socket', JSON.parse(line)));
}