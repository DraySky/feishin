import { get, set } from 'idb-keyval';

import type { ColorLabBatch } from './album-color-lab-types';

const STORAGE_KEY = 'feishin-album-color-lab-v1';

export interface ColorLabStorageState {
    activeBatchId: null | string;
    activeCaseByBatch: Record<string, number>;
    batches: ColorLabBatch[];
}

export const EMPTY_COLOR_LAB_STORAGE: ColorLabStorageState = {
    activeBatchId: null,
    activeCaseByBatch: {},
    batches: [],
};

export const loadColorLabStorage = async (): Promise<ColorLabStorageState> => {
    const stored = await get<ColorLabStorageState>(STORAGE_KEY);
    return stored ?? EMPTY_COLOR_LAB_STORAGE;
};

export const saveColorLabStorage = (state: ColorLabStorageState) => set(STORAGE_KEY, state);
