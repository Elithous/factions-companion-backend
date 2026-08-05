import { Request, Response } from 'express';

import { asyncHandler } from '../http/asyncHandler';
import { requireQuery } from '../http/queryParams';
import { getAllActivities } from '../services/reports/activityReport.service';
import {
    generateBuildingKillsLeaderboard,
    generateBuildingPillageLeaderboard,
    generateBuildingPlacementLeaderboard,
    generateBuildingSupplyLeaderboard,
} from '../services/reports/buildingReport.service';
import { generateLootActions } from '../services/reports/lootReport.service';
import {
    generateResourcesReceivedLeaderboard,
    generateResourcesSentLeaderboard,
} from '../services/reports/resourceReport.service';
import { generateTileLeaderboard } from '../services/reports/tileReport.service';

/**
 * Reports that take a game id and nothing else all look identical, so they're
 * generated from a single factory rather than written out one at a time.
 */
const byGameId = (generate: (gameId: string) => Promise<unknown>) =>
    asyncHandler(async (req: Request, res: Response) => {
        res.json(await generate(requireQuery(req, 'gameId')));
    });

export const getTileLeaderboard = byGameId(generateTileLeaderboard);
export const getLootActions = byGameId(generateLootActions);

export const getResourcesSentLeaderboard = byGameId(generateResourcesSentLeaderboard);
export const getResourcesReceivedLeaderboard = byGameId(generateResourcesReceivedLeaderboard);

export const getBuildingKillLeaderboard = byGameId(generateBuildingKillsLeaderboard);
export const getBuildingPillageLeaderboard = byGameId(generateBuildingPillageLeaderboard);
export const getBuildingPlacementLeaderboard = byGameId(generateBuildingPlacementLeaderboard);
export const getBuildingSupplyLeaderboard = byGameId(generateBuildingSupplyLeaderboard);

export const allActivities = asyncHandler(async (req: Request, res: Response) => {
    res.json(await getAllActivities({ game_id: requireQuery(req, 'gameId') }));
});
