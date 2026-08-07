/**
 * Everything that happened on a single tile, for the stats page's tile drill-down.
 *
 * The other tile report (`tileReport.service`) answers "who held the most tiles";
 * this one answers "what happened *here*". It pulls the full activity history for
 * one coordinate in a single query and derives five views from it:
 *
 *   - support units sent to the tile (and what they killed)
 *   - how long each faction held the tile
 *   - what each individual player sent
 *   - soldiers destroyed here by buildings sitting on *other* tiles
 *   - workers sent into fortifications / improvements
 *
 * Ownership durations are the one section that can't honour the player/faction
 * filters: a duration is only meaningful against the tile's unbroken history, so
 * filtering rows out mid-timeline would produce nonsense. It honours the date
 * window (by clipping segments) and ignores the rest.
 *
 * HQ tiles are a special case. They can't be captured, so ownership is
 * meaningless there — those tiles report looting instead.
 */

import { InferAttributes, WhereOptions } from "sequelize";

import { ActivitiesModel } from "../../models/activities/activities.model";
import { FactionColor } from "../../types/faction.type";
import {
    getHqPositionLookup,
    getTerrainAt,
    getTimespan,
    hasNeutralDefenders,
} from "./gameReport.service";
import { getPlayerNames } from "./playerIdentity.service";
import { ReportType, withReportCache } from "./reportCache.service";

/** Worker deliveries aimed at a map tile rather than the player's own village. */
const WORKER_TYPES = [
    'fortification_workers_sent',
    'improvement_workers_sent',
    'dismantle_workers_sent',
    'workers_sent',
    'event_workers_sent',
] as const;

const UNOWNED = 'UNOWNED';

/**
 * `map_building_activated` rows are logged against the tile that was hit, so the
 * building's own coordinates live somewhere in the activity's `data` blob. The
 * upstream payload isn't versioned and has used a few different spellings, so we
 * probe the plausible keys rather than hard-coding one.
 */
const SOURCE_X_KEYS = ['building_x', 'source_x', 'from_x', 'origin_x', 'src_x', 'bx'];
const SOURCE_Y_KEYS = ['building_y', 'source_y', 'from_y', 'origin_y', 'src_y', 'by'];

/** Filters the caller may narrow the drill-down with. */
export interface TileDetailFilter {
    playerId?: number;
    /** Faction of the player taking the action. */
    fromFaction?: string;
    /** Faction that held the tile before the action. */
    toFaction?: string;
    dateStart?: number;
    dateEnd?: number;
}

export interface TileSupportTypeEntry {
    supportType: string;
    faction: string;
    count: number;
    units: number;
    kills: number;
    power: number;
}

export interface TileSupportPlayerEntry {
    player: string;
    playerId: number | null;
    faction: string;
    count: number;
    units: number;
    kills: number;
    power: number;
}

export interface TileSupportSummary {
    totalEvents: number;
    totalUnits: number;
    totalKills: number;
    byType: TileSupportTypeEntry[];
    byPlayer: TileSupportPlayerEntry[];
}

export interface TileOwnershipSegment {
    faction: string;
    player: string | null;
    startTime: number;
    endTime: number;
    seconds: number;
    /** Who held it immediately before this segment. */
    capturedFrom: string | null;
    /** Whose attack opened this segment. Null for the pre-first-capture segment. */
    capturedBy: string | null;
    /** Stable id for `capturedBy`, where the capturing actor was identifiable. */
    capturedById: number | null;
}

export interface TileOwnershipFactionEntry {
    faction: string;
    seconds: number;
    percent: number;
    captures: number;
    longestHoldSeconds: number;
}

export interface TileOwnershipSummary {
    windowStart: number;
    windowEnd: number;
    trackedSeconds: number;
    /** Changes credited to a player who was fighting for the new owner. */
    totalCaptures: number;
    /** Every change of hands, including resets to neutral/unowned. */
    totalChanges: number;
    currentFaction: string | null;
    currentPlayer: string | null;
    /** Who held the tile at the start of the game, before any activity. */
    startingFaction: string;
    /** Terrain type from the map config, when it was available. */
    terrain: string | null;
    byFaction: TileOwnershipFactionEntry[];
    segments: TileOwnershipSegment[];
    /** True when the date filter clipped the timeline. */
    dateFiltered: boolean;
}

