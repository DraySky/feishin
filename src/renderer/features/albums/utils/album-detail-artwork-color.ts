import type { AlbumDetailTone } from './album-detail-palette';
import { parseAlbumDetailColor } from './album-detail-palette';

const SAMPLE_SIZE = 32;
const NEUTRAL_CHROMA = 0.05;
const MEANINGFUL_CHROMA = 0.06;
const MONOCHROME_SHARE = 0.8;
const MIN_CLUSTER_COVERAGE = 0.06;

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
    chromaticEnergy: number;
    coverage: number;
    coverageScore: number;
    energyScore: number;
    freshnessScore: number;
    hueFamilyCoverage: number;
    mudPenalty: number;
    richnessScore: number;
    rgb: string;
    salientEnergy: number;
    score: number;
    spatialSalience: number;
    tone: AlbumDetailTone;
}

export interface AlbumDetailArtworkHueFamily {
    averageChroma: number;
    chromaticEnergy: number;
    coverage: number;
    hueFamily: number;
    salientEnergy: number;
    spatialSalience: number;
}

export interface AlbumDetailArtworkCorrection {
    adjustments: string[];
    originalRgb: string;
}

export interface AlbumDetailArtworkAnalysis {
    accentRescued: boolean;
    accentRescueReason: 'salient' | 'substantial' | null;
    chromaticShare: number;
    clusters: AlbumDetailArtworkCluster[];
    correction: AlbumDetailArtworkCorrection;
    hueFamilies: AlbumDetailArtworkHueFamily[];
    largestChromaticHueFamilyAverageChroma: number;
    largestChromaticHueFamilyCoverage: number;
    mode: 'chromatic' | 'monochrome';
    neutralShare: number;
    sampleCount: number;
    selected: AlbumDetailArtworkCluster;
    strongestChromaticHueFamilyEnergy: number;
    strongestChromaticHueFamilySalientEnergy: number;
}

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

const smoothstep = (min: number, max: number, value: number) => {
    const normalized = clamp((value - min) / (max - min), 0, 1);
    return normalized * normalized * (3 - 2 * normalized);
};

