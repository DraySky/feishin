import { useEffect, useState } from 'react';

import type {
    ColorLabCandidate,
    ColorLabComparisonReview,
    ColorLabSession,
} from './album-color-lab-types';

import {
    Diagnostics,
    isColorLabTypingTarget,
    ResultPreview,
    StageHeader,
    StatRow,
} from './album-color-lab-components';
import styles from './album-color-lab-route.module.css';
import { getColorLabCandidateTotals } from './album-color-lab-session';

import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

interface AlbumColorLabRefinementStageProps {
    candidate: ColorLabCandidate | null;
    getImageUrl: (serverId: string, imageId: null | string) => string | undefined;
    matchedRejectedCandidate: ColorLabCandidate | null;
    onCheck: () => void;
    onDecide: (decision: 'kept' | 'rejected') => void;
    onReview: (caseId: string, review: ColorLabComparisonReview) => void;
    session: ColorLabSession;
}

export const AlbumColorLabRefinementStage = ({
    candidate,
    getImageUrl,
    matchedRejectedCandidate,
    onCheck,
    onDecide,
    onReview,
    session,
}: AlbumColorLabRefinementStageProps) => {
    const firstUnreviewed = Math.max(
        0,
        candidate?.comparisons.findIndex((comparison) => comparison.review === null) ?? 0,
    );
    const [index, setIndex] = useState(firstUnreviewed);
    const comparison = candidate?.comparisons[Math.min(index, candidate.comparisons.length - 1)];
    const round = comparison
        ? session.rounds.find((item) => item.id === comparison.roundId)
        : undefined;
    const colorCase = round?.cases.find((item) => item.id === comparison?.caseId);
    const totals = candidate ? getColorLabCandidateTotals(candidate) : null;
    const reviewed = totals ? candidate!.comparisons.length - totals.unreviewed : 0;

    useEffect(() => {
        setIndex(firstUnreviewed);
    }, [candidate?.id, firstUnreviewed]);

    const reviewAndAdvance = (review: ColorLabComparisonReview) => {
        if (!comparison || !candidate) return;
        onReview(comparison.caseId, review);
        setIndex((value) => Math.min(candidate.comparisons.length - 1, value + 1));
    };

    useEffect(() => {
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (!comparison || isColorLabTypingTarget(event.target)) return;
            if (event.key.toLowerCase() === 'b') reviewAndAdvance('better');
            else if (event.key.toLowerCase() === 's') reviewAndAdvance('same');
            else if (event.key.toLowerCase() === 'w') reviewAndAdvance('worse');
            else if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1));
            else if (event.key === 'ArrowRight' && candidate) {
                setIndex((value) => Math.min(candidate.comparisons.length - 1, value + 1));
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    });

    if (!candidate) {
        return (
            <Stack gap="lg">
                <StageHeader
                    detail="Replay the frozen 32 x 32 samples through the current picker"
                    title="Refinement"
                />
                <section className={styles.waitingState}>
                    <TextTitle order={2}>No changes detected</TextTitle>
                    <Text isMuted>
                        The current picker still matches this session&apos;s baseline. Make a picker
                        refinement, then return and check again.
                    </Text>
                    {matchedRejectedCandidate && (
                        <Text>
                            The current result matches rejected Candidate{' '}
                            {matchedRejectedCandidate.number}. Change or restore the picker before
                            creating another attempt.
                        </Text>
                    )}
                    <Button onClick={onCheck}>Check again</Button>
                </section>
            </Stack>
        );
    }

    if (!comparison || !colorCase || !totals) return null;

    if (!totals.unreviewed) {
        const changedGood = candidate.comparisons.filter((item) => {
            const candidateRound = session.rounds.find(
                (roundItem) => roundItem.id === item.roundId,
            );
            return (
                candidateRound?.cases.find((caseItem) => caseItem.id === item.caseId)?.feedback
                    .overall === 'good'
            );
        }).length;
        return (
            <Stack gap="lg">
                <StageHeader
                    detail="Every changed case has been reviewed"
                    progress={{
                        current: candidate.comparisons.length,
                        total: candidate.comparisons.length,
                    }}
                    title={`Candidate ${candidate.number} summary`}
                />
                <section className={styles.card}>
                    <StatRow>
                        <span>{totals.better} Better</span>
                        <span>{totals.same} Same</span>
                        <span>{totals.worse} Worse</span>
                        <span>{changedGood} baseline Good changed</span>
                        <span>{candidate.comparisons.length} total changed</span>
                    </StatRow>
                    <Text isMuted>
                        This records the experiment decision only. It does not change source code or
                        run Git commands.
                    </Text>
                    <div className={styles.primaryActions}>
                        <Button onClick={() => onDecide('rejected')}>Reject Candidate</Button>
                        <Button onClick={() => onDecide('kept')} variant="filled">
                            Keep Candidate
                        </Button>
                    </div>
                </section>
            </Stack>
        );
    }

    return (
        <Stack gap="lg">
            <StageHeader
                detail={`${candidate.comparisons.length} meaningful changes detected`}
                progress={{ current: reviewed, total: candidate.comparisons.length }}
                title={`Candidate ${candidate.number} comparison`}
            />
            <section className={styles.review}>
                <div className={styles.casePosition}>
                    <strong>
                        Changed case {index + 1} / {candidate.comparisons.length}
                    </strong>
                    <Text isMuted>{reviewed} reviewed</Text>
                </div>
                <div className={styles.visualsTwo}>
                    <ResultPreview
                        colorCase={colorCase}
                        imageUrl={getImageUrl(colorCase.serverId, colorCase.imageId)}
                        label="Baseline"
                        result={colorCase.baseline}
                    />
                    <ResultPreview
                        colorCase={colorCase}
                        imageUrl={getImageUrl(colorCase.serverId, colorCase.imageId)}
                        label="Current"
                        result={comparison.current}
                    />
                </div>
                <Stack gap="xs">
                    <TextTitle order={2}>{colorCase.albumName}</TextTitle>
                    <Text>
                        {colorCase.albumArtistName}
                        {colorCase.releaseYear ? ` - ${colorCase.releaseYear}` : ''}
                    </Text>
                    <Text isMuted>
                        Baseline feedback: {colorCase.feedback.overall.replace('-', ' ')}
                    </Text>
                </Stack>
                <Group>
                    {(['better', 'same', 'worse'] as const).map((review) => (
                        <Button
                            key={review}
                            onClick={() => reviewAndAdvance(review)}
                            variant={comparison.review === review ? 'filled' : 'default'}
                        >
                            {review === 'better' ? 'Better' : review === 'same' ? 'Same' : 'Worse'}
                        </Button>
                    ))}
                </Group>
                <Group justify="space-between">
                    <Button disabled={index === 0} onClick={() => setIndex(index - 1)}>
                        Previous
                    </Button>
                    <Text isMuted>B Better, S Same, W Worse, Left/Right navigate</Text>
                    <Button
                        disabled={index >= candidate.comparisons.length - 1}
                        onClick={() => setIndex(index + 1)}
                    >
                        Next
                    </Button>
                </Group>
                <details className={styles.diagnostics}>
                    <summary>Diagnostics</summary>
                    <div className={styles.diagnosticColumns}>
                        <div>
                            <TextTitle order={4}>Baseline</TextTitle>
                            <Diagnostics result={colorCase.baseline} />
                        </div>
                        <div>
                            <TextTitle order={4}>Current</TextTitle>
                            <Diagnostics result={comparison.current} />
                        </div>
                    </div>
                </details>
            </section>
        </Stack>
    );
};
