import { nanoid } from 'nanoid/non-secure';

import type {
    ColorLabCandidate,
    ColorLabCandidateComparison,
    ColorLabCandidateDecision,
    ColorLabCase,
    ColorLabComparisonReview,
    ColorLabFeedback,
    ColorLabSession,
    ColorLabVibrantBestSource,
} from './album-color-lab-types';

import { hasColorLabResultChanged, replayColorLabCase } from './album-color-lab-utils';

export const createColorLabSession = (
    name: string,
    albumsPerRound: number,
    sourceServerId: string,
): ColorLabSession => {
    const now = new Date().toISOString();
    return {
        acceptedCandidateId: null,
        albumsPerRound,
        baselineFrozenAt: null,
        candidates: [],
        createdAt: now,
        gitHead: null,
        id: nanoid(),
        name,
        rounds: [],
        sourceServerId,
        status: 'baseline',
        updatedAt: now,
    };
};

export const addColorLabRound = (
    session: ColorLabSession,
    cases: ColorLabCase[],
): ColorLabSession => {
    const now = new Date().toISOString();
    return {
        ...session,
        rounds: [
            ...session.rounds,
            {
                cases,
                completedAt: null,
                createdAt: now,
                id: nanoid(),
                number: session.rounds.length + 1,
            },
        ],
        updatedAt: now,
    };
};

export const updateColorLabFeedback = (
    session: ColorLabSession,
    roundId: string,
    caseId: string,
    feedback: ColorLabFeedback,
): ColorLabSession => {
    const now = new Date().toISOString();
    return {
        ...session,
        rounds: session.rounds.map((round) => {
            if (round.id !== roundId) return round;
            const cases = round.cases.map((colorCase) =>
                colorCase.id === caseId ? { ...colorCase, feedback } : colorCase,
            );
            return {
                ...round,
                cases,
                completedAt:
                    round.completedAt ??
                    (cases.every((colorCase) => colorCase.feedback.overall !== 'unrated')
                        ? now
                        : null),
            };
        }),
        updatedAt: now,
    };
};

export const updateColorLabVibrantPreference = (
    session: ColorLabSession,
    roundId: string,
    caseId: string,
    bestSource: ColorLabVibrantBestSource | null,
): ColorLabSession => ({
    ...session,
    rounds: session.rounds.map((round) =>
        round.id === roundId
            ? {
                  ...round,
                  cases: round.cases.map((colorCase) =>
                      colorCase.id === caseId && colorCase.vibrant
                          ? {
                                ...colorCase,
                                vibrant: { ...colorCase.vibrant, bestSource },
                            }
                          : colorCase,
                  ),
              }
            : round,
    ),
    updatedAt: new Date().toISOString(),
});

export const freezeColorLabBaseline = (session: ColorLabSession): ColorLabSession => {
    const now = new Date().toISOString();
    return {
        ...session,
        baselineFrozenAt: now,
        rounds: session.rounds.map((round) => ({
            ...round,
            completedAt: round.completedAt ?? now,
        })),
        status: 'refinement',
        updatedAt: now,
    };
};

export const getColorLabCases = (session: ColorLabSession) =>
    session.rounds.flatMap((round) =>
        round.cases.map((colorCase) => ({ colorCase, roundId: round.id })),
    );

export const getColorLabBaselineTotals = (session: ColorLabSession) =>
    getColorLabCases(session).reduce(
        (totals, { colorCase }) => {
            totals[colorCase.feedback.overall]++;
            return totals;
        },
        { good: 0, 'needs-adjustment': 0, unrated: 0 },
    );

export const getColorLabCandidateTotals = (candidate: ColorLabCandidate) =>
    candidate.comparisons.reduce(
        (totals, comparison) => {
            if (comparison.review) totals[comparison.review]++;
            else totals.unreviewed++;
            return totals;
        },
        { better: 0, same: 0, unreviewed: 0, worse: 0 },
    );

const candidateFingerprint = (comparisons: ColorLabCandidateComparison[]) =>
    comparisons
        .map(
            (comparison) =>
                `${comparison.caseId}:${comparison.current.analysis.mode}:${comparison.current.selectedRgb}`,
        )
        .sort()
        .join('|');

export type ColorLabCandidateCheck =
    | { candidate: ColorLabCandidate; kind: 'existing' }
    | { candidate: ColorLabCandidate; kind: 'new' }
    | { kind: 'unchanged' };

export const checkColorLabCandidate = (session: ColorLabSession): ColorLabCandidateCheck => {
    const comparisons = getColorLabCases(session).flatMap(({ colorCase, roundId }) => {
        const current = replayColorLabCase(colorCase);
        if (!current || !hasColorLabResultChanged(colorCase.baseline.analysis, current.analysis))
            return [];
        return [{ caseId: colorCase.id, current, review: null, roundId }];
    });
    if (!comparisons.length) return { kind: 'unchanged' };
    const fingerprint = candidateFingerprint(comparisons);
    const existing = session.candidates.find((candidate) => candidate.fingerprint === fingerprint);
    if (existing) return { candidate: existing, kind: 'existing' };
    return {
        candidate: {
            comparisons,
            createdAt: new Date().toISOString(),
            decidedAt: null,
            decision: 'pending',
            fingerprint,
            id: nanoid(),
            number: session.candidates.length + 1,
        },
        kind: 'new',
    };
};

export const addColorLabCandidate = (
    session: ColorLabSession,
    candidate: ColorLabCandidate,
): ColorLabSession => ({
    ...session,
    candidates: [...session.candidates, candidate],
    updatedAt: new Date().toISOString(),
});

export const reviewColorLabComparison = (
    session: ColorLabSession,
    candidateId: string,
    caseId: string,
    review: ColorLabComparisonReview,
): ColorLabSession => ({
    ...session,
    candidates: session.candidates.map((candidate) =>
        candidate.id === candidateId
            ? {
                  ...candidate,
                  comparisons: candidate.comparisons.map((comparison) =>
                      comparison.caseId === caseId ? { ...comparison, review } : comparison,
                  ),
              }
            : candidate,
    ),
    updatedAt: new Date().toISOString(),
});

export const decideColorLabCandidate = (
    session: ColorLabSession,
    candidateId: string,
    decision: Exclude<ColorLabCandidateDecision, 'pending'>,
): ColorLabSession => {
    const now = new Date().toISOString();
    return {
        ...session,
        acceptedCandidateId: decision === 'kept' ? candidateId : null,
        candidates: session.candidates.map((candidate) =>
            candidate.id === candidateId ? { ...candidate, decidedAt: now, decision } : candidate,
        ),
        status: decision === 'kept' ? 'complete' : 'refinement',
        updatedAt: now,
    };
};