const spatialWeight = (x: number, y: number) => {
    const edgeDistance = Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)) * 2;
    return 1.15 - 0.35 * edgeDistance ** 1.5;
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
              chromaticEnergy: 0,
              coverage: pixels.length / sampleCount,
              coverageScore: 0,
              energyScore: 0,
              freshnessScore: 0,
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

    const neutralPixels = pixels.filter(({ tone }) => tone.chroma <= NEUTRAL_CHROMA);
    const neutralShare = neutralPixels.length / pixels.length;
    const chromaticPixels = pixels.filter(({ tone }) => tone.chroma >= MEANINGFUL_CHROMA);
    const chromaticShare = chromaticPixels.length / pixels.length;
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

    const hueFamilyStats: AlbumDetailArtworkHueFamily[] = [...hueFamilies.entries()].map(
        ([hueFamily, family]) => {
            const coverage = family.length / pixels.length;
            const averageChroma =
                family.reduce((total, pixel) => total + pixel.tone.chroma, 0) / family.length;
            const spatialSalience =
                family.reduce((total, pixel) => total + pixel.spatialWeight, 0) / family.length;

            return {
                averageChroma,
                chromaticEnergy: coverage * averageChroma,
                coverage,
                hueFamily,
                salientEnergy:
                    family.reduce(
                        (total, pixel) => total + pixel.tone.chroma * pixel.spatialWeight,
                        0,
                    ) / pixels.length,
                spatialSalience,
            };
        },
    );
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
    const substantialAccent = hueFamilyStats.some(
        ({ averageChroma, chromaticEnergy, coverage }) =>
            coverage >= 0.085 && averageChroma >= 0.11 && chromaticEnergy >= 0.015,
    );
    const salientAccent = hueFamilyStats.some(
        ({ averageChroma, coverage, salientEnergy, spatialSalience }) =>
            coverage >= 0.04 &&
            averageChroma >= 0.145 &&
            spatialSalience >= 1.03 &&
            salientEnergy >= 0.008,
    );
    const accentRescueReason =
        neutralShare < MONOCHROME_SHARE
            ? null
            : substantialAccent
              ? 'substantial'
              : salientAccent
                ? 'salient'
                : null;
    const accentRescued = accentRescueReason !== null;
    const isMonochrome =
        neutralShare >= MONOCHROME_SHARE &&
        chromaticShare < 0.18 &&
        largestChromaticHueFamilyCoverage < 0.1 &&
        !accentRescued;

    if (isMonochrome) {
        const lightnesses = neutralPixels
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
                  neutralShare,
                  sampleCount: pixels.length,
                  correction: { adjustments: ['neutral'], originalRgb: rgb },
                  selected: {
                      chromaticEnergy: 0,
                      coverage: neutralShare,
                      coverageScore: 0,
                      energyScore: 0,
                      freshnessScore: 1,
                      hueFamilyCoverage: 0,
                      mudPenalty: 0,
                      richnessScore: 0,
                      rgb,
                      salientEnergy: 0,
                      score: 1,
                      spatialSalience: 1,
                      tone,
                  },
                  strongestChromaticHueFamilyEnergy,
                  strongestChromaticHueFamilySalientEnergy,
              }
            : null;
    }

    const buckets = new Map<string, SampledPixel[]>();

    for (const pixel of pixels) {
        const { tone } = pixel;

        if (tone.chroma <= NEUTRAL_CHROMA || tone.lightness < 0.12 || tone.lightness > 0.9) {
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

    const clusters = [...buckets.values()]
        .map((bucket) => createCluster(bucket, pixels.length))
        .filter((cluster): cluster is AlbumDetailArtworkCluster => Boolean(cluster))
        .map((cluster) => {
            const lightnessScore = 1 - clamp(Math.abs(cluster.tone.lightness - 0.39) / 0.28, 0, 1);
            const richnessScore = 1 - clamp(Math.abs(cluster.tone.chroma - 0.125) / 0.125, 0, 1);
            const coverageScore = clamp(cluster.coverage / 0.3, 0, 1);
            const chromaticEnergy = cluster.coverage * cluster.tone.chroma;
            const energyScore = clamp(chromaticEnergy / 0.03, 0, 1);
            const hueFamilyCoverage =
                hueFamilyStats.find(
                    ({ hueFamily }) => hueFamily === Math.floor(cluster.tone.hue / 60),
                )?.coverage ?? 0;
            const hueFamilyConfidence = clamp(hueFamilyCoverage / 0.2, 0, 1);
            const salienceScore = clamp(cluster.salientEnergy / 0.025, 0, 1);
            const tinyClusterPenalty =
                1 - clamp(cluster.coverage / MIN_CLUSTER_COVERAGE, 0, 1);
            const washedOutPenalty =
                smoothstep(0.53, 0.72, cluster.tone.lightness) *
                (1 - smoothstep(0.08, 0.12, cluster.tone.chroma));
            const brightPenalty = smoothstep(0.65, 0.85, cluster.tone.lightness);
            const mudHue =
                smoothstep(45, 72, cluster.tone.hue) *
                (1 - smoothstep(115, 140, cluster.tone.hue));
            const mudLightness = 1 - smoothstep(0.62, 0.78, cluster.tone.lightness);
            const mudPenalty =
                mudHue *
                mudLightness *
                (1 - smoothstep(0.105, 0.17, cluster.tone.chroma));
            const freshnessScore = clamp(
                lightnessScore * 0.45 +
                    richnessScore * 0.55 -
                    washedOutPenalty * 0.4 -
                    mudPenalty * 0.25,
                0,
                1,
            );

            return {
                ...cluster,
                chromaticEnergy,
                coverageScore,
                energyScore,
                freshnessScore,
                hueFamilyCoverage,
                mudPenalty,
                richnessScore,
                score:
                    coverageScore * 0.33 +
                    energyScore * 0.23 +
                    hueFamilyConfidence * 0.1 +
                    salienceScore * 0.12 +
                    lightnessScore * 0.25 +
                    richnessScore * 0.25 -
                    tinyClusterPenalty * 0.5 -
                    washedOutPenalty * 0.4 -
                    brightPenalty * 0.25 -
                    mudPenalty * 0.28 +
                    freshnessScore * 0.22,
            };
        })
        .sort((first, second) => second.score - first.score);

    const topCandidate = clusters[0];
    const cleanerCandidate = topCandidate?.mudPenalty > 0.25
        ? clusters.slice(1).find(
              (candidate) =>
                  candidate.mudPenalty < topCandidate.mudPenalty - 0.25 &&
                  candidate.freshnessScore > topCandidate.freshnessScore + 0.12 &&
                  candidate.score >= topCandidate.score - 0.12 &&
                  (candidate.coverage >= topCandidate.coverage * 0.35 ||
                      candidate.chromaticEnergy >= topCandidate.chromaticEnergy * 0.5),
          )
        : undefined;
    const selected = cleanerCandidate ?? topCandidate;
    const adjustments: string[] = [];
    let { chroma, hue, lightness } = selected?.tone ?? { chroma: 0, hue: 0, lightness: 0 };

    if (cleanerCandidate) {
        adjustments.push('cleaner-candidate');
    }

    if (lightness > 0.53) {
        lightness = Math.max(0.5, lightness - 0.05);
        adjustments.push('deepened');
    }

    if (
        chroma < 0.11 &&
        (selected?.coverage >= MIN_CLUSTER_COVERAGE || selected?.salientEnergy >= 0.008)
    ) {
        chroma = Math.min(0.11, chroma + 0.025);
        adjustments.push('enriched');
    }

    const correctedRgb =
        selected && adjustments.length ? toneToRgb(lightness, chroma, hue) : null;
    const correctedTone = correctedRgb ? parseAlbumDetailColor(correctedRgb) : null;
    const correctedSelection =
        selected && correctedRgb && correctedTone
            ? { ...selected, rgb: correctedRgb, tone: correctedTone }
            : selected;

    return correctedSelection
        ? {
              accentRescueReason,
              accentRescued,
              chromaticShare,
              clusters,
              correction: { adjustments, originalRgb: selected.rgb },
              hueFamilies: hueFamilyStats,
              largestChromaticHueFamilyAverageChroma,
              largestChromaticHueFamilyCoverage,
              mode: 'chromatic',
              neutralShare,
              sampleCount: pixels.length,
              selected: correctedSelection,
              strongestChromaticHueFamilyEnergy,
              strongestChromaticHueFamilySalientEnergy,
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