export interface TileLootFactionEntry {
    faction: string;
    vp: number;
    loots: number;
    players: number;
}

export interface TileLootPlayerEntry {
    player: string;
    playerId: number | null;
    faction: string;
    vp: number;
    loots: number;
    firstLoot: number | null;
    lastLoot: number | null;
}

/** Looting against an HQ tile, which stands in for ownership on those tiles. */
export interface TileLootSummary {
    /** The faction whose HQ sits on this tile. */
    hqFaction: string;
    totalVp: number;
    totalLoots: number;
    firstLoot: number | null;
    lastLoot: number | null;
    byFaction: TileLootFactionEntry[];
    byPlayer: TileLootPlayerEntry[];
}

export interface TilePlayerEntry {
    player: string;
    playerId: number | null;
    faction: string;
    soldiersAttack: number;
    soldiersDefend: number;
    soldiersTotal: number;
    attacks: number;
    defends: number;
    captures: number;
    supportSent: number;
    workersSent: number;
    actions: number;
    firstAction: number | null;
    lastAction: number | null;
}

export interface TileBuildingKillSource {
    /** Building's own coordinates, when the payload exposed them. */
    x: number | null;
    y: number | null;
    building: string;
    faction: string;
    activations: number;
    soldiersDestroyed: number;
    /** Chebyshev distance from this tile, when the source is known. */
    distance: number | null;
}

export interface TileBuildingKillSummary {
    totalActivations: number;
    totalSoldiersDestroyed: number;
    /** Activations whose source coordinates couldn't be read from the payload. */
    unknownSourceCount: number;
    sources: TileBuildingKillSource[];
}

export interface TileWorkerProjectEntry {
    activityType: string;
    projectType: string;
    events: number;
    workers: number;
}

export interface TileWorkerPlayerEntry {
    player: string;
    playerId: number | null;
    faction: string;
    events: number;
    workers: number;
}

export interface TileWorkerSummary {
    totalEvents: number;
    totalWorkers: number;
    fortificationWorkers: number;
    improvementWorkers: number;
    dismantleWorkers: number;
    byProject: TileWorkerProjectEntry[];
    byPlayer: TileWorkerPlayerEntry[];
}

export interface TileDetailReport {
    tile: { x: number; y: number };
    activityCount: number;
    /** Terrain type from the map config, when it was available. */
    terrain: string | null;
    support: TileSupportSummary;
    /** Null on HQ tiles, which report `loot` instead. */
    ownership: TileOwnershipSummary | null;
    /** Only set when the tile holds a faction HQ. */
    loot: TileLootSummary | null;
    players: TilePlayerEntry[];
    buildingKills: TileBuildingKillSummary;
    workers: TileWorkerSummary;
}

export function generateTileDetail(
    gameId: string,
    x: number,
    y: number,
    filter: TileDetailFilter = {}
) {
    // Date-bounded requests are effectively unique, so they'd only pollute the
    // cache table — mirror the behaviour of withFilteredReportCache and skip it.
    if (filter.dateStart || filter.dateEnd) {
        return buildTileDetail(gameId, x, y, filter);
    }

    return withReportCache(
        gameId,
        ReportType.TILE_DETAIL,
        () => buildTileDetail(gameId, x, y, filter),
        { x, y, ...filter }
    );
}

/** Reads a numeric field out of an activity's `data` blob, trying several keys. */
function readNumber(data: Record<string, unknown> | null, keys: string[]): number | null {
    if (!data) return null;

    for (const key of keys) {
        const value = data[key];
        if (value === null || value === undefined || value === '') continue;

        const parsed = Number(value);
        if (!isNaN(parsed)) return parsed;
    }

    return null;
}

/** Nested `{ building: { x, y } }` style payloads, as a fallback. */
function readNestedPosition(data: Record<string, any> | null): { x: number; y: number } | null {
    if (!data) return null;

    for (const key of ['building', 'source', 'origin', 'from']) {
        const nested = data[key];
        if (nested && typeof nested === 'object' && nested.x !== undefined && nested.y !== undefined) {
            const x = Number(nested.x);
            const y = Number(nested.y);
            if (!isNaN(x) && !isNaN(y)) return { x, y };
        }
    }

    return null;
}

const asData = (activity: ActivitiesModel) =>
    (activity.data ?? null) as Record<string, any> | null;

