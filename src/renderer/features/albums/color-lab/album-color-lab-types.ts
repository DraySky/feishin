import type { AlbumDetailArtworkAnalysis } from '../utils/album-detail-artwork-color';
import type { AlbumDetailPalette, AlbumDetailTone } from '../utils/album-detail-palette';

export const COLOR_LAB_SCHEMA_VERSION = 1;

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

export type ColorLabIssue = (typeof COLOR_LAB_ISSUES)[number];
export type ColorLabHueFamily = (typeof COLOR_LAB_HUE_FAMILIES)[number];

export interface ColorLabSample {
    data: string;
    encoding: 'rgba8-base64';
    height: 32;
    width: 32;
}

export interface ColorLabFeedback {
    issues: ColorLabIssue[];
    notes: string;
    overall: 'good' | 'needs-adjustment' | 'unrated';
    preferredHueFamily: ColorLabHueFamily | null;
    severity: 'moderate' | 'slight' | 'strong' | null;
}

export interface ColorLabBaseline {
    analysis: AlbumDetailArtworkAnalysis;
    capturedAt: string;
    palette: AlbumDetailPalette;
    selectedRgb: string;
    selectedTone: AlbumDetailTone;
}

export interface ColorLabCase {
    albumArtistName: string;
    albumId: string;
    albumName: string;
    baseline: ColorLabBaseline;
    comparisonReview: 'better' | 'same' | 'worse' | null;
    feedback: ColorLabFeedback;
    imageId: null | string;
    releaseYear: null | number;
    sample: ColorLabSample;
    serverId: string;
}

export interface ColorLabBatch {
    cases: ColorLabCase[];
    createdAt: string;
    id: string;
    kind: 'calibration' | 'holdout';
    name: string;
    sourceServerId: string;
    updatedAt: string;
}

export interface ColorLabExport {
    batch: ColorLabBatch;
    exportedAt: string;
    schemaVersion: 1;
}

export const EMPTY_COLOR_LAB_FEEDBACK: ColorLabFeedback = {
    issues: [],
    notes: '',
    overall: 'unrated',
    preferredHueFamily: null,
    severity: null,
};
