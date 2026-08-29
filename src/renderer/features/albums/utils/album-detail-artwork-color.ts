import type { AlbumDetailTone } from './album-detail-palette';
import { parseAlbumDetailColor } from './album-detail-palette';

const SAMPLE_SIZE = 32;
const MONOCHROME_SHARE = 0.8;
const MIN_CLUSTER_COVERAGE = 0.06;
const DISPLAY_CHROMA_TARGET = 0.15;
const DISPLAY_LIGHTNESS_TARGET = 0.45;

interface SampledPixel {
    blue: number;
    green: number;
    red: number;
    spatialWeight: number;
    tone: AlbumDetailTone;
    x: number;
    y: number;
}

export interface AlbumDetailArtworkCluster {
    backgroundSuitability: number;
    chromaticEnergy: number;
    coverage: number;
    coverageScore: number;
    displayLightnessScore: number;
    displayRichnessScore: number;
    energyScore: number;
    freshnessScore: number;
    hueFamily: number;
    hueFamilyCoverage: number;
    familyEvidence: number;
    familyEvidenceNormalized: number;
    mudPenalty: number;
    richnessScore: number;
    rgb: string;
    salientEnergy: number;
    score: number;
    spatialSalience: number;
    tone: AlbumDetailTone;
    washedOutPenalty: number;
}

export interface AlbumDetailArtworkHueFamily {
    accentQualified: boolean;
    averageChroma: number;
    averageLightness: number;
    darkChromaticQualified: boolean;
    chromaticEnergy: number;
    coverage: number;
    familyEvidence: number;
    hueFamily: number;
    hueConsistency: number;
    rawFamilyEvidence: number;
    salientEnergy: number;
    spatialSalience: number;
    shortlisted: boolean;
    shortlistReason:
        | 'dark-chromatic'
        | 'high-intensity-accent'
        | 'relative-evidence'
        | 'salient-accent'
        | 'substantial-accent'
        | null;
    vividWarmShare: number;
    warmAverageChroma: number;
    warmEvidencePenalty: number;
    warmMudShare: number;
    warmQuality: number;
}

export interface AlbumDetailArtworkCorrection {
    adjustments: string[];
    originalRgb: string;
}

export interface AlbumDetailArtworkWarmDecision {
    alternativeFamilyConsidered: number | null;
    alternativeTriggered: boolean;
    evidenceRatio: number | null;
    cleanerSameFamilyCandidateRgb: string | null;
    sameFamilyCoverageRatio: number | null;
    sameFamilyEnergyRatio: number | null;
    sameFamilyMudPenaltyDifference: number | null;
    sameFamilySuitabilityDifference: number | null;
    originalWinningFamily: number | null;
    selectedFamily: number | null;
    suitabilityDifference: number | null;
    topWarmClusterRgb: string | null;
    warmCorrectionApplied: boolean;
}

export interface AlbumDetailArtworkAnalysis {
    accentRescued: boolean;
    accentRescueReason: 'high-intensity' | 'salient' | 'substantial' | null;
    chromaticShare: number;
    clusters: AlbumDetailArtworkCluster[];
    correction: AlbumDetailArtworkCorrection;
    hueFamilies: AlbumDetailArtworkHueFamily[];
    largestChromaticHueFamilyAverageChroma: number;
    largestChromaticHueFamilyCoverage: number;
    mode: 'chromatic' | 'monochrome';
    meaningfulChromaThreshold: number;
    neutralShare: number;
    neutralClassificationReason: 'coherent-dark-color' | 'meaningful-color' | 'neutral';
    sampleCount: number;
    selected: AlbumDetailArtworkCluster;
    strongestChromaticHueFamilyEnergy: number;
    strongestChromaticHueFamilySalientEnergy: number;
    warmDecision: AlbumDetailArtworkWarmDecision;
}

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

const smoothstep = (min: number, max: number, value: number) => {
    const normalized = clamp((value - min) / (max - min), 0, 1);
    return normalized * normalized * (3 - 2 * normalized);
};

const getMeaningfulChromaThreshold = (lightness: number) =>
    0.028 + smoothstep(0.18, 0.5, lightness) * 0.032;

const isMeaningfullyChromatic = (tone: AlbumDetailTone) =>
    tone.lightness >= 0.12 && tone.chroma >= getMeaningfulChromaThreshold(tone.lightness);

