import { generateSoldierStats } from "../services/reports/activityReport.service";

export async function getSoldierStats() {
    return await generateSoldierStats();
}