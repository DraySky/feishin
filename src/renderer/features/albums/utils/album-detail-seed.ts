import type { AlbumDetailTone } from './album-detail-palette';
import { parseAlbumDetailColor } from './album-detail-palette';

export type AlbumDetailSeedAlgorithm = 'dominant' | 'simple' | 'sqrt';

export interface AlbumDetailSeedCandidate {
    agreementBonus: number;
    algorithm: AlbumDetailSeedAlgorithm;
    baseScore: number;
    rgb: string;
    score: number;
    tone: AlbumDetailTone;
}

export interface AlbumDetailSeedSelection {
    candidates: AlbumDetailSeedCandidate[];
    mode: 'chromatic' | 'monochrome';
    selected: AlbumDetailSeedCandidate;
}

const ALGORITHM_ORDER: AlbumDetailSeedAlgorithm[] = ['dominant', 'sqrt', 'simple'];

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

const smoothstep = (min: number, max: number, value: number) => {
    const normalized = clamp((value - min) / (max - min), 0, 1);
    return normalized * normalized * (3 - 2 * normalized);
};

const hueDistance = (first: number, second: number) => {
    const difference = Math.abs(first - second) % 360;
    return Math.min(difference, 360 - difference);
};

const candidateSimilarity = (first: AlbumDetailTone, second: AlbumDetailTone) => {
    const hueWeight = clamp(Math.min(first.chroma, second.chroma) / 0.08, 0, 1);
    const distance =
        Math.abs(first.lightness - second.lightness) / 0.18 +
        Math.abs(first.chroma - second.chroma) / 0.08 +
        (hueDistance(first.hue, second.hue) / 60) * hueWeight;

    return 1 - clamp(distance, 0, 1);
};

export const scoreAlbumDetailSeed = (
    tone: AlbumDetailTone,
    mode: AlbumDetailSeedSelection['mode'],
) => {
    const nearBlackPenalty = 1 - smoothstep(0.16, 0.25, tone.lightness);

    if (mode === 'monochrome') {
        const lightnessScore = 1 - clamp(Math.abs(tone.lightness - 0.36) / 0.28, 0, 1);
        const neutralScore = 1 - smoothstep(0.035, 0.09, tone.chroma);
        const nearWhitePenalty = smoothstep(0.58, 0.78, tone.lightness);

        return (
            lightnessScore * 0.6 +
            neutralScore * 0.35 -
            nearBlackPenalty * 0.5 -
            nearWhitePenalty * 0.45
        );
    }

    const lightnessScore = 1 - clamp(Math.abs(tone.lightness - 0.405) / 0.33, 0, 1);
    const richnessScore = 1 - clamp(Math.abs(tone.chroma - 0.12) / 0.12, 0, 1);
    const washedOutPenalty =
        smoothstep(0.52, 0.7, tone.lightness) * (1 - smoothstep(0.08, 0.14, tone.chroma));
    const nearWhitePenalty = smoothstep(0.62, 0.82, tone.lightness);

    return (
        lightnessScore * 0.55 +
        richnessScore * 0.45 -
        washedOutPenalty * 0.45 -
        nearBlackPenalty * 0.35 -
        nearWhitePenalty * 0.25
    );
};

export const selectAlbumDetailSeed = (
    colors: Partial<Record<AlbumDetailSeedAlgorithm, string>>,
): AlbumDetailSeedSelection | null => {
    const parsedCandidates = ALGORITHM_ORDER.flatMap((algorithm) => {
        const rgb = colors[algorithm];
        const tone = rgb ? parseAlbumDetailColor(rgb) : null;

        return rgb && tone ? [{ algorithm, rgb, tone }] : [];
    });

    if (!parsedCandidates.length) {
        return null;
    }

    const mode =
        parsedCandidates.filter(({ tone }) => tone.chroma <= 0.05).length >= 2
            ? 'monochrome'
            : 'chromatic';
    const candidates = parsedCandidates.map((candidate) => {
        const agreementBonus = parsedCandidates
            .filter((other) => other !== candidate)
            .reduce(
                (bonus, other) => bonus + candidateSimilarity(candidate.tone, other.tone) * 0.12,
                0,
            );
        const baseScore = scoreAlbumDetailSeed(candidate.tone, mode);

        return {
            ...candidate,
            agreementBonus,
            baseScore,
            score: baseScore + agreementBonus,
        };
    });

    const selected = candidates.reduce((best, candidate) =>
        candidate.score > best.score ? candidate : best,
    );

    return { candidates, mode, selected };
};