const scoreHueConsistency = (pixels: SampledPixel[]) => {
    const vectors = pixels.reduce(
        (result, pixel) => {
            const radians = (pixel.tone.hue * Math.PI) / 180;
            return {
                x: result.x + Math.cos(radians),
                y: result.y + Math.sin(radians),
            };
        },
        { x: 0, y: 0 },
    );

    return Math.hypot(vectors.x, vectors.y) / pixels.length;
};

const warmHueWeight = (hue: number) =>
    smoothstep(30, 45, hue) * (1 - smoothstep(100, 115, hue));

const warmMudWeight = (tone: AlbumDetailTone) =>
    warmHueWeight(tone.hue) *
    (1 - smoothstep(0.115, 0.18, tone.chroma)) *
    (1 - smoothstep(0.65, 0.8, tone.lightness));

const vividWarmWeight = (tone: AlbumDetailTone) =>
    warmHueWeight(tone.hue) *
    smoothstep(0.105, 0.16, tone.chroma) *
    (1 - smoothstep(0.82, 0.92, tone.lightness));

const spatialWeight = (x: number, y: number) => {
    const edgeDistance = Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)) * 2;
    return 1.15 - 0.35 * edgeDistance ** 1.5;
};

const getAccentReason = (
    family: Pick<
        AlbumDetailArtworkHueFamily,
        | 'averageChroma'
        | 'chromaticEnergy'
        | 'coverage'
        | 'hueConsistency'
        | 'salientEnergy'
        | 'spatialSalience'
    >,
) => {
    if (
        family.coverage >= 0.085 &&
        family.averageChroma >= 0.11 &&
        family.chromaticEnergy >= 0.015
    ) {
        return 'substantial-accent' as const;
    }

    if (
        family.coverage >= 0.04 &&
        family.averageChroma >= 0.145 &&
        family.spatialSalience >= 1.03 &&
        family.salientEnergy >= 0.008
    ) {
        return 'salient-accent' as const;
    }

    if (
        family.coverage >= 0.025 &&
        family.averageChroma >= 0.17 &&
        family.hueConsistency >= 0.94 &&
        family.spatialSalience >= 1.04 &&
        family.chromaticEnergy >= 0.0045 &&
        family.salientEnergy >= 0.0048
    ) {
        return 'high-intensity-accent' as const;
    }

    return null;
};

const isDarkChromaticFamily = (
    family: Pick<
        AlbumDetailArtworkHueFamily,
        | 'averageChroma'
        | 'averageLightness'
        | 'chromaticEnergy'
        | 'coverage'
        | 'hueConsistency'
        | 'spatialSalience'
    >,
) =>
    family.averageLightness <= 0.38 &&
    family.averageChroma >= getMeaningfulChromaThreshold(family.averageLightness) &&
    family.coverage >= 0.18 &&
    family.hueConsistency >= 0.92 &&
    family.chromaticEnergy >= 0.0055 &&
    family.spatialSalience >= 0.9;

const scoreHueFamilyEvidence = (
    family: Pick<
        AlbumDetailArtworkHueFamily,
        'chromaticEnergy' | 'coverage' | 'salientEnergy' | 'spatialSalience'
    >,
) =>
    clamp(family.coverage / 0.3, 0, 1) * 0.35 +
    clamp(family.chromaticEnergy / 0.03, 0, 1) * 0.25 +
    clamp(family.salientEnergy / 0.03, 0, 1) * 0.25 +
    clamp((family.spatialSalience - 0.8) / 0.35, 0, 1) * 0.15;

const calculateWarmFamilyMetrics = (pixels: SampledPixel[], rawFamilyEvidence: number) => {
    const warmWeight = pixels.reduce(
        (total, pixel) => total + warmHueWeight(pixel.tone.hue),
        0,
    );

    if (!warmWeight) {
        return {
            familyEvidence: rawFamilyEvidence,
            vividWarmShare: 0,
            warmAverageChroma: 0,
            warmEvidencePenalty: 0,
            warmMudShare: 0,
            warmQuality: 1,
        };
    }

    const warmAverageChroma =
        pixels.reduce(
            (total, pixel) =>
                total + pixel.tone.chroma * warmHueWeight(pixel.tone.hue),
            0,
        ) / warmWeight;
    const warmMudShare =
        pixels.reduce((total, pixel) => total + warmMudWeight(pixel.tone), 0) / pixels.length;
    const vividWarmShare =
        pixels.reduce((total, pixel) => total + vividWarmWeight(pixel.tone), 0) / pixels.length;
    const warmQuality = clamp(
        vividWarmShare * 0.55 +
            clamp(warmAverageChroma / 0.16, 0, 1) * 0.45 -
            warmMudShare * 0.5,
        0,
        1,
    );
    const warmEvidencePenalty =
        rawFamilyEvidence * clamp(warmMudShare - vividWarmShare * 0.75, 0, 1) * 0.28;

    return {
        familyEvidence: rawFamilyEvidence - warmEvidencePenalty,
        vividWarmShare,
        warmAverageChroma,
        warmEvidencePenalty,
        warmMudShare,
        warmQuality,
    };
};

