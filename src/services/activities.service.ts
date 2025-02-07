import { getCaseData } from "../controllers/api.controller";
import { WorldUpdateModel } from "../models/activities/worldUpdate.model";
import { parseActivityLine } from "./factionsWebsocket.service";

const delay = millis => new Promise((resolve, reject) => {
    setTimeout(_ => resolve(true), millis)
});

export async function saveAllCaseData(gameId: string) {
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
