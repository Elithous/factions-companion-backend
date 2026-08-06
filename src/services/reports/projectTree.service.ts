/**
 * Turns the raw project-tree payloads into nodes, and resolves a player's picks
 * onto them.
 *
 * A pick only records a translation key and a tier, and that pair does *not*
 * identify a node: the personal tree has five distinct `SOLDIER_STORAGE` tier-4
 * nodes on different branches. So a pick is matched to a set of candidates and
 * then narrowed by replaying the picks in order — a node is only reachable once
 * its prerequisite has been taken, which eliminates most of the alternatives.
 * Anything still ambiguous is reported as such rather than guessed at.
 *
 * This gets more accurate, not less, once the node id lands in the activity
 * data: `resolvePicks` will simply take the direct match and skip the replay.
 */

import { getProjectDefinitions } from "./projectDefinition.service";

/** One effect a node grants. Shapes vary; all fields are optional. */
export type NodeEffect = {
    type?: string;
    subtype?: string;
    base?: number;
    bonus?: number;
    multiplier?: number;
};

/** A node in one of the trees, normalised across the three payload shapes. */
export type ProjectNode = {
    id: number;
    name: string;
    tier: number;
    /** MILITARY, ECONOMY, WORKER, SUPPORT, MODULE, VICTORY, NEUTRAL, ... */
    category: string;
    /** Ids this node depends on. Empty for a branch root. */
    requires: number[];
    effects: NodeEffect[];
    /** Which tree it belongs to. */
    tree: TreeKind;
};

export type TreeKind = 'talents' | 'projects' | 'personal_projects';

type RawNode = {
    id?: number;
    name?: string;
    tier?: number;
    tiers?: number;
    category?: string;
    spec?: string;
    requires?: number[];
    baseEffects?: NodeEffect[];
    effects?: NodeEffect[];
};

/**
 * Talents have no id and no `requires` — they're points spent per
 * specialization, not a dependency chain. They're given synthetic ids so they
 * can share the node type, and their `spec` stands in for a category.
 */
function fromTalents(raw: unknown): ProjectNode[] {
    if (!Array.isArray(raw)) return [];

    return raw.map((node: RawNode, index) => ({
        id: -(index + 1),
        name: node.name ?? '',
        // `tiers` here is the talent's depth, matching `tier` elsewhere.
        tier: node.tiers ?? 0,
        category: node.spec ?? 'TALENT',
        requires: [],
        effects: node.baseEffects ?? node.effects ?? [],
        tree: 'talents' as const,
    })).filter(node => node.name);
}

function fromProjectList(raw: unknown, tree: TreeKind): ProjectNode[] {
    // Team projects arrive as `{ permanent, event, last }`; personal projects
    // as a bare array.
    const lists: unknown[] = Array.isArray(raw)
        ? [raw]
        : raw && typeof raw === 'object'
            ? Object.values(raw as Record<string, unknown>)
            : [];

    const nodes: ProjectNode[] = [];
    for (const list of lists) {
        if (!Array.isArray(list)) continue;

        for (const node of list as RawNode[]) {
            if (typeof node?.id !== 'number' || !node.name) continue;

            nodes.push({
                id: node.id,
                name: node.name,
                tier: node.tier ?? 0,
                category: node.category ?? 'UNKNOWN',
                requires: Array.isArray(node.requires) ? node.requires : [],
                effects: node.baseEffects ?? [],
                tree,
            });
        }
    }

    return nodes;
}

export type ProjectTrees = Record<TreeKind, ProjectNode[]>;

/** Every tree for a game, as normalised nodes. */
export async function getProjectTrees(gameId: string): Promise<ProjectTrees> {
    const definitions = await getProjectDefinitions(gameId);

    return {
        talents: fromTalents(definitions.talents),
        projects: fromProjectList(definitions.teamProjects, 'projects'),
        personal_projects: fromProjectList(definitions.personalProjects, 'personal_projects'),
    };
}

/* -------------------------------------------------------------------------- */
/* Resolving picks onto nodes                                                 */
/* -------------------------------------------------------------------------- */

/** A player's pick, as recorded in their activity log. */
export type RawPick = {
    name: string;
    tier: number | null;
    category: string | null;
    timestamp: number;
};

export type ResolvedPick = {
    name: string;
    tier: number | null;
    timestamp: number;
    /** 1-based position in the order the picks were taken. */
    order: number;
    /** The node this resolved to, when it could be pinned down. */
    node: ProjectNode | null;
    /** Its prerequisite, when the node is known and has one. */
    parentId: number | null;
    /** True when several nodes matched and none could be ruled out. */
    ambiguous: boolean;
    /** How many candidates the name/tier match produced. */
    candidateCount: number;
};

const matchKey = (name: string, tier: number | null) => `${name}|${tier ?? 0}`;

/**
 * Resolves picks to nodes by replaying them in order.
 *
 * At each step the candidates are those matching the pick's name and tier; the
 * ones whose prerequisites are already satisfied win, since a node can't be
 * taken before its parent. A node already claimed by an earlier pick is also
 * excluded, which separates repeat picks of the same name onto their own
 * branches.
 */
export function resolvePicks(picks: RawPick[], nodes: ProjectNode[]): ResolvedPick[] {
    const byKey = new Map<string, ProjectNode[]>();
    for (const node of nodes) {
        const key = matchKey(node.name, node.tier);
        byKey.set(key, [...(byKey.get(key) ?? []), node]);
    }

    const taken = new Set<number>();
    const ordered = [...picks].sort((a, b) => a.timestamp - b.timestamp);

    return ordered.map((pick, index) => {
        const candidates = byKey.get(matchKey(pick.name, pick.tier)) ?? [];
        const unclaimed = candidates.filter(node => !taken.has(node.id));

        // A node is only reachable if everything it requires is already taken.
        const reachable = unclaimed.filter(node =>
            node.requires.every(required => taken.has(required)));

        const pool = reachable.length ? reachable : unclaimed;
        const node = pool.length === 1 ? pool[0] : null;

        if (node) taken.add(node.id);

        return {
            name: pick.name,
            tier: pick.tier,
            timestamp: pick.timestamp,
            order: index + 1,
            node,
            parentId: node?.requires[0] ?? null,
            // Several survived the narrowing and nothing separates them.
            ambiguous: pool.length > 1,
            candidateCount: candidates.length,
        };
    });
}
