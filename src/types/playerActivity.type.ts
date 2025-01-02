import { FactionColor } from "./faction.type";

export interface PlayerActivity {
    id: number
    type: PlayerActivityType
    created_at: number
    updated_at: number
    player: {
        id: number
        username: string
    }
    name?: string
    faction?: FactionColor
    game_id?: number
    x?: number
    y?: number
    amount?: number
    data?: any
};

export enum PlayerActivityType {
    INITIAL_ACTIVITIES = "initial_activities",
    PAGE_LOADED = "page_loaded",
    BUILDING_BUILT = "building_built",
    BUILDING_UPGRADED = "building_upgraded",
    HQ_UPGRADED = "hq_upgraded",
    PROJECT_WORKERS_SENT = "workers_sent",
    EVENT_PROJECT_WORKERS_SENT = "event_workers_sent",
    SOLDIERS_ATTACK = "soldiers_attack",
    SOLDIERS_DEFEND = "soldiers_defend",
    IMPROVEMENT_WORKERS_SENT = "improvement_workers_sent",
    FORTIFICATION_WORKERS_SENT = "fortification_workers_sent",
    DISMANTLE_WORKERS_SENT = "dismantle_workers_sent",
    LOOT = "loot",
    SUPPORT_SENT = "support_sent",
    ROLE_CHANGED = "role_changed",
    SPEC_PICKED = "spec_picked",
    PING = "ping",

    // faction related
    EVENT_PROJECT_COMPLETED = "event_project_completed",
    PROJECT_COMPLETED = "project_completed",
    // event related
    WATER_BACK = "water_back",
    BARBARIAN_RETURN = "barbarian_return",
};