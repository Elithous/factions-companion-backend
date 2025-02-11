import { FactionColor } from '../faction.type';
import { CostModel } from '../cost.type';

export interface HqInfoModel {
    buildings: {
        id: number,
        level: number,
        name: string,
        upgradeCost: CostModel
    }[],
    hasActiveQuest: boolean,
    hq: {
        level: number,
        maxNumberOfBuildings: number,
        upgradeCost: CostModel,
        faction: FactionColor,
        specialization: string | null,
        sleepMode: boolean,
        ticksSpeed: number,
        role: string | null
    },
    unlocks: string[]
}

type EffectName = 'wood' | 'iron' | 'workers' | 'worker' | 'soldiers' | 'attack' | 'defense'
    | 'knight' | 'knightPower' | 'guardian' | 'guardianPower'

interface EffectDetail {
    type?: string;
    subtype?: string;
    base: number;
    from: string;
}

export interface HqEffectsModel {
    production: {
        [effect in EffectName]: {
            details: EffectDetail[];
            total: number;
        }
    },
    storage: {
        [effect in EffectName]: {
            details: EffectDetail[],
            total: number
        }
    },
    talent: {
        // TODO: Fill in once I have talent response
    },
    world: {
        [effect in EffectName]: {
            details: EffectDetail[],
            total: number
        }
    }
}

export interface HqConfigModel {
    buildings: {
        baseEffects: EffectDetail[],
        cost: CostModel,
        hq: number,
        name: string,
        requires: string | null,
        unique: boolean
    }[]
    knightBonus: number,
    guardianBonus: number,
    homeBonus: {
        [faction in FactionColor]: {
            [coord: string]: number
        }
    }
    mapConfig?: {
        author: string,
        description: string,
        forbidden_events: string[],
        forbidden_terrain_types: string[],
        home_bonus: number,
        home_radius: number,
        hqs_positions: {
            [faction in FactionColor]: { x: number, y: number}
        },
        name: string,
        terrain_bonus: {
            [name: string]: EffectDetail[]
        }
    },
    misc: {
        allowedFortification: (string | null)[],
        allowedImprovement: (string | null)[],
        fortificationTileLevels: number[],
        improvementTileLevels: number[],
        minNumberOfVotes: number,
        parameters: {
            building_iron_cost_multiplier: number,
            building_wood_cost_multiplier: number,
            building_worker_cost_multiplier: number,
            hq_iron_cost_multiplier: number,
            hq_wood_cost_multiplier: number,
            hq_worker_cost_multiplier: number
        },
        tileImprovementBonus: number
    },
    modeConfig: {
        base_project_cost: number,
        castle_capture_duration: number,
        estimated_duration: number,
        leaders: boolean,
        politic_system: boolean,
        project_duration: number,
        resource_multiplier: number,
        sleep_mode: boolean,
        storage_multiplier: number,
        tick_duration: number,
        tutorial: boolean,
        vp_objective: number
    },
    world: string[][]
}