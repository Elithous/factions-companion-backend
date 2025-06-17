import ReportCacheModel from "../../models/reportCache.model";
import { Op } from 'sequelize';
import { getSetting } from "../settings.service";

// Report types
export enum ReportType {
    PLAYER_MVP = 'player_mvp',
    APM = 'apm',
    TILE = 'tile',
    SOLDIER_FACTION = "soldier_faction",
    SOLDIER_TILE = "soldier_tile",
    PLAYER_ACTIONS = "player_actions",
    RESOURCES_SENT = "resources_sent"
}

// Default cache duration in milliseconds (1 hour)
const DEFAULT_CACHE_DURATION = 60 * 60 * 1000;

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
        revalidate_at: revalidateAt
    });
}

/**
 * Checks if a valid cache exists for the specified report
 * @param gameId The game ID (can be null)
 * @param reportType The type of report
 * @param params Optional parameters that were used to generate the report
 * @returns True if valid cache exists, false otherwise
 */
export async function hasValidCache(
    gameId: string | null,
    reportType: ReportType,
    params: Record<string, any> = {}
): Promise<boolean> {
    const now = new Date();
    const paramString = JSON.stringify(params);

    // Find cache entry
    const count = await ReportCacheModel.count({
        where: {
            game_id: gameId || '',
            report_type: reportType,
            parameters: paramString,
            revalidate_at: {
                [Op.gt]: now
            }
        }
    });

    return count > 0;
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