const factionOf = (value: string | null | undefined) => value || UNOWNED;

async function buildTileDetail(
    gameId: string,
    x: number,
    y: number,
    filter: TileDetailFilter
): Promise<TileDetailReport> {
    const where: WhereOptions<InferAttributes<ActivitiesModel>> = { game_id: gameId, x, y };

    // The whole history is fetched once; every section below is derived in memory.
    // Ownership needs the unfiltered rows, so narrowing happens per-section rather
    // than in the query.
    const [activities, [gameStart, gameEnd], terrain, hqLookup, playerNames] = await Promise.all([
        ActivitiesModel.findAll({
            where,
            order: [['updated_at', 'ASC'], ['id', 'ASC']],
        }),
        getTimespan(gameId),
        getTerrainAt(gameId, x, y),
        // An unreachable map config shouldn't sink the report — fall back to
        // treating the tile as a normal one.
        getHqPositionLookup(gameId).catch(() => ({} as Record<string, FactionColor>)),
        getPlayerNames(),
    ]);

    const hqFaction = hqLookup[`${x}:${y}`] ?? null;

    const matchesFilter = (activity: ActivitiesModel) => {
        if (filter.playerId !== undefined && activity.player_id !== filter.playerId) return false;
        if (filter.fromFaction && !equalsFaction(activity.player_faction, filter.fromFaction)) return false;
        if (filter.toFaction && !equalsFaction(activity.previous_faction, filter.toFaction)) return false;
        if (filter.dateStart && Number(activity.created_at) < filter.dateStart) return false;
        if (filter.dateEnd && Number(activity.created_at) > filter.dateEnd) return false;
        return true;
    };

    const filtered = activities.filter(matchesFilter);

    // An HQ can never change hands, so ownership would just be one flat segment.
    // Looting is the thing that actually happens on those tiles.
    const isHq = hqFaction !== null;

    // The starting owner comes from the map rather than the activity log, and the
    // changes come from `tile_faction`. Both are derived from the unfiltered rows
    // so the timeline stays continuous.
    const startingFaction = hasNeutralDefenders(terrain) ? 'NEUTRAL' : UNOWNED;
    const { transitions, captureActivityIds } = deriveOwnershipTransitions(
        activities,
        startingFaction
    );

    return {
        tile: { x, y },
        activityCount: filtered.length,
        terrain,
        support: buildSupportSummary(filtered, playerNames),
        ownership: isHq
            ? null
            : buildOwnershipSummary(transitions, startingFaction, filter, {
                gameStart: Number(gameStart) || 0,
                gameEnd: Number(gameEnd) || 0,
                terrain,
            }),
        loot: isHq ? buildLootSummary(filtered, hqFaction!, playerNames) : null,
        players: buildPlayerSummary(filtered, captureActivityIds, playerNames),
        buildingKills: buildBuildingKillSummary(filtered, x, y),
        workers: buildWorkerSummary(filtered, playerNames),
    };
}

/** Faction values are stored uppercase but arrive from the UI lowercase. */
const equalsFaction = (a: string | null | undefined, b: string) =>
    (a ?? '').toUpperCase() === b.toUpperCase();

/**
 * How a per-player row is grouped and labelled.
 *
 * Keyed on the stable id wherever there is one, so a mid-game rename stays a
 * single row, and the name reported is the latest known one rather than
 * whichever was in use for that particular action. Rows are also what the UI
 * matches on when it highlights a player, so every section has to agree.
 * Activities with no id fall back to grouping by name.
 */
function playerIdentity(
    activity: ActivitiesModel,
    playerNames: Map<number, string>
): { key: string; playerId: number | null; player: string } {
    const playerId = activity.player_id ?? null;
    const player = (playerId !== null ? playerNames.get(playerId) : undefined)
        ?? activity.player_name
        ?? (playerId !== null ? `Player ${playerId}` : 'unknown');

    return { key: playerId !== null ? `id:${playerId}` : `name:${player}`, playerId, player };
}