const scoreBackgroundSuitability = (scores: {
    brightPenalty: number;
    coverageScore: number;
    energyScore: number;
    freshnessScore: number;
    lightnessScore: number;
    mudPenalty: number;
    richnessScore: number;
    salienceScore: number;
    tinyClusterPenalty: number;
    washedOutPenalty: number;
}) =>
    clamp(
        scores.lightnessScore * 0.22 +
            scores.richnessScore * 0.24 +
            scores.freshnessScore * 0.26 +
            scores.energyScore * 0.08 +
            scores.salienceScore * 0.08 +
            scores.coverageScore * 0.04 -
            scores.mudPenalty * 0.38 -
            scores.washedOutPenalty * 0.25 -
            scores.brightPenalty * 0.18 -
            scores.tinyClusterPenalty * 0.15,
        0,
        1,
    );

const scoreDisplayLightness = (lightness: number) =>
    1 - clamp(Math.abs(lightness - DISPLAY_LIGHTNESS_TARGET) / 0.28, 0, 1);

const scoreDisplayRichness = (chroma: number) =>
    1 - clamp(Math.abs(chroma - DISPLAY_CHROMA_TARGET) / 0.14, 0, 1);

const getCleanerWarmClusterDecision = (
    selected: AlbumDetailArtworkCluster | undefined,
    clusters: AlbumDetailArtworkCluster[],
) => {
    if (!selected || warmHueWeight(selected.tone.hue) <= 0.5) {
        return null;
    }

    const familyClusters = clusters.filter(({ hueFamily }) => hueFamily === selected.hueFamily);
    const highestCoverage = [...familyClusters].sort(
        (first, second) => second.coverage - first.coverage,
    )[0];

    if (selected.mudPenalty > 0.2) {
        const cleaner = familyClusters
            .filter(
                (candidate) =>
                    candidate !== selected &&
                    (candidate.coverage / selected.coverage >= 0.3 ||
                        candidate.chromaticEnergy / selected.chromaticEnergy >= 0.4) &&
                    selected.mudPenalty - candidate.mudPenalty >= 0.15 &&
                    candidate.richnessScore > selected.richnessScore &&
                    candidate.backgroundSuitability >= selected.backgroundSuitability - 0.03,
            )
            .sort(
                (first, second) =>
                    second.backgroundSuitability - first.backgroundSuitability,
            )[0];

        if (cleaner) {
            return {
                applied: true,
                coverageRatio: cleaner.coverage / selected.coverage,
                energyRatio: cleaner.chromaticEnergy / selected.chromaticEnergy,
                highestCoverage: selected,
                mudPenaltyDifference: selected.mudPenalty - cleaner.mudPenalty,
                selected: cleaner,
                suitabilityDifference:
                    cleaner.backgroundSuitability - selected.backgroundSuitability,
            };
        }
    }

    if (!highestCoverage || highestCoverage === selected) {
        return null;
    }

    const coverageRatio = selected.coverage / highestCoverage.coverage;
    const energyRatio = selected.chromaticEnergy / highestCoverage.chromaticEnergy;
    const mudPenaltyDifference = highestCoverage.mudPenalty - selected.mudPenalty;
    const suitabilityDifference =
        selected.backgroundSuitability - highestCoverage.backgroundSuitability;
    const applied =
        (coverageRatio >= 0.3 || energyRatio >= 0.4) &&
        mudPenaltyDifference >= 0.15 &&
        selected.richnessScore > highestCoverage.richnessScore &&
        suitabilityDifference > 0.03;

    return {
        applied,
        coverageRatio,
        energyRatio,
        highestCoverage,
        mudPenaltyDifference,
        selected,
        suitabilityDifference,
    };
};

