import fs from 'fs';
import { RawJsonModel } from "../models/rawJson.model";
import { WorldUpdateModel } from "../models/activities/worldUpdate.model";
import { PlayerActivity, PlayerActivityType } from "../types/playerActivity.type";

export async function processWorldSocket(rawJson: any) {
    const rawEntry = await RawJsonModel.create({ type: 'world_socket', data: rawJson });

    const activity = rawJson.activity as PlayerActivity;
    if (rawJson?.type === PlayerActivityType.INITIAL_ACTIVITIES) {
        // Do nothing for now
        // With activity ids we can check if we missed anything after a restart.
        return;
    }
    if (activity?.id) {
        // Upsert so we don't get an error on a race condition for the entry being created.
        const [worldUpdate,] = await WorldUpdateModel.upsert({
            ...activity,
            player: activity.player.id,
            name: activity.player.username,
            raw_json_id: rawEntry.id
        });

        worldUpdate.createAmount({
            amount: activity.amount,
            updated_at: activity.updated_at,
            data: activity.data
        });
    }
}

export async function processHistoricalWorldSocket(path: string) {
    const file = fs.readFileSync(path).toString();
    file.split('\n').forEach(line => processWorldSocket(JSON.parse(line)));
}