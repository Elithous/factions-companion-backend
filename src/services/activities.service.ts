import { apiFetch, getCaseData } from "../controllers/api.controller";
import { WorldUpdateModel } from "../models/activities/worldUpdate.model";
import { parseActivityLine } from "./factionsWebsocket.service";

const delay = millis => new Promise((resolve, reject) => {
    setTimeout(_ => resolve(true), millis)
});

export async function saveAllCaseData(gameId: string) {
    if (gameId) {
        return;
    }

    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            try {
                const caseActivities = await getCaseData(gameId, x, y);

                const activities = [];
                for (const activity of caseActivities) {
                    activities.push(parseActivityLine(activity, undefined));
                }

                WorldUpdateModel.bulkCreate(activities, {
                    updateOnDuplicate: ['id']
                });

                await delay(200);

            }
            catch (err) {
                console.log(`Errored on ${x},${y}`);
                console.error(err);

                // Retry after an extended delay
                await delay(5000);
                y--;
            }
        }
    }
}

export async function savePastActivities(gameId: string) {
    const batchSize = 500;

    let currentBatch = 0;
    let count: number;

    do {
        const params = { limit: batchSize.toFixed(0), offset: (currentBatch * batchSize).toFixed(0) };
        const response = await apiFetch('list_all_activities', gameId, { queryParams: params });

        count = response.count;

        const activities = [];
        for (const activity of response.items) {
            activities.push(parseActivityLine(activity, undefined));
        }

        WorldUpdateModel.bulkCreate(activities, {
            updateOnDuplicate: ['id']
        });

        currentBatch++;
    } while (currentBatch * batchSize < count);
}