function buildSupportSummary(
    activities: ActivitiesModel[],
    playerNames: Map<number, string>
): TileSupportSummary {
    const supports = activities.filter(activity => activity.type === 'support_sent');

    const byType = new Map<string, TileSupportTypeEntry>();
    const byPlayer = new Map<string, TileSupportPlayerEntry>();

    let totalUnits = 0;
    let totalKills = 0;

    for (const support of supports) {
        const supportType = support.support_type || support.name || 'unknown';
        const faction = factionOf(support.player_faction);
        const identity = playerIdentity(support, playerNames);
        // Support activities carry a unit count on some types and not others;
        // treat a missing amount as a single unit so the counts stay comparable.
        const units = Number(support.amount) || 1;
        const kills = support.kill ? 1 : 0;
        const power = Number(support.power) || 0;

        totalUnits += units;
        totalKills += kills;

        const typeKey = `${supportType}|${faction}`;
        if (!byType.has(typeKey)) {
            byType.set(typeKey, { supportType, faction, count: 0, units: 0, kills: 0, power: 0 });
        }
        const typeEntry = byType.get(typeKey)!;
        typeEntry.count += 1;
        typeEntry.units += units;
        typeEntry.kills += kills;
        typeEntry.power += power;

        if (!byPlayer.has(identity.key)) {
            byPlayer.set(identity.key, {
                player: identity.player,
                playerId: identity.playerId,
                faction,
                count: 0,
                units: 0,
                kills: 0,
                power: 0,
            });
        }
        const playerEntry = byPlayer.get(identity.key)!;
        playerEntry.count += 1;
        playerEntry.units += units;
        playerEntry.kills += kills;
        playerEntry.power += power;
    }

    const roundPower = <T extends { power: number }>(entry: T): T =>
        ({ ...entry, power: Math.round(entry.power * 100) / 100 });

    return {
        totalEvents: supports.length,
        totalUnits,
        totalKills,
        byType: Array.from(byType.values())
            .map(roundPower)
            .sort((a, b) => b.units - a.units || b.count - a.count),
        byPlayer: Array.from(byPlayer.values())
            .map(roundPower)
            .sort((a, b) => b.units - a.units || b.count - a.count),
    };
}

interface OwnershipTransition {
    time: number;
    faction: string;
    player: string | null;
    from: string;
    by: string | null;
    /**
     * Stable id for `by`, where the capturing actor was identifiable. `player`
     * has no equivalent — it can come from the game's own `tile_player` field,
     * which is a bare name.
     */
    byId: number | null;
    /** The activity that produced the change, for crediting the capture. */
    activityId: number | null;
}

/**
 * Derives ownership changes by watching `tile_faction` move between rows.
 *
 * `captured` looked like the obvious signal but doesn't reliably mark real
 * captures, so it isn't consulted here. `tile_faction` records the tile's owner
 * *after* each activity resolved, which makes the first row carrying a new value
 * the row that took the tile — and its timestamp the moment it changed hands.
 *
 * A null `tile_faction` means the field was never populated for that row, not
 * that the tile was unowned; those rows are skipped so the last known owner
 * carries forward instead of a phantom gap opening up.
 */
function deriveOwnershipTransitions(
    activities: ActivitiesModel[],
    startingFaction: string
): { transitions: OwnershipTransition[]; captureActivityIds: Set<number> } {
    const transitions: OwnershipTransition[] = [];
    const captureActivityIds = new Set<number>();

    let currentFaction = startingFaction;

    for (const activity of activities) {
        const raw = activity.tile_faction;
        if (!raw) continue;

        const faction = String(raw).toUpperCase();
        if (faction === currentFaction) continue;

        // Only credit the actor when they were fighting for the faction that
        // ended up holding the tile. Neutral resets and knock-on effects of
        // someone else's action shouldn't be recorded as their capture.
        const isCapturingActor = !!activity.player_name
            && factionOf(activity.player_faction).toUpperCase() === faction;

        transitions.push({
            time: Number(activity.updated_at) || Number(activity.created_at) || 0,
            faction,
            player: activity.tile_player ?? (isCapturingActor ? activity.player_name : null),
            from: currentFaction,
            by: isCapturingActor ? activity.player_name : null,
            byId: isCapturingActor ? activity.player_id ?? null : null,
            activityId: activity.id ?? null,
        });

        if (isCapturingActor && activity.id != null) {
            captureActivityIds.add(activity.id);
        }

        currentFaction = faction;
    }

    return { transitions, captureActivityIds };
}

/**
 * Turns ownership transitions into timed segments.
 *
 * The timeline starts at the first activity of the *game*, not of the tile: a
 * tile nobody touched until hour six was still owned by somebody for those six
 * hours, and charging that time to whoever eventually showed up would badly
 * distort the split. Terrain decides who that somebody is — tiles that spawn
 * neutral defenders start NEUTRAL, everything else starts unowned.
 */
