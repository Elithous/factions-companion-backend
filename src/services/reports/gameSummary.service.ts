/**
 * One game at a glance: how each faction did, who stood out, where the
 * fighting concentrated, and when each HQ first fell to looting.
 *
 * Built entirely from stored activity, never the upstream API, so it keeps
 * working after a game has finished and upstream stops answering for it.
 */

import { Op, QueryTypes } from "sequelize";

import { sequelize } from "../../db";
import { ActivitiesModel } from "../../models/activities/activities.model";
import { getConfig, getHqPositionLookup, getTimespan, hasNeutralDefenders } from "./gameReport.service";
import { getPlayerNames } from "./playerIdentity.service";
import { ReportType, withReportCache } from "./reportCache.service";
import { deriveOwnershipTransitions, UNOWNED, WORKER_TYPES } from "./tileDetailReport.service";

const FACTION_ORDER = ['RED', 'BLUE', 'GREEN', 'YELLOW'];

const CONTESTED_TILE_COUNT = 5;

export type FactionSummary = {
    faction: string;
    players: number;
    soldiersAttack: number;
    soldiersDefend: number;
    workers: number;
    /** Tiles taken, credited the same way as the tile drill-down. */
    captures: number;
    /** Victory points this faction looted from other HQs. */
    lootVp: number;
    /** Victory points other factions looted from this faction's HQ. */
    lootVpLost: number;
};

export type PlayerLine = {
    playerId: number;
    player: string;
    faction: string;
    soldiersAttack: number;
    soldiersDefend: number;
    workers: number;
    captures: number;
    lootVp: number;
};

export type StandoutKey = 'attacker' | 'defender' | 'worker' | 'captures' | 'looter';

export type Standout = {
    key: StandoutKey;
    playerId: number;
    player: string;
    faction: string;
    value: number;
};

export type ContestedTile = {
    x: number;
    y: number;
    soldiers: number;
    captures: number;
    /** Owner once the fighting was over, or the starting owner if it never changed. */
    finalOwner: string;
};

export type HqFirstLoot = {
    hqFaction: string;
    time: number;
    playerId: number | null;
    player: string;
    faction: string;
};

export type GameSummaryReport = {
    gameId: string;
    /** Unix seconds, from the stored activity. Null for a game with none. */
    startTime: number | null;
    endTime: number | null;
    playerCount: number;
    factions: FactionSummary[];
    standouts: Standout[];
    /** Everyone who played, in no particular order; the page sorts them. */
    players: PlayerLine[];
    contestedTiles: ContestedTile[];
    hqFirstLoots: HqFirstLoot[];
};

export function generateGameSummary(gameId: string) {
    return withReportCache(gameId, ReportType.GAME_SUMMARY, () => buildGameSummary(gameId));
}

type PlayerTotalsRow = {
    player_id: number;
    faction: string | null;
    attack: string | number;
    defend: string | number;
    workers: string | number;
    loot_vp: string | number;
};

/** Unit totals per player and faction, summed in the database. */
function queryPlayerTotals(gameId: string) {
    return sequelize.query<PlayerTotalsRow>(
        `SELECT player_id,
                player_faction AS faction,
                SUM(CASE WHEN type = 'soldiers_attack' THEN COALESCE(amount, 0) ELSE 0 END) AS attack,
                SUM(CASE WHEN type = 'soldiers_defend' THEN COALESCE(amount, 0) ELSE 0 END) AS defend,
                SUM(CASE WHEN type IN (:workerTypes) THEN COALESCE(amount, 0) ELSE 0 END) AS workers,
                SUM(CASE WHEN type = 'loot' THEN COALESCE(amount, 0) ELSE 0 END) AS loot_vp
         FROM activities
         WHERE game_id = :gameId
           AND player_id IS NOT NULL
           AND type IN ('soldiers_attack', 'soldiers_defend', 'loot', :workerTypes)
         GROUP BY player_id, player_faction`,
        {
            replacements: { gameId, workerTypes: [...WORKER_TYPES] },
            type: QueryTypes.SELECT,
        }
    );
}

type TileSoldiersRow = { x: number; y: number; soldiers: string | number };

function queryTileSoldiers(gameId: string) {
    return sequelize.query<TileSoldiersRow>(
        `SELECT x, y, SUM(COALESCE(amount, 0)) AS soldiers
         FROM activities
         WHERE game_id = :gameId
           AND type IN ('soldiers_attack', 'soldiers_defend')
           AND x IS NOT NULL AND y IS NOT NULL
         GROUP BY x, y`,
        { replacements: { gameId }, type: QueryTypes.SELECT }
    );
}

