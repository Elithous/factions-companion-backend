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
        await RawJsonModel.update({ processed: false }, { where: {}});
    }

    const type: QueueTypes = 'world_socket';
    // TODO: Change the processed check to be on the raw json table or amount table
    const unprocessedMessages = await RawJsonModel.findAll({
        attributes: ['id', 'data'],
        where: {
            type,
            processed: false
        },
        order: ['id']
    });
    // "Preprocess" some aspects of each message
    const activityMessages: RawJsonModel[] = [];
    for (let index = 0; index < unprocessedMessages.length; index++) {
        const message = unprocessedMessages[index];
        if (message.data?.activity?.id) {
            // I process data with activity ids by groups so I remove it from the unprocessed array into a new array.
            activityMessages.push(unprocessedMessages.splice(index--, 1)[0]);
        }
    }

    // Sort the activity messages so the same activity ids are next to each other
    activityMessages.sort((a, b) => a.data.activity.id - b.data.activity.id);

    try {
        const processedIds = [];
        for (let index = 0; index < unprocessedMessages.length; index++) {
            const dataId = unprocessedMessages[index].id;
            const data = unprocessedMessages[index].data;
            if (data?.type === PlayerActivityType.INITIAL_ACTIVITIES) {
                // Do nothing for now
                // With activity ids we can check if we missed anything after a restart.
                continue;
            }
        }

        for (let index = 0; index < activityMessages.length; index++) {
            const dataId = activityMessages[index].id;
            const activity = activityMessages[index].data.activity;
            
            // Skip the id if it's already processed. This is for sanity as we should be skipping 
            if (processedIds.includes(dataId)) {
                continue;
            }

            // Find all duplicate id entries
            const groupActivities = [];
            // Use the top level index so we don't re-process the duplicate id entries
            for (; index < activityMessages.length; index++) {
                if (activity.id === activityMessages[index].data.activity.id) {
                    groupActivities.push(activityMessages[index]);
                }
                else {
                    index--;
                    // Messages are sorted by id so all paired ids will be adjacent
                    break;
                }
            }

            const amounts: CreationAttributes<WorldUpdateAmountModel>[] = groupActivities
                .map<CreationAttributes<WorldUpdateAmountModel>>(message => {
                    processedIds.push(dataId);

                    const activity = message.data.activity as PlayerActivity;
                    const tileData = message.data.t;
                    return {
                        amount: activity.amount,
                        updated_at: activity.updated_at,
                        raw_json_id: dataId,
                        support_type: activity.name,
                        tile_faction: tileData?.f,
                        tile_soldiers: tileData?.s,
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
            
            if (index % 1000 === 0) console.log(`${index}/${activityMessages.length}`);
            saveWorldMessages(worldUpdate);
        }

        saveWorldMessages(null, false);

        // Update processed flag for processed json messages
        RawJsonModel.update({
            processed: true
        }, {
            where: {
                id: processedIds
            }
        });

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