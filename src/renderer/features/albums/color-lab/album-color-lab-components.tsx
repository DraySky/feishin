import type { ReactNode } from 'react';

import styles from './album-color-lab-route.module.css';
import { getColorLabBaselineTotals, getColorLabCandidateTotals } from './album-color-lab-session';
import {
    COLOR_LAB_HUE_FAMILIES,
    COLOR_LAB_ISSUES,
    type ColorLabCase,
    type ColorLabFeedback,
    type ColorLabIssue,
    type ColorLabResult,
    type ColorLabSession,
} from './album-color-lab-types';
import { sampleToDataUrl } from './album-color-lab-utils';

import { Button } from '/@/shared/components/button/button';
import { Checkbox } from '/@/shared/components/checkbox/checkbox';
import { Group } from '/@/shared/components/group/group';
import { Progress } from '/@/shared/components/progress/progress';
import { Select } from '/@/shared/components/select/select';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';
import { Textarea } from '/@/shared/components/textarea/textarea';

export const ISSUE_LABELS: Record<ColorLabIssue, string> = {
    'accent-ignored': 'Accent ignored',
    'accent-overemphasized': 'Accent overemphasized',
    'too-bright': 'Too bright',
    'too-dark': 'Too dark',
    'too-gray': 'Too gray / meaningful color ignored',
    'too-muddy': 'Too muddy',
    'too-muted': 'Too muted',
    'too-saturated': 'Too saturated',
    'wrong-hue': 'Wrong hue',
};

export const isColorLabTypingTarget = (target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    return !!element?.closest('input, textarea, select, [contenteditable="true"]');
};

export const StageHeader = ({
    detail,
    progress,
    title,
}: {
    detail: string;
    progress?: { current: number; total: number };
    title: string;
}) => (
    <header className={styles.stageHeader}>
        <div>
            <Text className={styles.eyebrow}>Current stage</Text>
            <TextTitle order={2}>{title}</TextTitle>
            <Text isMuted>{detail}</Text>
        </div>
        {progress && (
            <div className={styles.stageProgress}>
                <strong>
                    {progress.current} / {progress.total}
                </strong>
                <Progress value={progress.total ? (progress.current / progress.total) * 100 : 0} />
            </div>
        )}
    </header>
);

export const SessionTimeline = ({ session }: { session: ColorLabSession }) => (
    <aside className={styles.timeline}>
        <TextTitle order={3}>Session progress</TextTitle>
        <div className={styles.timelineItems}>
            {session.rounds.map((round) => {
                const rated = round.cases.filter(
                    (item) => item.feedback.overall !== 'unrated',
                ).length;
                return (
                    <div className={styles.timelineItem} key={round.id}>
                        <span>Baseline Round {round.number}</span>
                        <strong>
                            {round.completedAt
                                ? `Complete (${rated}/${round.cases.length})`
                                : 'In progress'}
                        </strong>
                    </div>
                );
            })}
            {session.candidates.map((candidate) => (
                <div className={styles.timelineItem} key={candidate.id}>
                    <span>Candidate {candidate.number}</span>
                    <strong className={styles.capitalize}>{candidate.decision}</strong>
                </div>
            ))}
            <div className={styles.timelineItem}>
                <span>Session</span>
                <strong className={styles.capitalize}>{session.status}</strong>
            </div>
        </div>
    </aside>
);

export const StatRow = ({ children }: { children: ReactNode }) => (
    <div className={styles.stats}>{children}</div>
);

export const PaletteHeroPreview = ({
    colorCase,
    compact = false,
    imageUrl,
    label,
    palette,
    rgb,
}: {
    colorCase: ColorLabCase;
    compact?: boolean;
    imageUrl?: string;
    label: string;
    palette: ColorLabResult['palette'];
    rgb: string;
}) => (
    <div
        className={`${styles.heroPreview} ${compact ? styles.heroPreviewCompact : ''}`}
        style={{ backgroundColor: palette.base }}
    >
        <div
            className={styles.heroPreviewBackground}
            style={{
                background: `linear-gradient(to bottom, ${palette.heroTop.css} 0%, ${palette.heroMid.css} 55%, ${palette.heroBottom.css} 100%)`,
            }}
        />
        <div className={styles.heroPreviewContent}>
            <CaseArtwork colorCase={colorCase} imageUrl={imageUrl} />
            <div className={styles.heroPreviewMeta}>
                <strong>{label}</strong>
                <span>{rgb}</span>
            </div>
        </div>
    </div>
);