const toRgb = (red: number, green: number, blue: number) =>
    `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;

const toneToRgb = (lightness: number, chroma: number, hue: number) => {
    const radians = (hue * Math.PI) / 180;
    const a = chroma * Math.cos(radians);
    const b = chroma * Math.sin(radians);
    const linearL = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const linearM = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const linearS = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const channels = [
        4.0767416621 * linearL - 3.3077115913 * linearM + 0.2309699292 * linearS,
        -1.2684380046 * linearL + 2.6097574011 * linearM - 0.3413193965 * linearS,
        -0.0041960863 * linearL - 0.7034186147 * linearM + 1.707614701 * linearS,
    ].map((channel) => {
        const normalized = clamp(channel, 0, 1);
        return (
            255 *
            (normalized <= 0.0031308
                ? normalized * 12.92
                : 1.055 * normalized ** (1 / 2.4) - 0.055)
        );
    });

    return toRgb(channels[0], channels[1], channels[2]);
};

const polishSelectedTone = (selected: AlbumDetailArtworkCluster) => {
    const adjustments: string[] = [];
    let { chroma, hue, lightness } = selected.tone;
    const muddyWarm = warmHueWeight(hue) > 0.5 && selected.mudPenalty > 0.2;

    if (muddyWarm) {
        const chromaIncrease = Math.min(0.05, Math.max(0, 0.165 - chroma) * 0.7);
        const lightnessIncrease = Math.min(0.04, Math.max(0, 0.51 - lightness) * 0.5);

        chroma += chromaIncrease;
        lightness += lightnessIncrease;
        if (chromaIncrease) adjustments.push('warm-enriched');
        if (lightnessIncrease) adjustments.push('warm-lifted');
    } else if (
        lightness > 0.68 ||
        (lightness > 0.62 && (selected.washedOutPenalty > 0.15 || chroma < 0.12))
    ) {
        lightness -= Math.min(0.04, (lightness - 0.6) * 0.5);
        adjustments.push('bright-trimmed');
    }

    if (!muddyWarm && chroma < DISPLAY_CHROMA_TARGET) {
        chroma += Math.min(0.04, (DISPLAY_CHROMA_TARGET - chroma) * 0.6);
        adjustments.push('enriched');
    }

    if (!adjustments.length) {
        return {
            correction: { adjustments, originalRgb: selected.rgb },
            selected,
        };
    }

    const rgb = toneToRgb(lightness, chroma, hue);
    const tone = parseAlbumDetailColor(rgb);

    return {
        correction: { adjustments, originalRgb: selected.rgb },
        selected: tone ? { ...selected, rgb, tone } : selected,
    };
};

const neutralRgb = (lightness: number) => {
    const linear = lightness ** 3;
    const channel =
        255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055);
    return toRgb(channel, channel, channel);
};

const createCluster = (
    pixels: SampledPixel[],
    sampleCount: number,
): AlbumDetailArtworkCluster | null => {
    const totals = pixels.reduce(
        (result, pixel) => ({
            blue: result.blue + pixel.blue,
            green: result.green + pixel.green,
            red: result.red + pixel.red,
        }),
        { blue: 0, green: 0, red: 0 },
    );
    const rgb = toRgb(
        totals.red / pixels.length,
        totals.green / pixels.length,
        totals.blue / pixels.length,
    );
    const tone = parseAlbumDetailColor(rgb);

    return tone
        ? {
              backgroundSuitability: 0,
              chromaticEnergy: 0,
              coverage: pixels.length / sampleCount,
              coverageScore: 0,
              displayLightnessScore: 0,
              displayRichnessScore: 0,
              energyScore: 0,
              familyEvidence: 0,
              familyEvidenceNormalized: 0,
              freshnessScore: 0,
              hueFamily: Math.floor(tone.hue / 60),
              hueFamilyCoverage: 0,
              mudPenalty: 0,
              richnessScore: 0,
              rgb,
              salientEnergy:
                  pixels.reduce(
                      (total, pixel) => total + pixel.tone.chroma * pixel.spatialWeight,
                      0,
                  ) / sampleCount,
              score: 0,
              spatialSalience:
                  pixels.reduce((total, pixel) => total + pixel.spatialWeight, 0) /
                  pixels.length,
              tone,
              washedOutPenalty: 0,
          }
        : null;
};

export const analyzeAlbumDetailArtworkPixels = (
    data: Uint8ClampedArray,
): AlbumDetailArtworkAnalysis | null => {
    const pixels: SampledPixel[] = [];
    const sampleWidth = Math.round(Math.sqrt(data.length / 4));
    const sampleHeight = Math.ceil(data.length / 4 / sampleWidth);

    for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] < 32) {
            continue;
        }

        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const tone = parseAlbumDetailColor(toRgb(red, green, blue));
        const pixelIndex = index / 4;
        const x = (pixelIndex % sampleWidth) / Math.max(sampleWidth - 1, 1);
        const y = Math.floor(pixelIndex / sampleWidth) / Math.max(sampleHeight - 1, 1);

        if (tone) {
            pixels.push({ blue, green, red, spatialWeight: spatialWeight(x, y), tone, x, y });
        }
    }

    if (!pixels.length) {
        return null;
    }

    const neutralPixels = pixels.filter(({ tone }) => !isMeaningfullyChromatic(tone));
    const neutralShare = neutralPixels.length / pixels.length;
    const chromaticPixels = pixels.filter(({ tone }) => isMeaningfullyChromatic(tone));
    const chromaticShare = chromaticPixels.length / pixels.length;
    const averageArtworkLightness =
        pixels.reduce((total, pixel) => total + pixel.tone.lightness, 0) / pixels.length;
    const meaningfulChromaThreshold = getMeaningfulChromaThreshold(averageArtworkLightness);
    const hueFamilies = new Map<number, SampledPixel[]>();

    for (const pixel of chromaticPixels) {
        const family = Math.floor(pixel.tone.hue / 60);
        const members = hueFamilies.get(family);

        if (members) {
            members.push(pixel);
        } else {
            hueFamilies.set(family, [pixel]);
        }
    }

    const rawHueFamilyStats: AlbumDetailArtworkHueFamily[] = [...hueFamilies.entries()].map(
        ([hueFamily, family]) => {
            const coverage = family.length / pixels.length;
            const averageChroma =
                family.reduce((total, pixel) => total + pixel.tone.chroma, 0) / family.length;
            const averageLightness =
                family.reduce((total, pixel) => total + pixel.tone.lightness, 0) / family.length;
            const hueConsistency = scoreHueConsistency(family);
            const spatialSalience =
                family.reduce((total, pixel) => total + pixel.spatialWeight, 0) / family.length;
            const salientEnergy =
                family.reduce(
                    (total, pixel) => total + pixel.tone.chroma * pixel.spatialWeight,
                    0,
                ) / pixels.length;

            const rawFamilyEvidence = scoreHueFamilyEvidence({
                chromaticEnergy: coverage * averageChroma,
                coverage,
                salientEnergy,
                spatialSalience,
            });
            const warmMetrics = calculateWarmFamilyMetrics(family, rawFamilyEvidence);
            const darkChromaticQualified = isDarkChromaticFamily({
                averageChroma,
                averageLightness,
                chromaticEnergy: coverage * averageChroma,
                coverage,
                hueConsistency,
                spatialSalience,
            });

            return {
                accentQualified: false,
                averageChroma,
                averageLightness,
                chromaticEnergy: coverage * averageChroma,
                coverage,
                darkChromaticQualified,
                ...warmMetrics,
                hueFamily,
                hueConsistency,
                rawFamilyEvidence,
                salientEnergy,
                spatialSalience,
                shortlisted: false,
                shortlistReason: null,
            };
        },
    );
    const bestFamilyEvidence = Math.max(
        0,
        ...rawHueFamilyStats.map(({ familyEvidence }) => familyEvidence),
    );
    const hueFamilyStats = rawHueFamilyStats.map((family) => {
        const { familyEvidence } = family;
        const accentReason = getAccentReason(family);
        const relativeEvidence =
            familyEvidence >= 0.12 && familyEvidence >= bestFamilyEvidence * 0.68;
        const shortlistReason: AlbumDetailArtworkHueFamily['shortlistReason'] =
            accentReason ??
            (family.darkChromaticQualified
                ? 'dark-chromatic'
                : relativeEvidence
                  ? 'relative-evidence'
                  : null);

        return {
            ...family,
            accentQualified: accentReason !== null,
            familyEvidence,
            shortlisted: shortlistReason !== null,
            shortlistReason,
        };
    });
    const largestHueFamily = [...hueFamilyStats].sort(
        (first, second) => second.coverage - first.coverage,
    )[0];
    const largestChromaticHueFamilyCoverage = largestHueFamily
        ? largestHueFamily.coverage
        : 0;
    const largestChromaticHueFamilyAverageChroma = largestHueFamily
        ? largestHueFamily.averageChroma
        : 0;
    const strongestChromaticHueFamilyEnergy = Math.max(
        0,
        ...hueFamilyStats.map(({ chromaticEnergy }) => chromaticEnergy),
    );
    const strongestChromaticHueFamilySalientEnergy = Math.max(
        0,
        ...hueFamilyStats.map(({ salientEnergy }) => salientEnergy),
    );
    const shortlistedAccent = hueFamilyStats.find(
        ({ shortlistReason }) => shortlistReason === 'substantial-accent',
    ) ??
        hueFamilyStats.find(({ shortlistReason }) => shortlistReason === 'salient-accent') ??
        hueFamilyStats.find(
            ({ shortlistReason }) => shortlistReason === 'high-intensity-accent',
        );
    const accentRescueReason =
        neutralShare < MONOCHROME_SHARE
            ? null
            : shortlistedAccent?.shortlistReason === 'substantial-accent'
              ? 'substantial'
              : shortlistedAccent?.shortlistReason === 'salient-accent'
                ? 'salient'
                : shortlistedAccent?.shortlistReason === 'high-intensity-accent'
                  ? 'high-intensity'
                  : null;
    const accentRescued = accentRescueReason !== null;
    const darkChromaticRescued = hueFamilyStats.some(
        ({ darkChromaticQualified }) => darkChromaticQualified,
    );
    const hasCredibleChromaticFamily = hueFamilyStats.some(
        ({ averageChroma, coverage, darkChromaticQualified, shortlistReason }) =>
            darkChromaticQualified ||
            shortlistReason?.includes('accent') ||
            (coverage >= 0.1 && averageChroma >= 0.055),
    );
    const isMonochrome =
        !accentRescued &&
        !darkChromaticRescued &&
        (neutralShare >= MONOCHROME_SHARE ||
            (averageArtworkLightness < 0.3 && !hasCredibleChromaticFamily));
    const neutralClassificationReason = darkChromaticRescued
        ? 'coherent-dark-color'
        : isMonochrome
          ? 'neutral'
          : 'meaningful-color';

    if (isMonochrome) {
        const lightnesses = (neutralPixels.length ? neutralPixels : pixels)
            .map(({ tone }) => tone.lightness)
            .sort((first, second) => first - second);
        const lightness = clamp(
            lightnesses[Math.floor((lightnesses.length - 1) * 0.6)],
            0.28,
            0.42,
        );
        const rgb = neutralRgb(lightness);
        const tone = parseAlbumDetailColor(rgb);

        return tone
            ? {
                  accentRescueReason,
                  accentRescued,
                  chromaticShare,
                  clusters: [],
                  hueFamilies: hueFamilyStats,
                  largestChromaticHueFamilyAverageChroma,
                  largestChromaticHueFamilyCoverage,
                  mode: 'monochrome',
                  meaningfulChromaThreshold,
                  neutralShare,
                  neutralClassificationReason,
                  sampleCount: pixels.length,
                  correction: { adjustments: ['neutral'], originalRgb: rgb },
                  selected: {
                      backgroundSuitability: 1,
                      chromaticEnergy: 0,
                      coverage: neutralShare,
                      coverageScore: 0,
                      displayLightnessScore: 1,
                      displayRichnessScore: 0,
                      energyScore: 0,
                      familyEvidence: 0,
                      familyEvidenceNormalized: 0,
                      freshnessScore: 1,
                      hueFamily: 0,
                      hueFamilyCoverage: 0,
                      mudPenalty: 0,
                      richnessScore: 0,
                      rgb,
                      salientEnergy: 0,
                      score: 1,
                      spatialSalience: 1,
                      tone,
                      washedOutPenalty: 0,
                  },
                  strongestChromaticHueFamilyEnergy,
                  strongestChromaticHueFamilySalientEnergy,
                  warmDecision: {
                      alternativeFamilyConsidered: null,
                      alternativeTriggered: false,
                      evidenceRatio: null,
                      originalWinningFamily: null,
                      cleanerSameFamilyCandidateRgb: null,
                      sameFamilyCoverageRatio: null,
                      sameFamilyEnergyRatio: null,
                      sameFamilyMudPenaltyDifference: null,
                      sameFamilySuitabilityDifference: null,
                      selectedFamily: null,
                      suitabilityDifference: null,
                      topWarmClusterRgb: null,
                      warmCorrectionApplied: false,
                  },
              }
            : null;
    }

    const buckets = new Map<string, SampledPixel[]>();

    for (const pixel of pixels) {
        const { tone } = pixel;

        if (!isMeaningfullyChromatic(tone) || tone.lightness > 0.9) {
            continue;
        }

        const key = `${Math.floor(tone.hue / 30)}:${Math.floor(tone.lightness / 0.1)}:${Math.floor(tone.chroma / 0.05)}`;
        const bucket = buckets.get(key);

        if (bucket) {
            bucket.push(pixel);
        } else {
            buckets.set(key, [pixel]);
        }
    }

    const shortlistedFamilies = hueFamilyStats.filter(({ shortlisted }) => shortlisted);
    const eligibleFamilies = new Set(
        (
            shortlistedFamilies.length
                ? shortlistedFamilies
                : largestHueFamily
                  ? [largestHueFamily]
                  : []
        ).map(({ hueFamily }) => hueFamily),
    );
    const clusters = [...buckets.values()]
        .map((bucket) => createCluster(bucket, pixels.length))
        .filter((cluster): cluster is AlbumDetailArtworkCluster => Boolean(cluster))
        .filter((cluster) => eligibleFamilies.has(cluster.hueFamily))
        .map((cluster) => {
            const lightnessScore = scoreDisplayLightness(cluster.tone.lightness);
            const richnessScore = scoreDisplayRichness(cluster.tone.chroma);
            const coverageScore = clamp(cluster.coverage / 0.3, 0, 1);
            const chromaticEnergy = cluster.coverage * cluster.tone.chroma;
            const energyScore = clamp(chromaticEnergy / 0.03, 0, 1);
            const family = hueFamilyStats.find(
                ({ hueFamily }) => hueFamily === cluster.hueFamily,
            );
            const familyEvidence = family?.familyEvidence ?? 0;
            const familyEvidenceNormalized =
                bestFamilyEvidence > 0 ? familyEvidence / bestFamilyEvidence : 0;
            const hueFamilyCoverage = family?.coverage ?? 0;
            const salienceScore = clamp(cluster.salientEnergy / 0.025, 0, 1);
            const tinyClusterPenalty =
                1 - clamp(cluster.coverage / MIN_CLUSTER_COVERAGE, 0, 1);
            const washedOutPenalty =
                smoothstep(0.58, 0.74, cluster.tone.lightness) *
                (1 - smoothstep(0.08, 0.12, cluster.tone.chroma));
            const brightPenalty = smoothstep(0.68, 0.86, cluster.tone.lightness);
            const mudHue =
                smoothstep(45, 72, cluster.tone.hue) *
                (1 - smoothstep(115, 140, cluster.tone.hue));
            const mudLightness = 1 - smoothstep(0.62, 0.78, cluster.tone.lightness);
            const mudPenalty =
                mudHue *
                mudLightness *
                (1 - smoothstep(0.12, 0.18, cluster.tone.chroma));
            const freshnessScore = clamp(
                lightnessScore * 0.45 +
                    richnessScore * 0.55 -
                    washedOutPenalty * 0.4 -
                    mudPenalty * 0.25,
                0,
                1,
            );
            const backgroundSuitability = scoreBackgroundSuitability({
                brightPenalty,
                coverageScore,
                energyScore,
                freshnessScore,
                lightnessScore,
                mudPenalty,
                richnessScore,
                salienceScore,
                tinyClusterPenalty,
                washedOutPenalty,
            });

            return {
                ...cluster,
                backgroundSuitability,
                chromaticEnergy,
                coverageScore,
                displayLightnessScore: lightnessScore,
                displayRichnessScore: richnessScore,
                energyScore,
                familyEvidence,
                familyEvidenceNormalized,
                freshnessScore,
                hueFamilyCoverage,
                mudPenalty,
                richnessScore,
                score: familyEvidenceNormalized * 0.35 + backgroundSuitability * 0.65,
                washedOutPenalty,
            };
        })
        .sort((first, second) => second.score - first.score);

    const cleanerWarmDecision = getCleanerWarmClusterDecision(clusters[0], clusters);
    const selectedCluster = cleanerWarmDecision?.selected ?? clusters[0];
    const polishedSelection = selectedCluster ? polishSelectedTone(selectedCluster) : null;

    if (cleanerWarmDecision?.applied && polishedSelection) {
        polishedSelection.correction.adjustments.unshift('warm-cleaner-candidate');
    }
    const rawWinningFamily = [...hueFamilyStats].sort(
        (first, second) => second.rawFamilyEvidence - first.rawFamilyEvidence,
    )[0];
    const rawWinningCluster = clusters.find(
        ({ hueFamily }) => hueFamily === rawWinningFamily?.hueFamily,
    );
    const selectedFamily = polishedSelection
        ? hueFamilyStats.find(
              ({ hueFamily }) => hueFamily === polishedSelection.selected.hueFamily,
          )
        : null;
    const originalWasMuddyWarm = Boolean(
        rawWinningFamily &&
        rawWinningFamily.warmMudShare > 0.25 &&
        rawWinningFamily.warmQuality < 0.5,
    );
    const alternativeTriggered = Boolean(
        originalWasMuddyWarm &&
        selectedFamily &&
        selectedFamily.hueFamily !== rawWinningFamily?.hueFamily,
    );

    return polishedSelection
        ? {
              accentRescueReason,
              accentRescued,
              chromaticShare,
              clusters,
              correction: polishedSelection.correction,
              hueFamilies: hueFamilyStats,
              largestChromaticHueFamilyAverageChroma,
              largestChromaticHueFamilyCoverage,
              mode: 'chromatic',
              meaningfulChromaThreshold,
              neutralShare,
              neutralClassificationReason,
              sampleCount: pixels.length,
              selected: polishedSelection.selected,
              strongestChromaticHueFamilyEnergy,
              strongestChromaticHueFamilySalientEnergy,
              warmDecision: {
                  alternativeFamilyConsidered: alternativeTriggered
                      ? selectedFamily?.hueFamily ?? null
                      : null,
                  alternativeTriggered,
                  evidenceRatio:
                      alternativeTriggered && rawWinningFamily?.familyEvidence
                          ? (selectedFamily?.familyEvidence ?? 0) /
                            rawWinningFamily.familyEvidence
                          : null,
                  originalWinningFamily: rawWinningFamily?.hueFamily ?? null,
                  cleanerSameFamilyCandidateRgb: cleanerWarmDecision?.applied
                      ? polishedSelection.correction.originalRgb
                      : null,
                  sameFamilyCoverageRatio: cleanerWarmDecision?.coverageRatio ?? null,
                  sameFamilyEnergyRatio: cleanerWarmDecision?.energyRatio ?? null,
                  sameFamilyMudPenaltyDifference:
                      cleanerWarmDecision?.mudPenaltyDifference ?? null,
                  sameFamilySuitabilityDifference:
                      cleanerWarmDecision?.suitabilityDifference ?? null,
                  selectedFamily: selectedFamily?.hueFamily ?? null,
                  suitabilityDifference:
                      alternativeTriggered && rawWinningCluster
                          ? polishedSelection.selected.backgroundSuitability -
                            rawWinningCluster.backgroundSuitability
                          : null,
                  topWarmClusterRgb: cleanerWarmDecision?.highestCoverage.rgb ?? null,
                  warmCorrectionApplied: polishedSelection.correction.adjustments.some(
                      (adjustment) =>
                          adjustment === 'warm-enriched' || adjustment === 'warm-lifted',
                  ),
              },
          }
        : null;
};

export const sampleAlbumDetailArtwork = async (
    src: string,
): Promise<AlbumDetailArtworkAnalysis> => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';

    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Unable to load album artwork for sampling'));
        image.src = src;
    });

    const canvas = document.createElement('canvas');
    canvas.height = SAMPLE_SIZE;
    canvas.width = SAMPLE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
        throw new Error('Unable to create album artwork sampling context');
    }

    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const analysis = analyzeAlbumDetailArtworkPixels(
        context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data,
    );

    if (!analysis) {
        throw new Error('Album artwork contained no usable sampled pixels');
    }

    return analysis;
};
