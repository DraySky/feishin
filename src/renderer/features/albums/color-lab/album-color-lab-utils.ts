import type { Album } from '/@/shared/types/domain-types';

import { nanoid } from 'nanoid/non-secure';

import {
    type AlbumDetailArtworkAnalysis,
    analyzeAlbumDetailArtworkPixels,
} from '../utils/album-detail-artwork-color';
import { createAlbumDetailPalette } from '../utils/album-detail-palette';
import {
    COLOR_LAB_HUE_FAMILIES,
    COLOR_LAB_ISSUES,
    COLOR_LAB_SCHEMA_VERSION,
    COLOR_LAB_VIBRANT_SWATCHES,
    type ColorLabCandidateDecision,
    type ColorLabCase,
    type ColorLabComparisonReview,
    type ColorLabExport,
    type ColorLabFeedback,
    type ColorLabRound,
    type ColorLabSample,
    type ColorLabSession,
    type ColorLabVibrantBestSource,
    type ColorLabVibrantExperiment,
    type ColorLabVibrantSwatch,
    EMPTY_COLOR_LAB_FEEDBACK,
} from './album-color-lab-types';
import { analyzeColorLabVibrantSample } from './album-color-lab-vibrant';

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
    context.putImageData(
        new ImageData(decodeColorLabSample(sample), sample.width, sample.height),
        0,
        0,
    );
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
    const sample: ColorLabSample = {
        data: bytesToBase64(pixels),
        encoding: 'rgba8-base64',
        height: SAMPLE_SIZE,
        width: SAMPLE_SIZE,
    };
    const vibrant = await analyzeColorLabVibrantSample(sampleToDataUrl(sample)).catch(
        () => undefined,
    );

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
        feedback: { ...EMPTY_COLOR_LAB_FEEDBACK },
        id: nanoid(),
        imageId: album.imageId,
        releaseYear: album.releaseYear,
        sample,
        serverId: album._serverId,
        vibrant,
    };
};

export const replayColorLabCase = (colorCase: ColorLabCase) => {
    const analysis = analyzeAlbumDetailArtworkPixels(decodeColorLabSample(colorCase.sample));
    if (!analysis) return null;
    return {
        analysis,
        palette: createAlbumDetailPalette(analysis.selected.rgb),
        selectedRgb: analysis.selected.rgb,
        selectedTone: analysis.selected.tone,
    };
};

export const hasColorLabResultChanged = (
    baseline: AlbumDetailArtworkAnalysis,
    current: AlbumDetailArtworkAnalysis,
) => baseline.mode !== current.mode || baseline.selected.rgb !== current.selected.rgb;

