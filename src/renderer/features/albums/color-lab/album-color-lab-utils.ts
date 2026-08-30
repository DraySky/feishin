import type { Album } from '/@/shared/types/domain-types';

import {
    COLOR_LAB_SCHEMA_VERSION,
    ColorLabBatch,
    ColorLabCase,
    ColorLabExport,
    ColorLabSample,
    EMPTY_COLOR_LAB_FEEDBACK,
} from './album-color-lab-types';
import {
    AlbumDetailArtworkAnalysis,
    analyzeAlbumDetailArtworkPixels,
} from '../utils/album-detail-artwork-color';
import { createAlbumDetailPalette } from '../utils/album-detail-palette';

const SAMPLE_SIZE = 32;

const bytesToBase64 = (bytes: Uint8ClampedArray) => {
    let binary = '';
    for (let index = 0; index < bytes.length; index++) {
        binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
};

export const decodeColorLabSample = (sample: ColorLabSample) => {
    const binary = atob(sample.data);
    return Uint8ClampedArray.from(binary, (character) => character.charCodeAt(0));
};

export const sampleToDataUrl = (sample: ColorLabSample) => {
    const canvas = document.createElement('canvas');
    canvas.width = sample.width;
    canvas.height = sample.height;
    const context = canvas.getContext('2d');
    if (!context) return '';
    context.putImageData(new ImageData(decodeColorLabSample(sample), sample.width, sample.height), 0, 0);
    return canvas.toDataURL('image/png');
};

export const captureColorLabCase = async (
    album: Album,
    imageUrl: string,
): Promise<ColorLabCase> => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Unable to load album artwork'));
        image.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Unable to create artwork sampling context');
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    const analysis = analyzeAlbumDetailArtworkPixels(pixels);
    if (!analysis) throw new Error('Artwork contained no usable sampled pixels');
    const palette = createAlbumDetailPalette(analysis.selected.rgb);

    return {
        albumArtistName: album.albumArtistName,
        albumId: album.id,
        albumName: album.name,
        baseline: {
            analysis,
            capturedAt: new Date().toISOString(),
            palette,
            selectedRgb: analysis.selected.rgb,
            selectedTone: analysis.selected.tone,
        },
        comparisonReview: null,
        feedback: { ...EMPTY_COLOR_LAB_FEEDBACK },
        imageId: album.imageId,
        releaseYear: album.releaseYear,
        sample: {
            data: bytesToBase64(pixels),
            encoding: 'rgba8-base64',
            height: SAMPLE_SIZE,
            width: SAMPLE_SIZE,
        },
        serverId: album._serverId,
    };
};

export const replayColorLabCase = (colorCase: ColorLabCase) => {
    const analysis = analyzeAlbumDetailArtworkPixels(decodeColorLabSample(colorCase.sample));
    if (!analysis) return null;
    return { analysis, palette: createAlbumDetailPalette(analysis.selected.rgb) };
};

export const hasColorLabResultChanged = (
    baseline: AlbumDetailArtworkAnalysis,
    current: AlbumDetailArtworkAnalysis,
) => baseline.mode !== current.mode || baseline.selected.rgb !== current.selected.rgb;

export const exportColorLabBatch = (batch: ColorLabBatch) => {
    const payload: ColorLabExport = {
        batch,
        exportedAt: new Date().toISOString(),
        schemaVersion: COLOR_LAB_SCHEMA_VERSION,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const name = batch.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    anchor.download = `feishin-album-color-lab-${name || 'batch'}-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
    anchor.href = url;
    anchor.click();
    URL.revokeObjectURL(url);
};

export const parseColorLabExport = (value: unknown): ColorLabBatch => {
    const payload = value as Partial<ColorLabExport>;
    if (payload.schemaVersion !== COLOR_LAB_SCHEMA_VERSION || !payload.batch) {
        throw new Error('Unsupported Color Lab export schema');
    }
    const batch = payload.batch;
    if (
        typeof batch.id !== 'string' ||
        typeof batch.name !== 'string' ||
        !Array.isArray(batch.cases) ||
        !['calibration', 'holdout'].includes(batch.kind)
    ) {
        throw new Error('Invalid Color Lab batch');
    }
    for (const colorCase of batch.cases) {
        const sample = colorCase.sample;
        if (
            typeof colorCase.albumId !== 'string' ||
            typeof colorCase.albumName !== 'string' ||
            typeof colorCase.albumArtistName !== 'string' ||
            typeof colorCase.serverId !== 'string' ||
            !sample ||
            sample.width !== SAMPLE_SIZE ||
            sample.height !== SAMPLE_SIZE ||
            sample.encoding !== 'rgba8-base64' ||
            typeof sample.data !== 'string' ||
            decodeColorLabSample(sample).length !== SAMPLE_SIZE * SAMPLE_SIZE * 4 ||
            !colorCase.baseline?.analysis ||
            !colorCase.baseline.palette ||
            !colorCase.feedback ||
            !['unrated', 'good', 'needs-adjustment'].includes(colorCase.feedback.overall) ||
            !Array.isArray(colorCase.feedback.issues)
        ) {
            throw new Error('Invalid Color Lab case sample or baseline');
        }
    }
    return batch;
};

export const mapWithConcurrency = async <T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T) => Promise<R>,
) => {
    const results: PromiseSettledResult<R>[] = new Array(items.length);
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            try {
                results[index] = { status: 'fulfilled', value: await mapper(items[index]) };
            } catch (reason) {
                results[index] = { reason, status: 'rejected' };
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
};