export const ResultPreview = ({
    colorCase,
    imageUrl,
    label,
    result,
}: {
    colorCase: ColorLabCase;
    imageUrl?: string;
    label: string;
    result: ColorLabResult;
}) => (
    <PaletteHeroPreview
        colorCase={colorCase}
        imageUrl={imageUrl}
        label={label}
        palette={result.palette}
        rgb={result.selectedRgb}
    />
);

export const CaseArtwork = ({
    colorCase,
    imageUrl,
}: {
    colorCase: ColorLabCase;
    imageUrl?: string;
}) => {
    const fallback = sampleToDataUrl(colorCase.sample);
    return (
        <img
            alt={`${colorCase.albumName} cover`}
            className={styles.cover}
            onError={(event) => {
                event.currentTarget.src = fallback;
            }}
            src={imageUrl || fallback}
        />
    );
};

export const FeedbackEditor = ({
    feedback,
    onChange,
}: {
    feedback: ColorLabFeedback;
    onChange: (feedback: ColorLabFeedback) => void;
}) => (
    <Stack gap="md">
        <div className={styles.issueGrid}>
            {COLOR_LAB_ISSUES.map((issue) => (
                <Checkbox
                    checked={feedback.issues.includes(issue)}
                    key={issue}
                    label={ISSUE_LABELS[issue]}
                    onChange={(event) => {
                        const issues = event.currentTarget.checked
                            ? [...feedback.issues, issue]
                            : feedback.issues.filter((item) => item !== issue);
                        onChange({ ...feedback, issues });
                    }}
                />
            ))}
        </div>
        <Group grow>
            <Select
                clearable
                data={['slight', 'moderate', 'strong']}
                label="Severity (optional)"
                onChange={(value) =>
                    onChange({ ...feedback, severity: value as ColorLabFeedback['severity'] })
                }
                value={feedback.severity}
            />
            <Select
                clearable
                data={[...COLOR_LAB_HUE_FAMILIES]}
                label="Preferred hue family (optional)"
                onChange={(value) =>
                    onChange({
                        ...feedback,
                        preferredHueFamily: value as ColorLabFeedback['preferredHueFamily'],
                    })
                }
                value={feedback.preferredHueFamily}
            />
        </Group>
        <Textarea
            label="Notes (optional)"
            minRows={2}
            onChange={(event) => onChange({ ...feedback, notes: event.currentTarget.value })}
            value={feedback.notes}
        />
    </Stack>
);

export const Diagnostics = ({ result }: { result: ColorLabResult }) => (
    <details className={styles.diagnostics}>
        <summary>Diagnostics</summary>
        <Group>
            <Button
                onClick={() =>
                    void navigator.clipboard.writeText(JSON.stringify(result.analysis, null, 2))
                }
                size="compact-sm"
            >
                Copy diagnostics
            </Button>
            <Text>Mode: {result.analysis.mode}</Text>
            <Text>
                Selected H/C/L: {result.analysis.selected.tone.hue.toFixed(1)} /{' '}
                {result.analysis.selected.tone.chroma.toFixed(3)} /{' '}
                {result.analysis.selected.tone.lightness.toFixed(3)}
            </Text>
            <Text>
                Neutral/chromatic: {(result.analysis.neutralShare * 100).toFixed(1)}% /{' '}
                {(result.analysis.chromaticShare * 100).toFixed(1)}%
            </Text>
        </Group>
        <pre>{JSON.stringify(result.analysis, null, 2)}</pre>
    </details>
);

export const SessionTotals = ({ session }: { session: ColorLabSession }) => {
    const baseline = getColorLabBaselineTotals(session);
    const accepted = session.candidates.find(
        (candidate) => candidate.id === session.acceptedCandidateId,
    );
    const candidate = accepted ? getColorLabCandidateTotals(accepted) : null;
    const totalCases = baseline.good + baseline['needs-adjustment'] + baseline.unrated;
    return (
        <StatRow>
            <span>{session.rounds.length} baseline rounds</span>
            <span>{totalCases} baseline cases</span>
            <span>{baseline.good} Good</span>
            <span>{baseline['needs-adjustment']} Needs Adjustment</span>
            <span>{session.candidates.length} candidate attempts</span>
            {accepted && <span>Candidate {accepted.number} accepted</span>}
            {candidate && (
                <span>
                    {candidate.better} Better / {candidate.same} Same / {candidate.worse} Worse
                </span>
            )}
        </StatRow>
    );
};
