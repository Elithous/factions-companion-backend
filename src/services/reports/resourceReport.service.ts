/** Player-to-player resource transfer leaderboards. */

import { ActivitiesModel } from "../../models/activities/activities.model";
import { ReportType, withReportCache } from "./reportCache.service";

export function generateResourcesSentLeaderboard(gameId: string) {
    return withReportCache(gameId, ReportType.RESOURCES_SENT, () => buildResourcesSentLeaderboard(gameId));
}

async function buildResourcesSentLeaderboard(gameId: string) {
    const allResourceSends = await ActivitiesModel.findAll({
        attributes: ['player_name', 'iron', 'wood', 'recipient'],
        where: {
            game_id: gameId,
            type: 'resources_sent'
        },
        order: ['player_name']
    });

    // Aggregate resources sent by player and recipient
    const playerResources: { [player: string]: { totalIron: number, totalWood: number, recipients: { [recipient: string]: { iron: number, wood: number } } } } = {};

    for (const send of allResourceSends) {
        const player = send.player_name;
        const recipient = send.recipient || 'unknown';
        const iron = send.iron || 0;
        const wood = send.wood || 0;

        // Initialize player entry if needed
        if (!playerResources[player]) {
            playerResources[player] = {
                totalIron: 0,
                totalWood: 0,
                recipients: {}
            };
        }

        // Initialize recipient entry if needed
        if (!playerResources[player].recipients[recipient]) {
            playerResources[player].recipients[recipient] = {
                iron: 0,
                wood: 0
            };
        }

        // Add to totals
        playerResources[player].totalIron += iron;
        playerResources[player].totalWood += wood;
        playerResources[player].recipients[recipient].iron += iron;
        playerResources[player].recipients[recipient].wood += wood;
    }

    // Convert to sorted array format
    const sortedLeaderboard = Object.entries(playerResources)
        .map(([player, data]) => ({
            player,
            totalIron: data.totalIron,
            totalWood: data.totalWood,
            totalResources: data.totalIron + data.totalWood,
            recipients: data.recipients
        }))
        .sort((a, b) => b.totalResources - a.totalResources);


    // Sort recipients for each player by total resources sent to them
    sortedLeaderboard.forEach(entry => {
        entry.recipients = Object.fromEntries(
            Object.entries(entry.recipients)
                .sort(([, a], [, b]) => (b.iron + b.wood) - (a.iron + a.wood))
        );
    });

    return sortedLeaderboard;
}

export function generateResourcesReceivedLeaderboard(gameId: string) {
    return withReportCache(gameId, ReportType.RESOURCES_RECEIVED, () => buildResourcesReceivedLeaderboard(gameId));
}

async function buildResourcesReceivedLeaderboard(gameId: string) {
    const allResourceSends = await ActivitiesModel.findAll({
        attributes: ['player_name', 'iron', 'wood', 'recipient', 'player_faction'],
        where: {
            game_id: gameId,
            type: 'resources_sent'
        },
        order: ['recipient']
    });

    // Aggregate resources received by recipient and sender
    const recipientResources: { [recipient: string]: { totalIron: number, totalWood: number, senders: { [sender: string]: { iron: number, wood: number } } } } = {};

    for (const send of allResourceSends) {
        const sender = send.player_name;
        const recipient = send.recipient || 'unknown';
        const iron = send.iron || 0;
        const wood = send.wood || 0;
        const senderFaction = send.player_faction;

        // Skip if recipient is unknown or empty
        if (!recipient || recipient === 'unknown') {
            continue;
        }

        // Handle special case where recipient is "all" - use sender's faction color
        const displayRecipient = recipient === 'all' ? `all (${senderFaction || 'unknown'})` : recipient;

        // Initialize recipient entry if needed
        if (!recipientResources[displayRecipient]) {
            recipientResources[displayRecipient] = {
                totalIron: 0,
                totalWood: 0,
                senders: {}
            };
        }

        // Initialize sender entry if needed
        if (!recipientResources[displayRecipient].senders[sender]) {
            recipientResources[displayRecipient].senders[sender] = {
                iron: 0,
                wood: 0
            };
        }

        // Add to totals
        recipientResources[displayRecipient].totalIron += iron;
        recipientResources[displayRecipient].totalWood += wood;
        recipientResources[displayRecipient].senders[sender].iron += iron;
        recipientResources[displayRecipient].senders[sender].wood += wood;
    }

    // Convert to sorted array format
    const sortedLeaderboard = Object.entries(recipientResources)
        .map(([recipient, data]) => ({
            recipient,
            totalIron: data.totalIron,
            totalWood: data.totalWood,
            totalResources: data.totalIron + data.totalWood,
            senders: data.senders
        }))
        .sort((a, b) => b.totalResources - a.totalResources);

    // Sort senders for each recipient by total resources received from them
    sortedLeaderboard.forEach(entry => {
        entry.senders = Object.fromEntries(
            Object.entries(entry.senders)
                .sort(([, a], [, b]) => (b.iron + b.wood) - (a.iron + a.wood))
        );
    });

    return sortedLeaderboard;
}
