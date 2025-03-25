import express, { Request, Response } from 'express';
import { generateSoldierStatsByFaction, generateSoldierStatsByTile, getAllActivities } from "../services/reports/activityReport.service";
import { getAvailableGameIds, getConfig, getTimespan } from '../services/reports/gameReport.service';
import { WhereOptions, InferAttributes, WhereAttributeHashValue, Op } from 'sequelize';
import { WorldUpdateModel } from '../models/activities/worldUpdate.model';
import { generateApmLeaderboard, generatePlayerMvpLeaderboard, generateTileLeaderboard } from '../services/reports/leaderboardReport.service';

export async function getSoldierStatsByFaction(req: Request, res: Response) {
    try {
        const { gameId, playerName, tileX, tileY, fromFaction, dateStart, dateEnd } = req.query;
        let whereQuery: WhereOptions<InferAttributes<WorldUpdateModel>> = {
            game_id: gameId as string
        };
        if (playerName) {
            whereQuery.player_name = playerName as string;
        }
        if (tileX && tileY) {
            whereQuery.x = tileX as string;
            whereQuery.y = tileY as string;
        }
        if (fromFaction) {
            whereQuery.player_faction = fromFaction as string;
        }

        const createdQuery: WhereAttributeHashValue<number> = {}
        if (parseFloat(dateStart as string)) {
            createdQuery[Op.gte] = parseFloat(dateStart as string);
        }
        if (parseFloat(dateEnd as string)) {
            createdQuery[Op.lte] = parseFloat(dateEnd as string);
        }
        if (createdQuery[Op.gte] || createdQuery[Op.lte]) {
            whereQuery.created_at = createdQuery;
        }

        const stats = await generateSoldierStatsByFaction(whereQuery);

        res.status(200).send(stats);
    } catch (error) {
        res.status(400).json({ message: `Error getting soldier data: ${error}` });
    }
}

export async function getSoliderStatsByTile(req: Request, res: Response) {
    try {
        const { gameId, playerName, fromFaction, dateStart, dateEnd } = req.query;
        let whereQuery: WhereOptions<InferAttributes<WorldUpdateModel>> = {
            game_id: gameId as string
        };
        if (playerName) {
            whereQuery.player_name = playerName as string;
        }
        if (fromFaction) {
            whereQuery.player_faction = fromFaction as string;
        }
        const createdQuery: WhereAttributeHashValue<number> = {}
        if (parseFloat(dateStart as string)) {
            createdQuery[Op.gte] = parseFloat(dateStart as string);
        }
        if (parseFloat(dateEnd as string)) {
            createdQuery[Op.lte] = parseFloat(dateEnd as string);
        }
        if (createdQuery[Op.gte] || createdQuery[Op.lte]) {
            whereQuery.created_at = createdQuery;
        }

        const stats = await generateSoldierStatsByTile(whereQuery);

        res.status(200).send(stats);
    } catch (error) {
        res.status(400).json({ message: `Error getting soldier data: ${error}` });
    }
}

export async function getPlayerMvpLeaderboard(req: Request, res: Response) {
    try {
        const { gameId } = req.query;

        const stats = await generatePlayerMvpLeaderboard(gameId as string);

        let output = '';
        stats.forEach((stat, index) => {
            output += `${index + 1}:${stat.name}(${stat.faction.substring(0, 1)}) - ${stat.score}\r\n`;
        });

        res.status(200).send(output);
    } catch (error) {
        res.status(400).json({ message: `Error getting soldier data: ${error}` });
    }
}

export async function getPlayerApmLeaderboard(req: Request, res: Response) {
    try {
        const { gameId, timespan } = req.query;
        const contentType = req.headers['accept'] || 'text/html';

        const timespanNum = parseInt(timespan as string) || 60;

        const stats = await generateApmLeaderboard(gameId as string, timespanNum);

        // Check if client wants JSON
        if (contentType.includes('application/json')) {
            res.status(200).json(stats);
        } else {
            // Default to HTML response
            let output = '<h2>APM Leaderboard</h2>';
            output += `<p>(Rolling ${timespanNum} second window)</p>`;
            output += '<style>';
            output += 'table { border-collapse: collapse; width: 100%; }';
            output += 'th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }';
            output += 'th { background-color: #f2f2f2; }';
            output += 'tr:nth-child(even) { background-color: #f9f9f9; }';
            output += 'tr:hover { background-color: #f1f1f1; }';
            output += '</style>';
            output += '<table>';
            output += '<tr><th>Rank</th><th>Player</th><th>APM</th></tr>';
            stats.forEach((stat, index) => {
                output += `<tr><td>${index + 1}</td><td>${stat[0]}</td><td>${stat[1]}</td></tr>`;
            });
            output += '</table>';

            res.status(200).send(output);
        }
    } catch (error) {
        res.status(400).json({ message: `Error getting apm data: ${error}` });
    }
}

export async function getTileLeaderboard(req: Request, res: Response) {
    try {
        const { gameId } = req.query;
        const contentType = req.headers['accept'] || 'text/html';

        const stats = await generateTileLeaderboard(gameId as string);

        // Check if client wants JSON
        if (contentType.includes('application/json')) {
            res.status(200).json(stats);
        } else {
            // Default to HTML response
            let output = '<h2>Tile Ownership Leaderboard</h2>';
            output += '<p>(Maximum concurrent tiles captured by the player)</p>';
            output += '<style>';
            output += 'table { border-collapse: collapse; width: 100%; }';
            output += 'th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }';
            output += 'th { background-color: #f2f2f2; }';
            output += 'tr:nth-child(even) { background-color: #f9f9f9; }';
            output += 'tr:hover { background-color: #f1f1f1; }';
            output += '</style>';
            output += '<table>';
            output += '<tr><th>Rank</th><th>Player</th><th>Tiles Captured</th><th>Percentage</th></tr>';
            stats.forEach((stat, index) => {
                output += `<tr><td>${index + 1}</td><td>${stat[0]}</td><td>${stat[1]}</td><td>${stat[2]}</td></tr>`;
            });
            output += '</table>';

            res.status(200).send(output);
        }
    } catch (error) {
        res.status(400).json({ message: `Error getting tile data: ${error}` });
    }
}



export async function getAvailableGames(req: Request, res: Response) {
    try {
        res.status(200).send(await getAvailableGameIds());
    } catch (error) {
        res.status(400).json({ message: `Error: ${error}` });
    }
}

export async function getGameTimespan(req: Request, res: Response) {
    try {
        const { gameId } = req.query;

        res.status(200).send(await getTimespan(gameId as string));
    } catch (error) {
        res.status(400).json({ message: `Error: ${error}` });
    }
}

export async function getGameConfig(req: Request, res: Response) {
    try {
        const { gameId } = req.query;

        res.status(200).send(await getConfig(gameId as string));
    } catch (error) {
        res.status(400).json({ message: `Error: ${error}` });
    }
}

export async function allActivities(req: Request, res: Response) {
    try {
        const { gameId } = req.query;
        let whereQuery: WhereOptions<InferAttributes<WorldUpdateModel>> = {
            game_id: gameId as string
        };
        res.status(200).send(await getAllActivities(whereQuery));
    } catch (error) {
        res.status(400).json({ message: `Error: ${error}` });
    }
}