/** The map's terrain grid, or null if the config can't be had. */
async function loadWorld(gameId: string): Promise<string[][] | null> {
    try {
        return (await getConfig(gameId))?.world ?? null;
    } catch {
        // Without terrain every tile starts UNOWNED, which only shifts who is
        // credited with a tile's very first capture.
        return null;
    }
}

/**
 * Walks every tile's ownership history to count captures, crediting players
 * and factions exactly as the tile drill-down does.
 */
async function countCaptures(gameId: string, hqTiles: Set<string>) {
    const [rows, world] = await Promise.all([
        ActivitiesModel.findAll({
            attributes: [
                'id', 'x', 'y', 'tile_faction', 'tile_player', 'player_id',
                'player_name', 'player_faction', 'updated_at', 'created_at',
            ],
            where: { game_id: gameId, tile_faction: { [Op.not]: null } },
            order: [['updated_at', 'ASC'], ['id', 'ASC']],
            raw: true,
        }),
        loadWorld(gameId),
    ]);

    const byTile = new Map<string, typeof rows>();
    for (const row of rows) {
        if (row.x === null || row.y === null) continue;
        const key = `${row.x}:${row.y}`;
        // HQs can't be captured; looting is tracked separately.
        if (hqTiles.has(key)) continue;

        let list = byTile.get(key);
        if (!list) byTile.set(key, list = []);
        list.push(row);
    }

    const byPlayer = new Map<number, number>();
    const byFaction = new Map<string, number>();
    const byTileResult = new Map<string, { captures: number; finalOwner: string }>();

    for (const [key, tileRows] of byTile) {
        const [x, y] = key.split(':').map(Number);
        const startingFaction = hasNeutralDefenders(world?.[x]?.[y]) ? 'NEUTRAL' : UNOWNED;
        const { transitions } = deriveOwnershipTransitions(tileRows, startingFaction);

        let captures = 0;
        for (const transition of transitions) {
            if (!transition.by) continue;
            captures += 1;
            byFaction.set(transition.faction, (byFaction.get(transition.faction) ?? 0) + 1);
            if (transition.byId !== null) {
                byPlayer.set(transition.byId, (byPlayer.get(transition.byId) ?? 0) + 1);
            }
        }

        byTileResult.set(key, {
            captures,
            finalOwner: transitions.at(-1)?.faction ?? startingFaction,
        });
    }

    return { byPlayer, byFaction, byTile: byTileResult };
}

/** Who first looted each HQ, and how much VP each HQ lost in total. */
async function summariseHqLoot(gameId: string, hqByPosition: Record<string, string>, names: Map<number, string>) {
    const loots = await ActivitiesModel.findAll({
        attributes: ['x', 'y', 'amount', 'player_id', 'player_name', 'player_faction', 'created_at'],
        where: { game_id: gameId, type: 'loot' },
        order: [['created_at', 'ASC'], ['id', 'ASC']],
        raw: true,
    });

    const firstLoots = new Map<string, HqFirstLoot>();
    const vpLost = new Map<string, number>();

    for (const loot of loots) {
        const hqFaction = hqByPosition[`${loot.x}:${loot.y}`];
        if (!hqFaction) continue;

        vpLost.set(hqFaction, (vpLost.get(hqFaction) ?? 0) + (Number(loot.amount) || 0));

        if (!firstLoots.has(hqFaction)) {
            const playerId = loot.player_id ?? null;
            firstLoots.set(hqFaction, {
                hqFaction,
                time: Number(loot.created_at) || 0,
                playerId,
                player: (playerId !== null ? names.get(playerId) : null) ?? loot.player_name ?? 'Unknown',
                faction: loot.player_faction ?? UNOWNED,
            });
        }
    }

    return {
        firstLoots: [...firstLoots.values()].sort((a, b) => a.time - b.time),
        vpLost,
    };
}