export const exportColorLabSession = (session: ColorLabSession) => {
    const payload: ColorLabExport = {
        exportedAt: new Date().toISOString(),
        schemaVersion: COLOR_LAB_SCHEMA_VERSION,
        session,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const name = session.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    anchor.download = `feishin-album-color-lab-session-${name || 'experiment'}-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
    anchor.href = url;
    anchor.click();
    URL.revokeObjectURL(url);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const parseVibrantExperiment = (value: unknown): ColorLabVibrantExperiment | undefined => {
    if (value === undefined) return undefined;
    if (!isRecord(value) || !isRecord(value.swatches)) {
        throw new Error('Invalid Color Lab Node Vibrant experiment');
    }
    const swatchValues = value.swatches;
    const sources = ['current-feishin', ...COLOR_LAB_VIBRANT_SWATCHES.map(({ source }) => source)];
    if (
        value.engine !== 'node-vibrant@4.0.4' ||
        typeof value.analyzedAt !== 'string' ||
        (value.bestSource !== null && !sources.includes(String(value.bestSource)))
    ) {
        throw new Error('Invalid Color Lab Node Vibrant experiment');
    }
    const swatches = Object.fromEntries(
        COLOR_LAB_VIBRANT_SWATCHES.map(({ key }) => {
            const swatch = swatchValues[key];
            if (swatch === null) return [key, null];
            if (
                !isRecord(swatch) ||
                typeof swatch.hex !== 'string' ||
                typeof swatch.population !== 'number' ||
                !Array.isArray(swatch.rgb) ||
                swatch.rgb.length !== 3 ||
                swatch.rgb.some((channel) => typeof channel !== 'number')
            ) {
                throw new Error('Invalid Color Lab Node Vibrant swatch');
            }
            return [
                key,
                {
                    hex: swatch.hex,
                    population: swatch.population,
                    rgb: swatch.rgb as ColorLabVibrantSwatch['rgb'],
                },
            ];
        }),
    ) as ColorLabVibrantExperiment['swatches'];

    return {
        analyzedAt: value.analyzedAt,
        bestSource: value.bestSource as ColorLabVibrantBestSource | null,
        engine: value.engine,
        swatches,
    };
};

const parseFeedback = (value: unknown): ColorLabFeedback => {
    if (!isRecord(value)) throw new Error('Invalid Color Lab feedback');
    const overall = value.overall;
    const issues = value.issues;
    const preferredHueFamily = value.preferredHueFamily;
    const severity = value.severity;
    if (
        !['good', 'needs-adjustment', 'unrated'].includes(String(overall)) ||
        !Array.isArray(issues) ||
        issues.some(
            (issue) => !COLOR_LAB_ISSUES.includes(issue as (typeof COLOR_LAB_ISSUES)[number]),
        ) ||
        (preferredHueFamily !== null &&
            !COLOR_LAB_HUE_FAMILIES.includes(
                preferredHueFamily as (typeof COLOR_LAB_HUE_FAMILIES)[number],
            )) ||
        (severity !== null && !['moderate', 'slight', 'strong'].includes(String(severity)))
    ) {
        throw new Error('Invalid Color Lab feedback');
    }
    return {
        issues: issues as ColorLabFeedback['issues'],
        notes: typeof value.notes === 'string' ? value.notes : '',
        overall: overall as ColorLabFeedback['overall'],
        preferredHueFamily: preferredHueFamily as ColorLabFeedback['preferredHueFamily'],
        severity: severity as ColorLabFeedback['severity'],
    };
};

const parseCase = (value: unknown, allowMissingId = false): ColorLabCase => {
    if (!isRecord(value) || !isRecord(value.sample) || !isRecord(value.baseline)) {
        throw new Error('Invalid Color Lab case');
    }
    const sample = value.sample as unknown as ColorLabSample;
    let sampleLength = 0;
    try {
        sampleLength = decodeColorLabSample(sample).length;
    } catch {
        throw new Error('Invalid Color Lab case sample');
    }
    if (
        typeof value.albumId !== 'string' ||
        typeof value.albumName !== 'string' ||
        typeof value.albumArtistName !== 'string' ||
        typeof value.serverId !== 'string' ||
        (!allowMissingId && typeof value.id !== 'string') ||
        sample.width !== SAMPLE_SIZE ||
        sample.height !== SAMPLE_SIZE ||
        sample.encoding !== 'rgba8-base64' ||
        typeof sample.data !== 'string' ||
        sampleLength !== SAMPLE_SIZE * SAMPLE_SIZE * 4 ||
        !value.baseline.analysis ||
        !value.baseline.palette
    ) {
        throw new Error('Invalid Color Lab case sample or baseline');
    }
    const baselineValue = value.baseline as unknown as ColorLabCase['baseline'];
    if (
        typeof baselineValue.capturedAt !== 'string' ||
        typeof baselineValue.selectedRgb !== 'string' ||
        !baselineValue.selectedTone
    ) {
        throw new Error('Invalid Color Lab case baseline');
    }
    const baseline: ColorLabCase['baseline'] = {
        analysis: baselineValue.analysis,
        capturedAt: baselineValue.capturedAt,
        palette: baselineValue.palette,
        selectedRgb: baselineValue.selectedRgb,
        selectedTone: baselineValue.selectedTone,
    };
    return {
        albumArtistName: value.albumArtistName,
        albumId: value.albumId,
        albumName: value.albumName,
        baseline,
        feedback: parseFeedback(value.feedback),
        id: typeof value.id === 'string' ? value.id : nanoid(),
        imageId: typeof value.imageId === 'string' ? value.imageId : null,
        releaseYear: typeof value.releaseYear === 'number' ? value.releaseYear : null,
        sample,
        serverId: value.serverId,
        vibrant: parseVibrantExperiment(value.vibrant),
    };
};

const parseSession = (value: unknown): ColorLabSession => {
    if (!isRecord(value) || !Array.isArray(value.rounds) || !Array.isArray(value.candidates)) {
        throw new Error('Invalid Color Lab session');
    }
    if (
        typeof value.id !== 'string' ||
        typeof value.name !== 'string' ||
        typeof value.createdAt !== 'string' ||
        typeof value.updatedAt !== 'string' ||
        typeof value.sourceServerId !== 'string' ||
        typeof value.albumsPerRound !== 'number' ||
        !['baseline', 'complete', 'refinement'].includes(String(value.status))
    ) {
        throw new Error('Invalid Color Lab session');
    }
    const rounds: ColorLabRound[] = value.rounds.map((roundValue) => {
        if (!isRecord(roundValue) || !Array.isArray(roundValue.cases)) {
            throw new Error('Invalid Color Lab round');
        }
        return {
            cases: roundValue.cases.map((colorCase) => parseCase(colorCase)),
            completedAt: typeof roundValue.completedAt === 'string' ? roundValue.completedAt : null,
            createdAt: String(roundValue.createdAt),
            id: String(roundValue.id),
            number: Number(roundValue.number),
        };
    });
    const candidates = value.candidates.map((candidateValue) => {
        if (!isRecord(candidateValue) || !Array.isArray(candidateValue.comparisons)) {
            throw new Error('Invalid Color Lab candidate');
        }
        const decision = String(candidateValue.decision);
        if (!['kept', 'pending', 'rejected'].includes(decision)) {
            throw new Error('Invalid Color Lab candidate decision');
        }
        return {
            comparisons: candidateValue.comparisons.map((comparisonValue) => {
                if (!isRecord(comparisonValue) || !isRecord(comparisonValue.current)) {
                    throw new Error('Invalid Color Lab candidate comparison');
                }
                const current = comparisonValue.current;
                const review = comparisonValue.review;
                if (
                    !current.analysis ||
                    !current.palette ||
                    typeof current.selectedRgb !== 'string' ||
                    !current.selectedTone ||
                    (review !== null && !['better', 'same', 'worse'].includes(String(review)))
                ) {
                    throw new Error('Invalid Color Lab comparison review');
                }
                return {
                    caseId: String(comparisonValue.caseId),
                    current: {
                        analysis: current.analysis as ColorLabCase['baseline']['analysis'],
                        palette: current.palette as ColorLabCase['baseline']['palette'],
                        selectedRgb: current.selectedRgb,
                        selectedTone:
                            current.selectedTone as ColorLabCase['baseline']['selectedTone'],
                    },
                    review: review as ColorLabComparisonReview | null,
                    roundId: String(comparisonValue.roundId),
                };
            }),
            createdAt: String(candidateValue.createdAt),
            decidedAt:
                typeof candidateValue.decidedAt === 'string' ? candidateValue.decidedAt : null,
            decision: decision as ColorLabCandidateDecision,
            fingerprint: String(candidateValue.fingerprint),
            id: String(candidateValue.id),
            number: Number(candidateValue.number),
        };
    });
    return {
        acceptedCandidateId:
            typeof value.acceptedCandidateId === 'string' ? value.acceptedCandidateId : null,
        albumsPerRound: value.albumsPerRound,
        baselineFrozenAt:
            typeof value.baselineFrozenAt === 'string' ? value.baselineFrozenAt : null,
        candidates,
        createdAt: value.createdAt,
        gitHead: typeof value.gitHead === 'string' ? value.gitHead : null,
        id: value.id,
        name: value.name,
        rounds,
        sourceServerId: value.sourceServerId,
        status: value.status as ColorLabSession['status'],
        updatedAt: value.updatedAt,
    };
};

const parseLegacyBatch = (value: unknown): ColorLabSession => {
    if (!isRecord(value) || !Array.isArray(value.cases))
        throw new Error('Invalid legacy Color Lab batch');
    if (
        typeof value.id !== 'string' ||
        typeof value.name !== 'string' ||
        typeof value.createdAt !== 'string' ||
        typeof value.updatedAt !== 'string' ||
        typeof value.sourceServerId !== 'string'
    ) {
        throw new Error('Invalid legacy Color Lab batch');
    }
    const cases = value.cases.map((colorCase) => parseCase(colorCase, true));
    return {
        acceptedCandidateId: null,
        albumsPerRound: Math.max(1, cases.length),
        baselineFrozenAt: null,
        candidates: [],
        createdAt: value.createdAt,
        gitHead: null,
        id: nanoid(),
        name: value.name,
        rounds: [
            {
                cases,
                completedAt: cases.every((colorCase) => colorCase.feedback.overall !== 'unrated')
                    ? value.updatedAt
                    : null,
                createdAt: value.createdAt,
                id: nanoid(),
                number: 1,
            },
        ],
        sourceServerId: value.sourceServerId,
        status: 'baseline',
        updatedAt: value.updatedAt,
    };
};

export const parseColorLabExport = (value: unknown): ColorLabSession => {
    if (!isRecord(value)) throw new Error('Invalid Color Lab export');
    if (value.schemaVersion === 2 || value.schemaVersion === COLOR_LAB_SCHEMA_VERSION)
        return parseSession(value.session);
    if (value.schemaVersion === 1)
        return parseLegacyBatch(isRecord(value.batch) ? value.batch : null);
    throw new Error('Unsupported Color Lab export schema');
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

export const populateColorLabVibrantResults = async (
    session: ColorLabSession,
): Promise<ColorLabSession> => {
    const missing = session.rounds.flatMap((round) =>
        round.cases.flatMap((colorCase) =>
            colorCase.vibrant ? [] : [{ colorCase, roundId: round.id }],
        ),
    );
    if (!missing.length) return session;
    const results = await mapWithConcurrency(missing, 3, async ({ colorCase, roundId }) => ({
        caseId: colorCase.id,
        roundId,
        vibrant: await analyzeColorLabVibrantSample(sampleToDataUrl(colorCase.sample)),
    }));
    const analyzed = new Map(
        results.flatMap((result) =>
            result.status === 'fulfilled'
                ? [
                      [
                          `${result.value.roundId}:${result.value.caseId}`,
                          result.value.vibrant,
                      ] as const,
                  ]
                : [],
        ),
    );
    if (!analyzed.size) return session;

    return {
        ...session,
        rounds: session.rounds.map((round) => ({
            ...round,
            cases: round.cases.map((colorCase) => ({
                ...colorCase,
                vibrant: analyzed.get(`${round.id}:${colorCase.id}`) ?? colorCase.vibrant,
            })),
        })),
        updatedAt: new Date().toISOString(),
    };
};

export const mergeColorLabVibrantResults = (
    session: ColorLabSession,
    analyzedSession: ColorLabSession,
): ColorLabSession => {
    const analyzed = new Map(
        analyzedSession.rounds.flatMap((round) =>
            round.cases.flatMap((colorCase) =>
                colorCase.vibrant
                    ? [[`${round.id}:${colorCase.id}`, colorCase.vibrant] as const]
                    : [],
            ),
        ),
    );

    return {
        ...session,
        rounds: session.rounds.map((round) => ({
            ...round,
            cases: round.cases.map((colorCase) => ({
                ...colorCase,
                vibrant: colorCase.vibrant ?? analyzed.get(`${round.id}:${colorCase.id}`),
            })),
        })),
        updatedAt: analyzed.size ? new Date().toISOString() : session.updatedAt,
    };
};
