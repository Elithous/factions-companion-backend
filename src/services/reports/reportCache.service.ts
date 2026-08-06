import ReportCacheModel from "../../models/reportCache.model";
import { getSetting } from "../settings.service";

// Report types
export enum ReportType {
    PLAYER_MVP = 'player_mvp',
    APM = 'apm',
    TILE = 'tile',
    TILE_DETAIL = 'tile_detail',
    SOLDIER_FACTION = "soldier_faction",
    SOLDIER_TILE = "soldier_tile",
    PLAYER_ACTIONS = "player_actions",
    RESOURCES_SENT = "resources_sent",
    RESOURCES_RECEIVED = "resources_received",
    PLAYER_STATS = "player_stats",
    BUILDING_KILLS = "building_kills",
    BUILDING_PILLAGED = "building_pillaged",
    BUILDING_PLACEMENT = "building_placement",
    BUILDING_SUPPLY = "building_supply",
    PLAYER_LOOT = "player_loot",
    LOOT_ACTIONS = "loot_actions"
}

// Default cache duration in milliseconds (1 hour)
const DEFAULT_CACHE_DURATION = 60 * 60 * 1000;

// Filter-keyed reports are cheaper to regenerate, so they expire faster.
const FILTERED_CACHE_DURATION = 5 * 60 * 1000;

/**
 * Gets cached report data if available and not expired
 * @param gameId The game ID (can be null)
 * @param reportType The type of report
 * @param params Optional parameters that were used to generate the report
 * @returns The cached data or null if no valid cache exists
 */
export async function getCachedReport(
    gameId: string | null,
    reportType: ReportType,
    params: Record<string, any> = {}
): Promise<any | null> {
    const now = new Date();
    const paramString = JSON.stringify(params);

    // Find cache entry
    const cacheEntry = await ReportCacheModel.findOne({
        where: {
            game_id: gameId || '',
            report_type: reportType,
            parameters: paramString
        }
    });

    // Return null if no cache
    if (!cacheEntry) {
        return null;
    }

    // If cache never expires, or cache is not expired, return the data
    if (cacheEntry.revalidate_at === null || new Date(cacheEntry.revalidate_at) > now) {
        return cacheEntry.data;
    }

    return null;
}

/**
 * Saves report data to cache with a revalidation timestamp
 * @param gameId The game ID (can be null)
 * @param reportType The type of report
 * @param data The report data to cache
 * @param params Optional parameters that were used to generate the report
 * @param cacheDuration Optional cache duration in milliseconds (defaults to 1 hour)
 */
export async function cacheReport(
    gameId: string | null,
    reportType: ReportType,
    data: any,
    params: Record<string, any> = {},
    cacheDuration: number = DEFAULT_CACHE_DURATION
): Promise<void> {
    const now = new Date();
    const paramString = JSON.stringify(params);

    // Check if game is in watchlist
    const socketSettings = await getSetting('socket');
    const isWatched = gameId && socketSettings?.watchList?.includes(gameId);

    // If game is not watched, set revalidate_at to null (never expire)
    // Otherwise, set it to now + cacheDuration
    const revalidateAt = !isWatched ? null : new Date(now.getTime() + cacheDuration);

    // Upsert the cache entry
    await ReportCacheModel.upsert({
        game_id: gameId || '',
        report_type: reportType,
        parameters: paramString,
        data,
        created_at: now,
        revalidate_at: revalidateAt
    });
}

/**
 * Invalidates cached report by setting its revalidation time to now
 * @param gameId The game ID (can be null)
 * @param reportType The type of report (optional - if not provided, invalidates all reports for the game)
 * @param params Optional parameters to match specific cached report
 */
export async function invalidateCache(
    gameId: string | null,
    reportType?: ReportType,
    params?: Record<string, any>
): Promise<void> {
    const now = new Date();

    const where: any = {
        game_id: gameId || ''
    };

    if (reportType) {
        where.report_type = reportType;
    }

    if (params) {
        where.parameters = JSON.stringify(params);
    }

    // Update revalidate_at to current time to invalidate the cache
    await ReportCacheModel.update(
        { revalidate_at: now },
        { where }
    );
} 
/**
 * Wraps a report generator with read-through caching.
 *
 * Every generator used to open with a `getCachedReport` check and close with a
 * `cacheReport` write; this collapses that bookend into one call:
 *
 *     return withReportCache(gameId, ReportType.TILE, () => buildTileReport(gameId));
 *
 * `params` distinguishes cache entries for generators that take arguments
 * beyond the game id (e.g. the APM report's timespan).
 */
export async function withReportCache<T>(
    gameId: string | null,
    reportType: ReportType,
    generate: () => Promise<T>,
    params: Record<string, any> = {}
): Promise<T> {
    const cached = await getCachedReport(gameId, reportType, params);
    if (cached) {
        return cached as T;
    }

    const data = await generate();
    await cacheReport(gameId, reportType, data, params);

    return data;
}

/**
 * Read-through cache for reports keyed by a Sequelize filter rather than a
 * plain game id.
 *
 * Date-bounded filters are effectively unique per request, so caching them
 * would just fill the table with single-use rows — those requests skip the
 * cache entirely.
 */
export async function withFilteredReportCache<T>(
    // Extra keys are welcome: the whole object is stringified into the cache key,
    // so callers can mix in discriminators that aren't columns (unit type, and
    // the like) to keep otherwise-identical filters in separate entries.
    filter: Record<string, unknown> & { game_id?: unknown; created_at?: unknown; updated_at?: unknown },
    reportType: ReportType,
    generate: () => Promise<T>,
    cacheDuration: number = FILTERED_CACHE_DURATION
): Promise<T> {
    const isDateFiltered = !!(filter.created_at || filter.updated_at);
    const gameId = `${filter.game_id}`;

    if (isDateFiltered) {
        return generate();
    }

    const cached = await getCachedReport(gameId, reportType, filter as Record<string, any>);
    if (cached) {
        return cached as T;
    }

    const data = await generate();
    await cacheReport(gameId, reportType, data, filter as Record<string, any>, cacheDuration);

    return data;
}
