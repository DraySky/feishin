import { Vibrant } from 'node-vibrant/browser';

import {
    COLOR_LAB_VIBRANT_SWATCHES,
    type ColorLabVibrantExperiment,
    type ColorLabVibrantSwatch,
} from './album-color-lab-types';

export const analyzeColorLabVibrantSample = async (
    sampleDataUrl: string,
): Promise<ColorLabVibrantExperiment> => {
    const palette = await Vibrant.from(sampleDataUrl).quality(1).getPalette();
    const swatches = Object.fromEntries(
        COLOR_LAB_VIBRANT_SWATCHES.map(({ key }) => {
            const swatch = palette[key];
            return [
                key,
                swatch
                    ? {
                          hex: swatch.hex,
                          population: swatch.population,
                          rgb: swatch.rgb.map(Math.round) as ColorLabVibrantSwatch['rgb'],
                      }
                    : null,
            ];
        }),
    ) as ColorLabVibrantExperiment['swatches'];

    return {
        analyzedAt: new Date().toISOString(),
        bestSource: null,
        engine: 'node-vibrant@4.0.4',
        swatches,
    };
};
