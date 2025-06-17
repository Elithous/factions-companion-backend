import { apiFetch, getCaseData } from "../controllers/api.controller";
import { ActivitiesModel } from "../models/activities/activities.model";
import { FactionColor } from "../types/faction.type";
import { parseActivityLine } from "./factionsWebsocket.service";
import { getConfig } from "./reports/gameReport.service";

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

                ActivitiesModel.bulkCreate(activities, {
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

        ActivitiesModel.bulkCreate(activities, {
            updateOnDuplicate: ['id']
        });

        currentBatch++;
    } while (currentBatch * batchSize < count);
}


const tileSoldierDefaults = {
    'mine': 30,
    'tree': 30,
    'village': 50,
    'farm': 50,
    'bridge': 50,
    'temple': 200,
    'tower': 200,
    'city': 300,
    'mansion': 300,
    'castle': 500
};

export async function updateMissingTileData(gameId: string) {
    // Get game parameters for map size
    const config = await getConfig(gameId);

    const {width, height} = config.mapConfig;

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            // Get all tile history for this tile, sorted by time.
            const tileData = await ActivitiesModel.findAll({
                where: {
                    x, y,
                    game_id: gameId
                },
                order: [['updated_at', 'ASC']]
            });

            let tileFaction: FactionColor | null = 'NEUTRAL';
            let tilePlayer: string | null = null;

            const tileType = config.world[x][y];
            let tileSoldiers = tileSoldierDefaults[tileType] || 0;

            tileData.forEach((entry) => {
                if (entry.type === 'soldiers_attack') {
                    tileSoldiers -= entry.amount;
                    if (tileSoldiers < 0) {
                        tileFaction = entry.player_faction;
                        tilePlayer = entry.player_name;
                        tileSoldiers *= -1;
                    }
                    else if (tileSoldiers === 0) {
                        tileFaction = null;
                        tilePlayer = null;
                    }
                }

                if (entry.type === 'soldiers_defend') {
                    tileSoldiers += entry.amount;
                }

                if (entry.type === 'water_back') {
                    tilePlayer = null;
                    tileFaction = null;
                    tileSoldiers = null;
                }

                if (entry.type === 'barbarian_return') {
                    tilePlayer = null;
                    tileFaction = 'NEUTRAL';
                    tileSoldiers = entry.amount;
                }

                entry.tile_player = tilePlayer;
                entry.tile_faction = tileFaction;
                entry.tile_soldiers = tileSoldiers;

                entry.save();
            });

        }
    }
}