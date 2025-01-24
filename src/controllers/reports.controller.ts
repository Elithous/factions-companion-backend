import { generateSoldierStats } from "../services/reports/activityReport.service";

export async function getSoldierStats() {
    const stats = await generateSoldierStats();

    // Format for copy/paste into excel for now
    let excelString = '';
    const froms = Object.keys(stats).sort();
    for (const from of froms) {
        const toValues = Object.entries(stats[from]).sort((a, b) => b[1] - a[1]);
        for (const values of toValues) {
            excelString += `${values[1]},${from},${values[0]}\n`;
        }
    }

    return excelString;
}