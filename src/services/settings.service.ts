import { CreationAttributes } from "sequelize";
import { SettingsModel } from "../models/setting.model";

type SocketSettings = {
    watchList: string[]
};

interface KeyMap {
    socket: SocketSettings,
    hiddenPlayers: number[]
    misc: any
}

// Add default setting values if they do not exist.
export async function initSettings() {
    // TODO: This could be created in a better way that merges the default value with existing settings to account for additional settings
    const socketSetting = await getSetting('socket');
    if (!socketSetting) {
        const defaultValue: CreationAttributes<SettingsModel> = {
            key: 'socket',
            data: {
                watchList: []
            }
        };

        await SettingsModel.create(defaultValue);
    }
}

export async function getSetting<T extends keyof KeyMap>(key: T): Promise<KeyMap[T]> {
    const setting = (await SettingsModel.findOne({
        where: {
            key
        }
    })) as KeyMap[T];

    return setting?.data;
}

export async function setSetting<T extends keyof KeyMap>(key: T, setting: KeyMap[T]) {
    await SettingsModel.update({
        data: setting
    }, {
        where: {
            key
        }
    });
}

export async function removeSetting<T extends keyof KeyMap>(key: T) {
    await SettingsModel.destroy({
        where: {
            key
        }
    });
}

/**
 * The watch list in the database is the source of truth for which games get
 * collected. The API edits it and the worker process acts on it (see
 * `reconcileWatchedGames`), so neither needs to share memory with the other.
 */
export async function getWatchList(): Promise<string[]> {
    return (await getSetting('socket'))?.watchList ?? [];
}

/** Returns false if the game was already on the list. */
export async function addToWatchList(gameId: string): Promise<boolean> {
    const watchList = await getWatchList();
    if (watchList.includes(gameId)) return false;

    await setSetting('socket', { watchList: [...watchList, gameId] });
    return true;
}

/** Returns false if the game wasn't on the list. */
export async function removeFromWatchList(gameId: string): Promise<boolean> {
    const watchList = await getWatchList();
    if (!watchList.includes(gameId)) return false;

    await setSetting('socket', { watchList: watchList.filter(id => id !== gameId) });
    return true;
}
