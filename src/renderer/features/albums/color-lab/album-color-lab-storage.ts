import { get, set } from 'idb-keyval';

import type { ColorLabSession } from './album-color-lab-types';

const STORAGE_KEY = 'feishin-album-color-lab-v2';

export interface ColorLabStorageState {
    activeSessionId: null | string;
    sessions: ColorLabSession[];
}

export const EMPTY_COLOR_LAB_STORAGE: ColorLabStorageState = {
    activeSessionId: null,
    sessions: [],
};

export const loadColorLabStorage = async (): Promise<ColorLabStorageState> => {
    const stored = await get<ColorLabStorageState>(STORAGE_KEY);
    return stored ?? EMPTY_COLOR_LAB_STORAGE;
};

export const saveColorLabStorage = (state: ColorLabStorageState) => set(STORAGE_KEY, state);
