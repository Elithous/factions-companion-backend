import { DateTime } from 'luxon';
import { FactionColor } from "./faction.type";

type ProjectName =
    'COMMAND_CENTER' |
    'DEFENSE';

export type CurrentProjects = {
    permanent: {
        id: number,
        name: ProjectName,
        cost: number,
        baseEffect?: {
            type: string,
            subtype: string,
            bonus: number
        }[],
        type?: 'building' | 'ui',
        unlock: string,
        requires: string[],
        completed: boolean,
        unlocked: boolean,
        workers: number,
        created: DateTime
    }[],
    event: {
        id: number,
        name: string,
        min: number,
        max: number,
        effectType?: string,
        baseEffects: {
            type: string,
            subtype: string,
            base?: number,
            bonus?: number
        }[],
        gain: {},
        hiddenProgress: boolean,
        endDate: DateTime,
        workers: { [faction in FactionColor]: number }
    }[],
    last: {
        id: number,
        name: string,
        min: number,
        max: number,
        effectType?: string,
        baseEffects: {
            type: string,
            subtype: string,
            base?: number,
            bonus?: number
        }[],
        gain: {},
        bonus?: number,
        faction: FactionColor,
        created: DateTime,
        workers: { [faction in FactionColor]: number }
    }[]
};
