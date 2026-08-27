import type { AlbumDetailTone } from './album-detail-palette';
import { parseAlbumDetailColor } from './album-detail-palette';

const SAMPLE_SIZE = 32;
const NEUTRAL_CHROMA = 0.05;
const MONOCHROME_SHARE = 0.65;
const MIN_CLUSTER_COVERAGE = 0.06;

interface SampledPixel {
    blue: number;
    green: number;
    red: number;
    tone: AlbumDetailTone;
}

export interface AlbumDetailArtworkCluster {
    coverage: number;
    rgb: string;
    score: number;
    tone: AlbumDetailTone;
}

export interface AlbumDetailArtworkAnalysis {
    clusters: AlbumDetailArtworkCluster[];
    mode: 'chromatic' | 'monochrome';
    neutralShare: number;
    sampleCount: number;
    selected: AlbumDetailArtworkCluster;
}

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

const smoothstep = (min: number, max: number, value: number) => {
    const normalized = clamp((value - min) / (max - min), 0, 1);
    return normalized * normalized * (3 - 2 * normalized);
};

const toRgb = (red: number, green: number, blue: number) =>
    `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;

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
              coverage: pixels.length / sampleCount,
              rgb,
              score: 0,
              tone,
          }
        : null;
};

export const analyzeAlbumDetailArtworkPixels = (
    data: Uint8ClampedArray,
): AlbumDetailArtworkAnalysis | null => {
    const pixels: SampledPixel[] = [];

    for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] < 32) {
            continue;
        }

        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const tone = parseAlbumDetailColor(toRgb(red, green, blue));

        if (tone) {
            pixels.push({ blue, green, red, tone });
        }
    }

    if (!pixels.length) {
        return null;
    }

    const neutralPixels = pixels.filter(({ tone }) => tone.chroma <= NEUTRAL_CHROMA);
    const neutralShare = neutralPixels.length / pixels.length;

    if (neutralShare >= MONOCHROME_SHARE) {
        const eligible = neutralPixels.filter(
            ({ tone }) => tone.lightness >= 0.12 && tone.lightness <= 0.88,
        );
        const candidates = eligible.length ? eligible : neutralPixels;
        const lightness = Math.min(
            0.38,
            Math.max(...candidates.map(({ tone }) => tone.lightness)),
        );
        const rgb = neutralRgb(lightness);
        const tone = parseAlbumDetailColor(rgb);

        return tone
            ? {
                  clusters: [],
                  mode: 'monochrome',
                  neutralShare,
                  sampleCount: pixels.length,
                  selected: { coverage: neutralShare, rgb, score: 1, tone },
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
            const tinyClusterPenalty =
                1 - clamp(cluster.coverage / MIN_CLUSTER_COVERAGE, 0, 1);
            const washedOutPenalty =
                smoothstep(0.53, 0.72, cluster.tone.lightness) *
                (1 - smoothstep(0.08, 0.12, cluster.tone.chroma));
            const brightPenalty = smoothstep(0.65, 0.85, cluster.tone.lightness);

            return {
                ...cluster,
                score:
                    coverageScore * 0.5 +
                    lightnessScore * 0.3 +
                    richnessScore * 0.25 -
                    tinyClusterPenalty * 0.5 -
                    washedOutPenalty * 0.4 -
                    brightPenalty * 0.25,
            };
        })
        .sort((first, second) => second.score - first.score);

    return clusters.length
        ? {
              clusters,
              mode: 'chromatic',
              neutralShare,
              sampleCount: pixels.length,
              selected: clusters[0],
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