function buildOwnershipSummary(
    transitions: OwnershipTransition[],
    startingFaction: string,
    filter: TileDetailFilter,
    game: { gameStart: number; gameEnd: number; terrain: string | null }
): TileOwnershipSummary {
    const timelineStart = game.gameStart;
    const timelineEnd = Math.max(game.gameEnd, transitions[transitions.length - 1]?.time ?? 0);

    // Clip to the filtered window so percentages describe what the user is looking at.
    const windowStart = Math.max(filter.dateStart ?? timelineStart, timelineStart);
    const windowEnd = filter.dateEnd ? Math.min(filter.dateEnd, timelineEnd) : timelineEnd;

    const segments: TileOwnershipSegment[] = [];

    let openSegment: TileOwnershipSegment | null = {
        faction: startingFaction,
        player: null,
        startTime: timelineStart,
        endTime: transitions[0]?.time ?? windowEnd,
        seconds: 0,
        capturedFrom: null,
        capturedBy: null,
        capturedById: null,
    };

    const pushSegment = (segment: TileOwnershipSegment | null, endTime: number) => {
        if (!segment) return;

        const start = Math.max(segment.startTime, windowStart);
        const end = Math.min(endTime, windowEnd);
        if (end <= start) return;

        segments.push({ ...segment, startTime: start, endTime: end, seconds: end - start });
    };

    for (const transition of transitions) {
        pushSegment(openSegment, transition.time);

        openSegment = {
            faction: transition.faction,
            player: transition.player,
            startTime: transition.time,
            endTime: windowEnd,
            seconds: 0,
            capturedFrom: transition.from,
            capturedBy: transition.by,
            capturedById: transition.byId,
        };
    }

    pushSegment(openSegment, windowEnd);

    const byFaction = new Map<string, TileOwnershipFactionEntry>();
    for (const segment of segments) {
        if (!byFaction.has(segment.faction)) {
            byFaction.set(segment.faction, {
                faction: segment.faction,
                seconds: 0,
                percent: 0,
                captures: 0,
                longestHoldSeconds: 0,
            });
        }

        const entry = byFaction.get(segment.faction)!;
        entry.seconds += segment.seconds;
        entry.longestHoldSeconds = Math.max(entry.longestHoldSeconds, segment.seconds);
        if (segment.capturedBy) entry.captures += 1;
    }

    const trackedSeconds = segments.reduce((total, segment) => total + segment.seconds, 0);
    for (const entry of byFaction.values()) {
        entry.percent = trackedSeconds > 0
            ? Math.round((entry.seconds / trackedSeconds) * 1000) / 10
            : 0;
    }

    const lastSegment = segments[segments.length - 1] ?? null;

    return {
        windowStart,
        windowEnd,
        trackedSeconds,
        totalCaptures: transitions.filter(transition => transition.by).length,
        totalChanges: transitions.length,
        currentFaction: lastSegment?.faction ?? null,
        currentPlayer: lastSegment?.player ?? null,
        startingFaction,
        terrain: game.terrain,
        byFaction: Array.from(byFaction.values()).sort((a, b) => b.seconds - a.seconds),
        segments,
        dateFiltered: !!(filter.dateStart || filter.dateEnd),
    };
}

/**
 * Looting against an HQ tile — the ownership stand-in for tiles that can't be
 * captured. `amount` on a loot activity is the victory points taken.
 */