async function buildGameSummary(gameId: string): Promise<GameSummaryReport> {
    const [playerRows, tileRows, timespan, names, hqByPosition] = await Promise.all([
        queryPlayerTotals(gameId),
        queryTileSoldiers(gameId),
        getTimespan(gameId),
        getPlayerNames(),
        getHqPositionLookup(gameId).catch(() => ({} as Record<string, string>)),
    ]);

    const hqTiles = new Set(Object.keys(hqByPosition));
    const [captures, loot] = await Promise.all([
        countCaptures(gameId, hqTiles),
        summariseHqLoot(gameId, hqByPosition, names),
    ]);

    // A player can appear under two factions if they switched. Their totals are
    // merged, and they're listed under whichever faction they did the most for.
    const players = new Map<number, PlayerLine & { factionWeight: number }>();
    const factions = new Map<string, FactionSummary & { playerIds: Set<number> }>();

    for (const row of playerRows) {
        const attack = Number(row.attack) || 0;
        const defend = Number(row.defend) || 0;
        const workers = Number(row.workers) || 0;
        const lootVp = Number(row.loot_vp) || 0;
        const faction = row.faction ?? UNOWNED;
        const rowWeight = attack + defend + workers + lootVp;

        let player = players.get(row.player_id);
        if (!player) {
            player = {
                playerId: row.player_id,
                player: names.get(row.player_id) ?? `Player ${row.player_id}`,
                faction,
                soldiersAttack: 0,
                soldiersDefend: 0,
                workers: 0,
                captures: captures.byPlayer.get(row.player_id) ?? 0,
                lootVp: 0,
                factionWeight: rowWeight,
            };
            players.set(row.player_id, player);
        } else if (rowWeight > player.factionWeight) {
            player.faction = faction;
            player.factionWeight = rowWeight;
        }

        player.soldiersAttack += attack;
        player.soldiersDefend += defend;
        player.workers += workers;
        player.lootVp += lootVp;

        let factionEntry = factions.get(faction);
        if (!factionEntry) {
            factionEntry = {
                faction,
                players: 0,
                soldiersAttack: 0,
                soldiersDefend: 0,
                workers: 0,
                captures: captures.byFaction.get(faction) ?? 0,
                lootVp: 0,
                lootVpLost: loot.vpLost.get(faction) ?? 0,
                playerIds: new Set(),
            };
            factions.set(faction, factionEntry);
        }
        factionEntry.playerIds.add(row.player_id);
        factionEntry.soldiersAttack += attack;
        factionEntry.soldiersDefend += defend;
        factionEntry.workers += workers;
        factionEntry.lootVp += lootVp;
    }

    const playerLines: PlayerLine[] = [...players.values()].map(({ factionWeight: _, ...line }) => line);

    const standout = (key: StandoutKey, value: (line: PlayerLine) => number): Standout[] => {
        let best: PlayerLine | null = null;
        for (const line of playerLines) {
            if (!best || value(line) > value(best)) best = line;
        }
        if (!best || value(best) <= 0) return [];
        return [{ key, playerId: best.playerId, player: best.player, faction: best.faction, value: value(best) }];
    };

    const factionOrder = (faction: string) => {
        const index = FACTION_ORDER.indexOf(faction);
        return index === -1 ? FACTION_ORDER.length : index;
    };

    return {
        gameId,
        startTime: timespan[0] == null ? null : Number(timespan[0]),
        endTime: timespan[1] == null ? null : Number(timespan[1]),
        playerCount: players.size,
        factions: [...factions.values()]
            // Unaffiliated rows are noise in a faction comparison.
            .filter(entry => FACTION_ORDER.includes(entry.faction))
            .map(({ playerIds, ...entry }) => ({ ...entry, players: playerIds.size }))
            .sort((a, b) => factionOrder(a.faction) - factionOrder(b.faction)),
        standouts: [
            ...standout('attacker', line => line.soldiersAttack),
            ...standout('defender', line => line.soldiersDefend),
            ...standout('worker', line => line.workers),
            ...standout('captures', line => line.captures),
            ...standout('looter', line => line.lootVp),
        ],
        players: playerLines,
        contestedTiles: tileRows
            .map(row => {
                const key = `${row.x}:${row.y}`;
                const tile = captures.byTile.get(key);
                return {
                    x: Number(row.x),
                    y: Number(row.y),
                    soldiers: Number(row.soldiers) || 0,
                    captures: tile?.captures ?? 0,
                    finalOwner: hqByPosition[key] ?? tile?.finalOwner ?? UNOWNED,
                };
            })
            .sort((a, b) => b.soldiers - a.soldiers)
            .slice(0, CONTESTED_TILE_COUNT),
        hqFirstLoots: loot.firstLoots,
    };
}
