import express, { Request, Response } from 'express';
import { generateSoldierStatsByFaction, generateSoldierStatsByTile } from "../services/reports/activityReport.service";
import { getAvailableGameIds, getConfig, getTimespan } from '../services/reports/gameReport.service';
import { WhereOptions, InferAttributes, WhereAttributeHashValue, Op } from 'sequelize';
import { WorldUpdateModel } from '../models/activities/worldUpdate.model';
import { generatePlayerMvpLeaderboard } from '../services/reports/leaderboardReport.service';

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