function buildLootSummary(
    activities: ActivitiesModel[],
    hqFaction: string,
    playerNames: Map<number, string>
): TileLootSummary {
    const loots = activities.filter(activity => activity.type === 'loot');

    const byFaction = new Map<string, TileLootFactionEntry & { playerKeys: Set<string> }>();
    const byPlayer = new Map<string, TileLootPlayerEntry>();

    let totalVp = 0;
    let firstLoot: number | null = null;
    let lastLoot: number | null = null;

    for (const loot of loots) {
        const vp = Number(loot.amount) || 0;
        const faction = factionOf(loot.player_faction);
        const identity = playerIdentity(loot, playerNames);
        const time = Number(loot.created_at) || Number(loot.updated_at) || 0;

        totalVp += vp;
        firstLoot = firstLoot === null ? time : Math.min(firstLoot, time);
        lastLoot = lastLoot === null ? time : Math.max(lastLoot, time);

        if (!byFaction.has(faction)) {
            byFaction.set(faction, { faction, vp: 0, loots: 0, players: 0, playerKeys: new Set() });
        }
        const factionEntry = byFaction.get(faction)!;
        factionEntry.vp += vp;
        factionEntry.loots += 1;
        factionEntry.playerKeys.add(identity.key);

        if (!byPlayer.has(identity.key)) {
            byPlayer.set(identity.key, {
                player: identity.player,
                playerId: identity.playerId,
                faction,
                vp: 0,
                loots: 0,
                firstLoot: null,
                lastLoot: null,
            });
        }
        const playerEntry = byPlayer.get(identity.key)!;
        playerEntry.vp += vp;
        playerEntry.loots += 1;
        playerEntry.firstLoot = playerEntry.firstLoot === null
            ? time
            : Math.min(playerEntry.firstLoot, time);
        playerEntry.lastLoot = playerEntry.lastLoot === null
            ? time
            : Math.max(playerEntry.lastLoot, time);
    }

    return {
        hqFaction,
        totalVp,
        totalLoots: loots.length,
        firstLoot,
        lastLoot,
        byFaction: Array.from(byFaction.values())
            .map(({ playerKeys, ...entry }) => ({ ...entry, players: playerKeys.size }))
            .sort((a, b) => b.vp - a.vp || b.loots - a.loots),
        byPlayer: Array.from(byPlayer.values())
            .sort((a, b) => b.vp - a.vp || b.loots - a.loots),
    };
}

/**
 * `captureActivityIds` comes from the ownership walk rather than the `captured`
 * flag, which doesn't reliably mark real captures.
 */
function buildPlayerSummary(
    activities: ActivitiesModel[],
    captureActivityIds: Set<number>,
    playerNames: Map<number, string>
): TilePlayerEntry[] {
    const byPlayer = new Map<string, TilePlayerEntry>();

    for (const activity of activities) {
        if (activity.player_id === null || activity.player_id === undefined) continue;

        // Keyed on id so a mid-game rename stays one row; the name shown is the
        // latest known one rather than whichever was in use for this action.
        const key = String(activity.player_id);
        if (!byPlayer.has(key)) {
            byPlayer.set(key, {
                player: playerNames.get(activity.player_id)
                    ?? activity.player_name
                    ?? `Player ${activity.player_id}`,
                playerId: activity.player_id,
                faction: factionOf(activity.player_faction),
                soldiersAttack: 0,
                soldiersDefend: 0,
                soldiersTotal: 0,
                attacks: 0,
                defends: 0,
                captures: 0,
                supportSent: 0,
                workersSent: 0,
                actions: 0,
                firstAction: null,
                lastAction: null,
            });
        }

        const entry = byPlayer.get(key)!;
        const amount = Number(activity.amount) || 0;
        const time = Number(activity.created_at) || Number(activity.updated_at) || 0;

        entry.actions += 1;
        entry.firstAction = entry.firstAction === null ? time : Math.min(entry.firstAction, time);
        entry.lastAction = entry.lastAction === null ? time : Math.max(entry.lastAction, time);

        if (activity.id != null && captureActivityIds.has(activity.id)) {
            entry.captures += 1;
        }

        if (activity.type === 'soldiers_attack') {
            entry.soldiersAttack += amount;
            entry.attacks += 1;
        } else if (activity.type === 'soldiers_defend') {
            entry.soldiersDefend += amount;
            entry.defends += 1;
        } else if (activity.type === 'support_sent') {
            entry.supportSent += 1;
        } else if ((WORKER_TYPES as readonly string[]).includes(activity.type)) {
            entry.workersSent += amount;
        }

        entry.soldiersTotal = entry.soldiersAttack + entry.soldiersDefend;
    }

    return Array.from(byPlayer.values()).sort((a, b) =>
        b.soldiersTotal - a.soldiersTotal ||
        b.actions - a.actions ||
        a.player.localeCompare(b.player)
    );
}

/**
 * Soldiers this tile lost to buildings standing elsewhere.
 *
 * The activation row is logged against the tile that was hit, so the source
 * building's coordinates come out of the `data` blob. Rows we can't resolve a
 * source for are still counted in the totals and reported as `unknownSourceCount`
 * rather than silently dropped.
 */
