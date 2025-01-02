import { FactionColor } from "./faction.type";

export type Leaderboard = {
    name: string,
    faction: FactionColor,
    hqLevel: number,
    sentSoldiers: number,
    sentWorkers: number,
    casesCaptures: number
}[];
