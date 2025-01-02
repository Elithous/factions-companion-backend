import { FactionColor } from "./faction.type";

type BuildingName =
    'MINE' |
    'WOODCUTTER' |
    'TAVERN' |
    'HOUSE' |
    'STORAGE' |
    'BARRACK' |
    'TRAINING_CENTER' |
    'COMMAND_CENTER' |
    'KNIGHT_TRAINING_CENTER';

type SpecializationType = 'ATTACK' | 'DEFENSE';

type UpgradeCost = {
    wood?: number,
    iron?: number,
    workers?: number
};

export type HqInfo = {
    hq: {
        level: number,
        maxNumberOfBuildings: number,
        upgradeCost: UpgradeCost,
        faction: FactionColor,
        specialization: SpecializationType
    },
    buildings: {
        id: number,
        name: BuildingName,
        level: number,
        upgradeCost: UpgradeCost
    }[],
    unlocks: string[],
    hasActiveQuest: boolean
};