function buildBuildingKillSummary(
    activities: ActivitiesModel[],
    tileX: number,
    tileY: number
): TileBuildingKillSummary {
    // `map_building_activated` isn't in PlayerActivityType — it only ever arrives
    // from the upstream feed, so compare as a plain string.
    const activations = activities.filter(
        activity => (activity.type as string) === 'map_building_activated'
    );

    const sources = new Map<string, TileBuildingKillSource>();
    let totalSoldiersDestroyed = 0;
    let unknownSourceCount = 0;

    for (const activation of activations) {
        const data = asData(activation);

        const nested = readNestedPosition(data);
        const sourceX = nested?.x ?? readNumber(data, SOURCE_X_KEYS);
        const sourceY = nested?.y ?? readNumber(data, SOURCE_Y_KEYS);
        const hasSource = sourceX !== null && sourceY !== null;

        if (!hasSource) unknownSourceCount += 1;

        const soldiersDestroyed = readNumber(data, ['soldiers_destroyed']) ?? 0;
        totalSoldiersDestroyed += soldiersDestroyed;

        const building = activation.support_type || activation.name || 'unknown';
        const faction = factionOf(activation.player_faction);
        const key = `${sourceX ?? '?'},${sourceY ?? '?'},${building},${faction}`;

        if (!sources.has(key)) {
            sources.set(key, {
                x: sourceX,
                y: sourceY,
                building,
                faction,
                activations: 0,
                soldiersDestroyed: 0,
                distance: hasSource
                    ? Math.max(Math.abs(sourceX! - tileX), Math.abs(sourceY! - tileY))
                    : null,
            });
        }

        const entry = sources.get(key)!;
        entry.activations += 1;
        entry.soldiersDestroyed += soldiersDestroyed;
    }

    return {
        totalActivations: activations.length,
        totalSoldiersDestroyed,
        unknownSourceCount,
        sources: Array.from(sources.values()).sort((a, b) =>
            b.soldiersDestroyed - a.soldiersDestroyed ||
            b.activations - a.activations
        ),
    };
}

function buildWorkerSummary(
    activities: ActivitiesModel[],
    playerNames: Map<number, string>
): TileWorkerSummary {
    const workerActivities = activities.filter(activity =>
        (WORKER_TYPES as readonly string[]).includes(activity.type)
    );

    const byProject = new Map<string, TileWorkerProjectEntry>();
    const byPlayer = new Map<string, TileWorkerPlayerEntry>();

    let totalWorkers = 0;
    let fortificationWorkers = 0;
    let improvementWorkers = 0;
    let dismantleWorkers = 0;

    for (const activity of workerActivities) {
        const workers = Number(activity.amount) || 0;
        const projectType = activity.project_type || activity.name || 'unspecified';
        const identity = playerIdentity(activity, playerNames);
        const faction = factionOf(activity.player_faction);

        totalWorkers += workers;
        if (activity.type === 'fortification_workers_sent') fortificationWorkers += workers;
        if (activity.type === 'improvement_workers_sent') improvementWorkers += workers;
        if (activity.type === 'dismantle_workers_sent') dismantleWorkers += workers;

        const projectKey = `${activity.type}|${projectType}`;
        if (!byProject.has(projectKey)) {
            byProject.set(projectKey, {
                activityType: activity.type,
                projectType,
                events: 0,
                workers: 0,
            });
        }
        const projectEntry = byProject.get(projectKey)!;
        projectEntry.events += 1;
        projectEntry.workers += workers;

        if (!byPlayer.has(identity.key)) {
            byPlayer.set(identity.key, {
                player: identity.player,
                playerId: identity.playerId,
                faction,
                events: 0,
                workers: 0,
            });
        }
        const playerEntry = byPlayer.get(identity.key)!;
        playerEntry.events += 1;
        playerEntry.workers += workers;
    }

    return {
        totalEvents: workerActivities.length,
        totalWorkers,
        fortificationWorkers,
        improvementWorkers,
        dismantleWorkers,
        byProject: Array.from(byProject.values())
            .sort((a, b) => b.workers - a.workers || b.events - a.events),
        byPlayer: Array.from(byPlayer.values())
            .sort((a, b) => b.workers - a.workers || b.events - a.events),
    };
}
