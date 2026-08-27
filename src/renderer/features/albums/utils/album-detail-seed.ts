import type { AlbumDetailTone } from './album-detail-palette';
import { parseAlbumDetailColor } from './album-detail-palette';

export type AlbumDetailSeedAlgorithm = 'dominant' | 'simple' | 'sqrt';

export interface AlbumDetailSeedCandidate {
    algorithm: AlbumDetailSeedAlgorithm;
    rgb: string;
    score: number;
    tone: AlbumDetailTone;
}

export interface AlbumDetailSeedSelection {
    candidates: AlbumDetailSeedCandidate[];
    selected: AlbumDetailSeedCandidate;
}

const ALGORITHM_ORDER: AlbumDetailSeedAlgorithm[] = ['dominant', 'sqrt', 'simple'];

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

const smoothstep = (min: number, max: number, value: number) => {
    const normalized = clamp((value - min) / (max - min), 0, 1);
    return normalized * normalized * (3 - 2 * normalized);
};

export const scoreAlbumDetailSeed = (tone: AlbumDetailTone) => {
    const chromaScore =
        smoothstep(0.03, 0.16, tone.chroma) - smoothstep(0.24, 0.34, tone.chroma) * 0.2;
    const lightnessScore = 1 - clamp(Math.abs(tone.lightness - 0.5) / 0.38, 0, 1);
    const neutralPenalty = 1 - smoothstep(0.025, 0.07, tone.chroma);
    const darkPenalty = 1 - smoothstep(0.18, 0.3, tone.lightness);
    const lightPenalty = smoothstep(0.72, 0.88, tone.lightness);

    return (
        chromaScore * 0.55 +
        lightnessScore * 0.45 -
        neutralPenalty * 0.45 -
        darkPenalty * 0.4 -
        lightPenalty * 0.35
    );
};

export const selectAlbumDetailSeed = (
    colors: Partial<Record<AlbumDetailSeedAlgorithm, string>>,
): AlbumDetailSeedSelection | null => {
    const candidates = ALGORITHM_ORDER.flatMap((algorithm) => {
        const rgb = colors[algorithm];
        const tone = rgb ? parseAlbumDetailColor(rgb) : null;

        return rgb && tone
            ? [{ algorithm, rgb, score: scoreAlbumDetailSeed(tone), tone }]
            : [];
    });

    if (!candidates.length) {
        return null;
    }

    const selected = candidates.reduce((best, candidate) =>
        candidate.score > best.score ? candidate : best,
    );

    return { candidates, selected };
};
