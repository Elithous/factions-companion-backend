/**
 * The building catalogue for a game, normalised for the frontend.
 *
 * Buildings are game-specific — they're added and retired between games, and
 * costs shift with each game's economy multipliers — so the frontend no longer
 * carries a copy. This reshapes the raw game config into the cost-curve form the
 * calculator works in.
 */

import { getAvailableGameIds, getConfig } from "./gameReport.service";

/** A cost that only starts applying once the level reaches `start`. */
export type CostEntry = {
    value: number;
    start: number;
};

export type BuildingCost = {
    wood: CostEntry;
    iron: CostEntry;
    worker: CostEntry;
};

export type BuildingEffect = {
    type: string;
    subtype?: string;
    base?: number;
    bonus?: number;
    multiplier?: number;
    perLevel?: boolean;
};

export type CatalogueBuilding = {
    name: string;
    /** May be empty — not every building belongs to a category. */
    category: string[];
    cost: BuildingCost;
    /** Minimum HQ level required to place it. */
    hq: number;
    baseEffects: BuildingEffect[];
    tiers: number;
    unique: boolean;
    requires: string | null;
    destructible: boolean;
    upgradeable: boolean;
    maxCount: number | null;
    shape: string | null;
};

export type BuildingCatalogue = {
    /** The game this catalogue came from, so callers can show which was used. */
    gameId: string;
    /** True when no game was requested and the newest was used instead. */
    isDefault: boolean;
    buildings: CatalogueBuilding[];
    hq: {
        cost: BuildingCost;
        baseEffects: BuildingEffect[];
    };
    /** Village baseline before any buildings are placed. */
    baseStorage: { wood: number; iron: number; soldiers: number; workers: number };
    /** Base per-tick wood the HQ produces on its own. */
    baseHqWoodOutput: number;
};

/**
 * Values the game config doesn't expose.
 *
 * They live here rather than in the frontend so all game numbers come from one
 * place; if the upstream config ever carries them, only this file changes.
 */
const BASE_STORAGE = { wood: 150, iron: 150, soldiers: 50, workers: 50 };
const BASE_HQ_WOOD_OUTPUT = 1;

/** The config's flat `{wood, iron, workers}` plus a start level, as a cost curve. */
function toCostCurve(
    cost: Record<string, number> | undefined,
    workersStart: number | undefined
): BuildingCost {
    return {
        wood: { value: cost?.wood ?? 0, start: 0 },
        iron: { value: cost?.iron ?? 0, start: 0 },
        // Worker cost only kicks in from a given level; everything else applies
        // from the first.
        worker: { value: cost?.workers ?? 0, start: workersStart ?? 0 },
    };
}

type RawBuilding = {
    name?: string;
    category?: string[];
    cost?: Record<string, number>;
    workersStart?: number;
    hq?: number;
    baseEffects?: BuildingEffect[];
    tiers?: number;
    unique?: boolean;
    requires?: string | null;
    destructible?: boolean;
    upgradeable?: boolean;
    maxCount?: number | null;
    shape?: string | null;
};

function toCatalogueBuilding(raw: RawBuilding): CatalogueBuilding | null {
    if (!raw?.name) return null;

    return {
        name: raw.name,
        category: raw.category ?? [],
        cost: toCostCurve(raw.cost, raw.workersStart),
        hq: raw.hq ?? 1,
        baseEffects: raw.baseEffects ?? [],
        tiers: raw.tiers ?? 1,
        unique: raw.unique ?? false,
        requires: raw.requires ?? null,
        destructible: raw.destructible ?? true,
        upgradeable: raw.upgradeable ?? true,
        maxCount: raw.maxCount ?? null,
        shape: raw.shape ?? null,
    };
}

/**
 * Catalogue for `gameId`, or for the newest game we hold config for when it's
 * omitted — the calculator has no game selected and still needs numbers.
 */
export async function generateBuildingCatalogue(gameId?: string): Promise<BuildingCatalogue> {
    const resolvedGameId = gameId ?? await getNewestGameId();
    if (!resolvedGameId) {
        throw new Error('No games available to build a catalogue from');
    }

    // The stored config type predates several fields the live payload carries
    // (workersStart, maxCount, misc.hqUpgrade), so it's read structurally.
    const config = await getConfig(resolvedGameId) as unknown as {
        buildings?: RawBuilding[];
        misc?: { hqUpgrade?: { baseCost?: Record<string, number>; workersStart?: number } };
    };

    const buildings = (config?.buildings ?? [])
        .map(toCatalogueBuilding)
        .filter((building): building is CatalogueBuilding => building !== null)
        .sort((a, b) => a.name.localeCompare(b.name));

    const hqUpgrade = config?.misc?.hqUpgrade;

    return {
        gameId: String(resolvedGameId),
        isDefault: gameId === undefined,
        buildings,
        hq: {
            cost: toCostCurve(hqUpgrade?.baseCost, hqUpgrade?.workersStart),
            // The HQ's own production isn't listed in the config the way a
            // building's is, so it's expressed here as one.
            baseEffects: [{ type: 'production', subtype: 'wood', base: 0.5 }],
        },
        baseStorage: { ...BASE_STORAGE },
        baseHqWoodOutput: BASE_HQ_WOOD_OUTPUT,
    };
}

async function getNewestGameId(): Promise<string | null> {
    const ids = await getAvailableGameIds();
    return ids.length ? String(ids[0]) : null;
}
