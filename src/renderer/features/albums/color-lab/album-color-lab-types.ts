import type { AlbumDetailArtworkAnalysis } from '../utils/album-detail-artwork-color';
import type { AlbumDetailPalette, AlbumDetailTone } from '../utils/album-detail-palette';

export const COLOR_LAB_SCHEMA_VERSION = 3;

export const COLOR_LAB_ISSUES = [
    'wrong-hue',
    'too-gray',
    'too-muted',
    'too-saturated',
    'too-dark',
    'too-bright',
    'too-muddy',
    'accent-ignored',
    'accent-overemphasized',
] as const;

export const COLOR_LAB_HUE_FAMILIES = [
    'neutral',
    'red',
    'orange',
    'yellow',
    'green',
    'teal',
    'blue',
    'purple',
    'pink',
] as const;

export const COLOR_LAB_VIBRANT_SWATCHES = [
    { key: 'Vibrant', label: 'Vibrant', source: 'vibrant' },
    { key: 'DarkVibrant', label: 'Dark Vibrant', source: 'dark-vibrant' },
    { key: 'LightVibrant', label: 'Light Vibrant', source: 'light-vibrant' },
    { key: 'Muted', label: 'Muted', source: 'muted' },
    { key: 'DarkMuted', label: 'Dark Muted', source: 'dark-muted' },
    { key: 'LightMuted', label: 'Light Muted', source: 'light-muted' },
] as const;

export interface ColorLabBaseline extends ColorLabResult {
    capturedAt: string;
}
export interface ColorLabCandidate {
    comparisons: ColorLabCandidateComparison[];
    createdAt: string;
    decidedAt: null | string;
    decision: ColorLabCandidateDecision;
    fingerprint: string;
    id: string;
    number: number;
}
export interface ColorLabCandidateComparison {
    caseId: string;
    current: ColorLabResult;
    review: ColorLabComparisonReview | null;
    roundId: string;
}
export type ColorLabCandidateDecision = 'kept' | 'pending' | 'rejected';
export interface ColorLabCase {
    albumArtistName: string;
    albumId: string;
    albumName: string;
    baseline: ColorLabBaseline;
    feedback: ColorLabFeedback;
    id: string;
    imageId: null | string;
    releaseYear: null | number;
    sample: ColorLabSample;
    serverId: string;
    vibrant?: ColorLabVibrantExperiment;
}

export type ColorLabComparisonReview = 'better' | 'same' | 'worse';

export interface ColorLabExport {
    exportedAt: string;
    schemaVersion: 3;
    session: ColorLabSession;
}

export interface ColorLabFeedback {
    issues: ColorLabIssue[];
    notes: string;
    overall: 'good' | 'needs-adjustment' | 'unrated';
    preferredHueFamily: ColorLabHueFamily | null;
    severity: 'moderate' | 'slight' | 'strong' | null;
}

export type ColorLabHueFamily = (typeof COLOR_LAB_HUE_FAMILIES)[number];

export type ColorLabIssue = (typeof COLOR_LAB_ISSUES)[number];

export interface ColorLabResult {
    analysis: AlbumDetailArtworkAnalysis;
    palette: AlbumDetailPalette;
    selectedRgb: string;
    selectedTone: AlbumDetailTone;
}

export interface ColorLabRound {
    cases: ColorLabCase[];
    completedAt: null | string;
    createdAt: string;
    id: string;
    number: number;
}

export interface ColorLabSample {
    data: string;
    encoding: 'rgba8-base64';
    height: 32;
    width: 32;
}

export interface ColorLabSession {
    acceptedCandidateId: null | string;
    albumsPerRound: number;
    baselineFrozenAt: null | string;
    candidates: ColorLabCandidate[];
    createdAt: string;
    gitHead: null | string;
    id: string;
    name: string;
    rounds: ColorLabRound[];
    sourceServerId: string;
    status: ColorLabSessionStatus;
    updatedAt: string;
}

export type ColorLabSessionStatus = 'baseline' | 'complete' | 'refinement';

export type ColorLabVibrantBestSource =
    | 'current-feishin'
    | (typeof COLOR_LAB_VIBRANT_SWATCHES)[number]['source'];

export interface ColorLabVibrantExperiment {
    analyzedAt: string;
    bestSource: ColorLabVibrantBestSource | null;
    engine: 'node-vibrant@4.0.4';
    swatches: Record<ColorLabVibrantSwatchName, ColorLabVibrantSwatch | null>;
}

export interface ColorLabVibrantSwatch {
    hex: string;
    population: number;
    rgb: [number, number, number];
}

export type ColorLabVibrantSwatchName = (typeof COLOR_LAB_VIBRANT_SWATCHES)[number]['key'];

export const EMPTY_COLOR_LAB_FEEDBACK: ColorLabFeedback = {
    issues: [],
    notes: '',
    overall: 'unrated',
    preferredHueFamily: null,
    severity: null,
};
