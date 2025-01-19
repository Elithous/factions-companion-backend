import { CreationAttributes } from "sequelize";
import { SettingsModel } from "../models/setting.model";

type SocketSettings = {
    watchList: string[]
};

interface KeyMap {
    socket: SocketSettings,
    misc: any
}

// Add default setting values if they do not exist.
export async function initSettings() {
    // TODO: This could be created in a better way that merges the default value with existing settings to account for additional settings
    getSetting('socket').then(socketSetting => {
        if (!socketSetting) {
            const defaultValue: CreationAttributes<SettingsModel> = {
                key: 'socket',
                data: {
                    watchList: []
                }
            };

            SettingsModel.create(defaultValue);
        }
    })
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
    SettingsModel.update({
        data: setting
    }, {
        where: {
            key
        }
    });
}

export async function removeSetting<T extends keyof KeyMap>(key: T) {
    SettingsModel.destroy({
        where: {
            key
        }
    });
}