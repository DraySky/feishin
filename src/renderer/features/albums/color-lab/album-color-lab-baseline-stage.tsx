import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import type {
    ColorLabFeedback,
    ColorLabIssue,
    ColorLabRound,
    ColorLabSession,
} from './album-color-lab-types';

import {
    Diagnostics,
    FeedbackEditor,
    isColorLabTypingTarget,
    ISSUE_LABELS,
    ResultPreview,
    StageHeader,
    StatRow,
} from './album-color-lab-components';
import styles from './album-color-lab-route.module.css';
import { getColorLabBaselineTotals } from './album-color-lab-session';

import { AppRoute } from '/@/renderer/router/routes';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

interface AlbumColorLabBaselineStageProps {
    getImageUrl: (serverId: string, imageId: null | string) => string | undefined;
    onAddRound: () => void;
    onContinue: () => void;
    onUpdateFeedback: (roundId: string, caseId: string, feedback: ColorLabFeedback) => void;
    round: ColorLabRound;
    session: ColorLabSession;
}

export const AlbumColorLabBaselineStage = ({
    getImageUrl,
    onAddRound,
    onContinue,
    onUpdateFeedback,
    round,
    session,
}: AlbumColorLabBaselineStageProps) => {
    const firstUnrated = Math.max(
        0,
        round.cases.findIndex((colorCase) => colorCase.feedback.overall === 'unrated'),
    );
    const [index, setIndex] = useState(firstUnrated);
    const [feedbackDraft, setFeedbackDraft] = useState<ColorLabFeedback | null>(null);
    const activeCase = round.cases[Math.min(index, round.cases.length - 1)];
    const sessionTotals = getColorLabBaselineTotals(session);
    const rated = round.cases.filter(
        (colorCase) => colorCase.feedback.overall !== 'unrated',
    ).length;
    const roundIssues = useMemo(
        () =>
            round.cases.reduce((issues, colorCase) => {
                colorCase.feedback.issues.forEach((issue) =>
                    issues.set(issue, (issues.get(issue) ?? 0) + 1),
                );
                return issues;
            }, new Map<ColorLabIssue, number>()),
        [round.cases],
    );

    const advance = () => {
        const nextUnrated = round.cases.findIndex(
            (colorCase, caseIndex) => caseIndex > index && colorCase.feedback.overall === 'unrated',
        );
        setIndex(nextUnrated === -1 ? Math.min(index + 1, round.cases.length - 1) : nextUnrated);
    };

    const setFeedback = (feedback: ColorLabFeedback, shouldAdvance = false) => {
        if (!activeCase) return;
        onUpdateFeedback(round.id, activeCase.id, feedback);
        setFeedbackDraft(null);
        if (shouldAdvance) advance();
    };

    useEffect(() => {
        setFeedbackDraft(null);
    }, [activeCase?.id]);

    useEffect(() => {
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (!activeCase || isColorLabTypingTarget(event.target)) return;
            if (event.key.toLowerCase() === 'g') {
                setFeedback({ ...activeCase.feedback, issues: [], overall: 'good' }, true);
            } else if (event.key.toLowerCase() === 'n') {
                setFeedbackDraft({ ...activeCase.feedback, overall: 'needs-adjustment' });
            } else if (event.key === 'ArrowLeft') {
                setIndex((value) => Math.max(0, value - 1));
            } else if (event.key === 'ArrowRight') {
                setIndex((value) => Math.min(round.cases.length - 1, value + 1));
            } else if (event.key === 'Enter') {
                if (feedbackDraft) setFeedback(feedbackDraft, true);
                else if (activeCase.feedback.overall !== 'unrated') advance();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    });

    if (round.completedAt) {
        const good = round.cases.filter(
            (colorCase) => colorCase.feedback.overall === 'good',
        ).length;
        const needsAdjustment = round.cases.filter(
            (colorCase) => colorCase.feedback.overall === 'needs-adjustment',
        ).length;
        return (
            <Stack gap="lg">
                <StageHeader
                    detail="Baseline feedback saved"
                    progress={{ current: rated, total: round.cases.length }}
                    title={`Baseline Round ${round.number} complete`}
                />
                <section className={styles.card}>
                    <TextTitle order={3}>Round summary</TextTitle>
                    <StatRow>
                        <span>{round.cases.length} cases</span>
                        <span>{good} Good</span>
                        <span>{needsAdjustment} Needs Adjustment</span>
                        {rated < round.cases.length && (
                            <span>{round.cases.length - rated} Unrated</span>
                        )}
                        {[...roundIssues].map(([issue, count]) => (
                            <span key={issue}>
                                {ISSUE_LABELS[issue]}: {count}
                            </span>
                        ))}
                    </StatRow>
                    <div className={styles.primaryActions}>
                        <Button onClick={onAddRound}>Add another baseline round</Button>
                        <Button onClick={onContinue} variant="filled">
                            Continue to refinement
                        </Button>
                    </div>
                </section>
            </Stack>
        );
    }

    if (!activeCase) {
        return (
            <section className={styles.card}>
                <TextTitle order={2}>No usable artwork was sampled</TextTitle>
                <Text isMuted>Try another baseline round.</Text>
                <Button onClick={onAddRound}>Try again</Button>
            </section>
        );
    }

    const canOpenAlbum = !!getImageUrl(activeCase.serverId, activeCase.imageId);
    return (
        <Stack gap="lg">
            <StageHeader
                detail={`Rate the picker captured when ${session.name} began`}
                progress={{ current: rated, total: round.cases.length }}
                title={`Baseline Round ${round.number}`}
            />
            <section className={styles.review}>
                <div className={styles.casePosition}>
                    <strong>
                        Case {index + 1} / {round.cases.length}
                    </strong>
                    <Text isMuted>{rated} rated</Text>
                </div>
                <div className={styles.referenceVisual}>
                    <ResultPreview
                        colorCase={activeCase}
                        imageUrl={getImageUrl(activeCase.serverId, activeCase.imageId)}
                        label="Current Feishin baseline"
                        result={activeCase.baseline}
                    />
                </div>
                <Stack gap="xs">
                    <TextTitle order={2}>{activeCase.albumName}</TextTitle>
                    <Text>
                        {activeCase.albumArtistName}
                        {activeCase.releaseYear ? ` - ${activeCase.releaseYear}` : ''}
                    </Text>
                    {canOpenAlbum && (
                        <Button
                            component={Link}
                            to={AppRoute.LIBRARY_ALBUMS_DETAIL.replace(
                                ':albumId',
                                activeCase.albumId,
                            )}
                            variant="subtle"
                        >
                            Open Album Detail
                        </Button>
                    )}
                </Stack>
                <Group>
                    <Button
                        onClick={() =>
                            setFeedback(
                                { ...activeCase.feedback, issues: [], overall: 'good' },
                                true,
                            )
                        }
                        variant={
                            activeCase.feedback.overall === 'good' && !feedbackDraft
                                ? 'filled'
                                : 'default'
                        }
                    >
                        Good
                    </Button>
                    <Button
                        onClick={() =>
                            setFeedbackDraft({
                                ...activeCase.feedback,
                                overall: 'needs-adjustment',
                            })
                        }
                        variant={
                            feedbackDraft || activeCase.feedback.overall === 'needs-adjustment'
                                ? 'filled'
                                : 'default'
                        }
                    >
                        Needs Improvement
                    </Button>
                </Group>
                {(feedbackDraft ??
                    (activeCase.feedback.overall === 'needs-adjustment'
                        ? activeCase.feedback
                        : null)) && (
                    <Stack gap="md">
                        <FeedbackEditor
                            feedback={feedbackDraft ?? activeCase.feedback}
                            onChange={setFeedbackDraft}
                        />
                        <Button
                            onClick={() => setFeedback(feedbackDraft ?? activeCase.feedback, true)}
                        >
                            Save Needs Improvement & Next
                        </Button>
                    </Stack>
                )}
                <Group justify="space-between">
                    <Button disabled={index === 0} onClick={() => setIndex(index - 1)}>
                        Previous
                    </Button>
                    <Text isMuted>G Good, N adjust, Enter next, Left/Right navigate</Text>
                    <Button
                        disabled={index >= round.cases.length - 1}
                        onClick={() => setIndex(index + 1)}
                    >
                        Next
                    </Button>
                </Group>
                {sessionTotals.good + sessionTotals['needs-adjustment'] > 0 && (
                    <div className={styles.secondaryAction}>
                        <Button onClick={onContinue} variant="subtle">
                            Freeze baseline and continue with{' '}
                            {sessionTotals.good + sessionTotals['needs-adjustment']} rated{' '}
                            {sessionTotals.good + sessionTotals['needs-adjustment'] === 1
                                ? 'case'
                                : 'cases'}
                        </Button>
                    </div>
                )}
                <Diagnostics result={activeCase.baseline} />
            </section>
        </Stack>
    );
};
