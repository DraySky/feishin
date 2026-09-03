import type { ColorLabSession } from './album-color-lab-types';

import { SessionTotals, StageHeader } from './album-color-lab-components';
import styles from './album-color-lab-route.module.css';

import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

export const AlbumColorLabCompleteStage = ({ session }: { session: ColorLabSession }) => {
    const accepted = session.candidates.find(
        (candidate) => candidate.id === session.acceptedCandidateId,
    );
    return (
        <Stack gap="lg">
            <StageHeader
                detail={accepted ? `Candidate ${accepted.number} kept` : 'Experiment complete'}
                title="Session complete"
            />
            <section className={styles.card}>
                <TextTitle order={3}>{session.name}</TextTitle>
                <SessionTotals session={session} />
            </section>
            <section className={styles.card}>
                <TextTitle order={3}>Experiment history</TextTitle>
                {session.candidates.map((candidate) => (
                    <details
                        className={styles.historyDetails}
                        key={candidate.id}
                        open={candidate.id === accepted?.id}
                    >
                        <summary>
                            Candidate {candidate.number} - {candidate.decision} -{' '}
                            {candidate.comparisons.length} changed
                        </summary>
                        <div className={styles.historyRows}>
                            {candidate.comparisons.map((comparison) => {
                                const round = session.rounds.find(
                                    (item) => item.id === comparison.roundId,
                                );
                                const colorCase = round?.cases.find(
                                    (item) => item.id === comparison.caseId,
                                );
                                if (!colorCase) return null;
                                return (
                                    <div className={styles.historyRow} key={comparison.caseId}>
                                        <span>
                                            {colorCase.albumName} - {colorCase.albumArtistName}
                                        </span>
                                        <span>
                                            {colorCase.baseline.selectedRgb} to{' '}
                                            {comparison.current.selectedRgb}
                                        </span>
                                        <strong className={styles.capitalize}>
                                            {comparison.review ?? 'unreviewed'}
                                        </strong>
                                    </div>
                                );
                            })}
                        </div>
                    </details>
                ))}
                {!session.candidates.length && (
                    <Text isMuted>No candidate attempts were recorded.</Text>
                )}
            </section>
        </Stack>
    );
};
