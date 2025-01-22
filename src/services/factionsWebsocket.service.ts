import fs from 'fs';
import { RawJsonModel } from "../models/rawJson.model";
import { WorldUpdateModel } from "../models/activities/worldUpdate.model";
import { PlayerActivity, PlayerActivityType } from "../types/playerActivity.type";
import { CreationAttributes } from 'sequelize';

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
        await RawJsonModel.update({ processed: false }, { where: {} });
    }

    const type: QueueTypes = 'world_socket';
    const unprocessedMessages = await RawJsonModel.findAll({
        attributes: ['id', 'data'],
        where: {
            type,
            processed: false
        },
        order: ['id']
    });

    try {
        const processedIds: number[] = [];
        const newActivity: CreationAttributes<WorldUpdateModel>[] = [];
        for (const message of unprocessedMessages) {
            const data = message.data;

            if (data?.hash) {
                // Mark hash updates as processed for now.
                // They can contain tile updates but I am not worrying about those right now.
                processedIds.push(message.id);
            }
            else if (data?.type === PlayerActivityType.INITIAL_ACTIVITIES) {
                // With activity ids we can check if we missed anything after a restart.
                const activityList = data.list as PlayerActivity[];
                for (const activity of activityList) {
                    newActivity.push({
                        ...parseActivityLine(activity, undefined),
                        raw_json_id: message.id
                    });
                }
                processedIds.push(message.id);
            }
            else if (data?.activity?.id) {
                // Process and add the normal activities
                newActivity.push({
                    ...parseActivityLine(data.activity, data.t),
                    raw_json_id: message.id
                });
                processedIds.push(message.id);
            }
        }

        // Remove duplicate entries within new entries
        const unduped: { [id: number]: CreationAttributes<WorldUpdateModel> } = {};
        newActivity.forEach(update => {
            const mostRecent = unduped[update.id]?.updated_at ?? 0;
            if (update.updated_at > mostRecent) {
                unduped[update.id] = update;
            }
        });
        WorldUpdateModel.bulkCreate(Object.values(unduped), {
            updateOnDuplicate: ['id']
        });

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

function parseActivityLine(activity: PlayerActivity, tileData: any) {
    // Upsert so we don't get an error on a race condition for the entry being created.
    const worldUpdate: CreationAttributes<WorldUpdateModel> = {
        ...activity,
        ...activity.data,
        support_type: activity.name,
        player_id: activity.player.id,
        player_name: activity.player.username,
        player_faction: activity.faction,
        tile_player: tileData?.p,
        tile_faction: tileData?.f,
        tile_soldiers: tileData?.s
    };

    return worldUpdate;
}

export async function readWorldMessagesFile(path: string) {
    const file = fs.readFileSync(path).toString();
    file.split('\n').forEach(line => handleMessage('world_socket', JSON.parse(line)));
}

export async function parseActivityFile(path: string) {
    const file = JSON.parse(fs.readFileSync(path).toString()) as any[];

    const newActivity: CreationAttributes<WorldUpdateModel>[] = [];
    for (const activity of file) {
        newActivity.push({
            ...parseActivityLine(activity, undefined),
            raw_json_id: -1
        });
    }
    WorldUpdateModel.bulkCreate(newActivity, {
        updateOnDuplicate: ['id']
    });
}