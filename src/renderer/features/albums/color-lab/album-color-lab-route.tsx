import { useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';

import type {
    ColorLabCandidate,
    ColorLabComparisonReview,
    ColorLabSession,
} from './album-color-lab-types';

import { AlbumColorLabBaselineStage } from './album-color-lab-baseline-stage';
import { AlbumColorLabCompleteStage } from './album-color-lab-complete-stage';
import { SessionTimeline } from './album-color-lab-components';
import { AlbumColorLabRefinementStage } from './album-color-lab-refinement-stage';
import styles from './album-color-lab-route.module.css';
import {
    addColorLabCandidate,
    addColorLabRound,
    checkColorLabCandidate,
    createColorLabSession,
    decideColorLabCandidate,
    freezeColorLabBaseline,
    getColorLabBaselineTotals,
    reviewColorLabComparison,
    updateColorLabFeedback,
    updateColorLabVibrantPreference,
} from './album-color-lab-session';
import {
    type ColorLabStorageState,
    EMPTY_COLOR_LAB_STORAGE,
    loadColorLabStorage,
    saveColorLabStorage,
} from './album-color-lab-storage';
import {
    captureColorLabCase,
    exportColorLabSession,
    mapWithConcurrency,
    mergeColorLabVibrantResults,
    parseColorLabExport,
    populateColorLabVibrantResults,
} from './album-color-lab-utils';
import { AlbumColorLabVibrantStage } from './album-color-lab-vibrant-stage';

import { getItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { useCurrentServer } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Progress } from '/@/shared/components/progress/progress';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import {
    AlbumListSort,
    albumListSortMap,
    LibraryItem,
    SortOrder,
} from '/@/shared/types/domain-types';

const defaultSessionName = () => `Color experiment ${new Date().toISOString().slice(0, 10)}`;

const AlbumColorLabRoute = () => {
    const queryClient = useQueryClient();
    const server = useCurrentServer();
    const [storage, setStorage] = useState<ColorLabStorageState>(EMPTY_COLOR_LAB_STORAGE);
    const [ready, setReady] = useState(false);
    const [sessionName, setSessionName] = useState(defaultSessionName);
    const [roundSize, setRoundSize] = useState('20');
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState({ complete: 0, total: 0 });
    const [activeCandidateId, setActiveCandidateId] = useState<null | string>(null);
    const [matchedRejectedCandidate, setMatchedRejectedCandidate] =
        useState<ColorLabCandidate | null>(null);
    const [showVibrantExperiment, setShowVibrantExperiment] = useState(false);
    const [vibrantBusy, setVibrantBusy] = useState(false);

    useEffect(() => {
        loadColorLabStorage()
            .then(setStorage)
            .finally(() => setReady(true));
    }, []);

    const updateStorage = (updater: (value: ColorLabStorageState) => ColorLabStorageState) => {
        setStorage((value) => {
            const next = updater(value);
            void saveColorLabStorage(next);
            return next;
        });
    };

    const activeSession =
        storage.sessions.find((session) => session.id === storage.activeSessionId) ?? null;
    const missingVibrantCount =
        activeSession?.rounds.reduce(
            (count, round) => count + round.cases.filter((colorCase) => !colorCase.vibrant).length,
            0,
        ) ?? 0;
    const activeSessionRef = useRef(activeSession);
    activeSessionRef.current = activeSession;

    const replaceSession = (session: ColorLabSession) => {
        updateStorage((value) => ({
            activeSessionId: session.id,
            sessions: [...value.sessions.filter((item) => item.id !== session.id), session],
        }));
    };

    useEffect(() => {
        const session = activeSessionRef.current;
        if (!session || !missingVibrantCount) return;
        setVibrantBusy(true);
        void populateColorLabVibrantResults(session)
            .then((analyzedSession) => {
                updateStorage((value) => ({
                    ...value,
                    sessions: value.sessions.map((storedSession) =>
                        storedSession.id === session.id
                            ? mergeColorLabVibrantResults(storedSession, analyzedSession)
                            : storedSession,
                    ),
                }));
            })
            .finally(() => setVibrantBusy(false));
    }, [activeSession?.id, missingVibrantCount]);

    const getImageUrl = (serverId: string, imageId: null | string) => {
        if (!server || server.id !== serverId) return undefined;
        return (
            getItemImageUrl({
                id: imageId,
                itemType: LibraryItem.ALBUM,
                serverId,
                size: 500,
            }) || undefined
        );
    };

    const captureRound = async (session: ColorLabSession) => {
        if (!server?.id) throw new Error('Connect to a media server before starting a round');
        const existing = new Set(
            session.rounds.flatMap((round) =>
                round.cases.map((colorCase) => `${colorCase.serverId}:${colorCase.albumId}`),
            ),
        );
        const size = session.albumsPerRound;
        const randomSupported = !!albumListSortMap[server.type][AlbumListSort.RANDOM];
        const response = await queryClient.fetchQuery(
            albumQueries.list({
                query: {
                    limit: randomSupported
                        ? size + existing.size
                        : Math.max(size * 3 + existing.size, 60),
                    sortBy: randomSupported ? AlbumListSort.RANDOM : AlbumListSort.NAME,
                    sortOrder: SortOrder.ASC,
                    startIndex: 0,
                },
                serverId: server.id,
            }),
        );
        const available = response.items.filter(
            (album) => !existing.has(`${album._serverId}:${album.id}`),
        );
        const source = randomSupported
            ? available.slice(0, size)
            : [...available].sort(() => Math.random() - 0.5).slice(0, size);
        setProgress({ complete: 0, total: source.length });
        const results = await mapWithConcurrency(source, 5, async (album) => {
            try {
                const imageUrl = getImageUrl(album._serverId, album.imageId);
                if (!imageUrl) throw new Error('Album has no artwork');
                return await captureColorLabCase(album, imageUrl);
            } finally {
                setProgress((value) => ({ ...value, complete: value.complete + 1 }));
            }
        });
        const cases = results.flatMap((result) =>
            result.status === 'fulfilled' ? [result.value] : [],
        );
        return { cases, failed: results.length - cases.length };
    };

    const addRound = async (session: ColorLabSession) => {
        setBusy(true);
        setProgress({ complete: 0, total: session.albumsPerRound });
        try {
            const { cases, failed } = await captureRound(session);
            if (!cases.length) throw new Error('No usable album artwork was found');
            const next = addColorLabRound(session, cases);
            replaceSession(next);
            toast.success({
                message: `Baseline Round ${next.rounds.length} ready with ${cases.length} cases${
                    failed ? `, skipped ${failed}` : ''
                }`,
            });
        } catch (error) {
            toast.error({
                message: error instanceof Error ? error.message : 'Unable to create baseline round',
            });
        } finally {
            setBusy(false);
        }
    };

    const startSession = async () => {
        if (!server?.id || !sessionName.trim()) return;
        const albumsPerRound = Math.max(1, Math.min(100, Number(roundSize) || 20));
        const session = createColorLabSession(sessionName.trim(), albumsPerRound, server.id);
        replaceSession(session);
        await addRound(session);
    };

    const checkCandidate = (session: ColorLabSession) => {
        const result = checkColorLabCandidate(session);
        if (result.kind === 'unchanged') {
            setActiveCandidateId(null);
            setMatchedRejectedCandidate(null);
        } else if (result.kind === 'existing') {
            if (result.candidate.decision === 'pending') {
                setActiveCandidateId(result.candidate.id);
                setMatchedRejectedCandidate(null);
            } else {
                setActiveCandidateId(null);
                setMatchedRejectedCandidate(
                    result.candidate.decision === 'rejected' ? result.candidate : null,
                );
            }
        } else {
            replaceSession(addColorLabCandidate(session, result.candidate));
            setActiveCandidateId(result.candidate.id);
            setMatchedRejectedCandidate(null);
        }
    };

    const continueToRefinement = () => {
        if (!activeSession) return;
        const totals = getColorLabBaselineTotals(activeSession);
        if (!totals.good && !totals['needs-adjustment']) return;
        const frozen = freezeColorLabBaseline(activeSession);
        replaceSession(frozen);
    };

    useEffect(() => {
        if (
            activeSession?.status === 'refinement' &&
            !activeSession.candidates.some((candidate) => candidate.decision === 'pending')
        ) {
            const result = checkColorLabCandidate(activeSession);
            if (result.kind === 'unchanged') {
                setActiveCandidateId(null);
                setMatchedRejectedCandidate(null);
            } else if (result.kind === 'new') {
                const nextSession = addColorLabCandidate(activeSession, result.candidate);
                setStorage((value) => {
                    const next = {
                        activeSessionId: nextSession.id,
                        sessions: [
                            ...value.sessions.filter((item) => item.id !== nextSession.id),
                            nextSession,
                        ],
                    };
                    void saveColorLabStorage(next);
                    return next;
                });
                setActiveCandidateId(result.candidate.id);
                setMatchedRejectedCandidate(null);
            } else if (result.kind === 'existing' && result.candidate.decision === 'rejected') {
                setMatchedRejectedCandidate(result.candidate);
            }
        }
    }, [activeSession]);

    const importSession = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const session = parseColorLabExport(JSON.parse(await file.text()));
            replaceSession(session);
            setActiveCandidateId(
                session.candidates.find((candidate) => candidate.decision === 'pending')?.id ??
                    null,
            );
            setMatchedRejectedCandidate(null);
            toast.success({ message: `Imported ${session.rounds.length} baseline rounds` });
        } catch (error) {
            toast.error({
                message: error instanceof Error ? error.message : 'Invalid Color Lab export',
            });
        }
    };

    if (!import.meta.env.DEV) return null;
    if (!ready) return <Text>Loading Color Lab...</Text>;

    if (!activeSession) {
        return (
            <main className={styles.root}>
                <div className={styles.landing}>
                    <Stack gap="lg">
                        <div>
                            <Text className={styles.eyebrow}>Development tool</Text>
                            <TextTitle order={1}>Album Color Lab</TextTitle>
                            <Text isMuted>
                                Build a frozen baseline, test picker refinements, and keep or reject
                                each attempt.
                            </Text>
                        </div>
                        <section className={styles.startCard}>
                            <TextTitle order={2}>Start a new session</TextTitle>
                            <TextInput
                                label="Session name"
                                onChange={(event) => setSessionName(event.currentTarget.value)}
                                value={sessionName}
                            />
                            <TextInput
                                label="Albums per baseline round"
                                min="1"
                                onChange={(event) => setRoundSize(event.currentTarget.value)}
                                type="number"
                                value={roundSize}
                            />
                            <Button
                                disabled={!server || busy}
                                loading={busy}
                                onClick={startSession}
                            >
                                Start session
                            </Button>
                        </section>
                        <Group>
                            <Button component="label" variant="default">
                                Import session
                                <input
                                    accept="application/json"
                                    hidden
                                    onChange={importSession}
                                    type="file"
                                />
                            </Button>
                        </Group>
                        {!!storage.sessions.length && (
                            <section className={styles.previousSessions}>
                                <TextTitle order={3}>Previous sessions</TextTitle>
                                {[...storage.sessions]
                                    .sort((first, second) =>
                                        second.updatedAt.localeCompare(first.updatedAt),
                                    )
                                    .map((session) => (
                                        <button
                                            className={styles.sessionButton}
                                            key={session.id}
                                            onClick={() =>
                                                updateStorage((value) => ({
                                                    ...value,
                                                    activeSessionId: session.id,
                                                }))
                                            }
                                            type="button"
                                        >
                                            <span>{session.name}</span>
                                            <strong>{session.status}</strong>
                                        </button>
                                    ))}
                            </section>
                        )}
                    </Stack>
                </div>
            </main>
        );
    }

    const currentRound = activeSession.rounds.at(-1);
    const pendingCandidate =
        activeSession.candidates.find(
            (candidate) => candidate.id === activeCandidateId && candidate.decision === 'pending',
        ) ??
        activeSession.candidates.find((candidate) => candidate.decision === 'pending') ??
        null;

    return (
        <main className={styles.root}>
            <Stack gap="lg">
                <header className={styles.sessionHeader}>
                    <div>
                        <Text className={styles.eyebrow}>Album Color Lab</Text>
                        <TextTitle order={1}>{activeSession.name}</TextTitle>
                        <Text isMuted>
                            Started {new Date(activeSession.createdAt).toLocaleString()} - stored
                            locally in this app
                        </Text>
                    </div>
                    <Group>
                        <Button
                            loading={vibrantBusy}
                            onClick={() => setShowVibrantExperiment((value) => !value)}
                            variant={showVibrantExperiment ? 'filled' : 'default'}
                        >
                            {showVibrantExperiment ? 'Return to session' : 'Compare Node Vibrant'}
                        </Button>
                        <Button
                            disabled={vibrantBusy}
                            onClick={() => exportColorLabSession(activeSession)}
                        >
                            Export session
                        </Button>
                        <Button
                            onClick={() =>
                                updateStorage((value) => {
                                    setShowVibrantExperiment(false);
                                    return { ...value, activeSessionId: null };
                                })
                            }
                            variant="default"
                        >
                            All sessions
                        </Button>
                    </Group>
                </header>

                {busy && progress.total > 0 && (
                    <section className={styles.loadingCard}>
                        <Text>
                            Sampling artwork {progress.complete} / {progress.total}
                        </Text>
                        <Progress value={(progress.complete / progress.total) * 100} />
                    </section>
                )}

                <div className={styles.sessionLayout}>
                    <div>
                        {!busy && showVibrantExperiment && (
                            <AlbumColorLabVibrantStage
                                analyzing={vibrantBusy}
                                getImageUrl={getImageUrl}
                                onClose={() => setShowVibrantExperiment(false)}
                                onPreference={(roundId, caseId, bestSource) =>
                                    replaceSession(
                                        updateColorLabVibrantPreference(
                                            activeSession,
                                            roundId,
                                            caseId,
                                            bestSource,
                                        ),
                                    )
                                }
                                session={activeSession}
                            />
                        )}
                        {!busy &&
                            !showVibrantExperiment &&
                            activeSession.status === 'baseline' &&
                            currentRound && (
                                <AlbumColorLabBaselineStage
                                    getImageUrl={getImageUrl}
                                    key={currentRound.id}
                                    onAddRound={() => void addRound(activeSession)}
                                    onContinue={continueToRefinement}
                                    onUpdateFeedback={(roundId, caseId, feedback) =>
                                        replaceSession(
                                            updateColorLabFeedback(
                                                activeSession,
                                                roundId,
                                                caseId,
                                                feedback,
                                            ),
                                        )
                                    }
                                    round={currentRound}
                                    session={activeSession}
                                />
                            )}
                        {!busy &&
                            !showVibrantExperiment &&
                            activeSession.status === 'baseline' &&
                            !currentRound && (
                                <section className={styles.card}>
                                    <TextTitle order={2}>Ready for Baseline Round 1</TextTitle>
                                    <Text isMuted>
                                        The previous sampling attempt did not create a round.
                                    </Text>
                                    <Button onClick={() => void addRound(activeSession)}>
                                        Sample albums
                                    </Button>
                                </section>
                            )}
                        {!busy &&
                            !showVibrantExperiment &&
                            activeSession.status === 'refinement' && (
                                <AlbumColorLabRefinementStage
                                    candidate={pendingCandidate}
                                    getImageUrl={getImageUrl}
                                    matchedRejectedCandidate={matchedRejectedCandidate}
                                    onCheck={() => checkCandidate(activeSession)}
                                    onDecide={(decision) => {
                                        if (!pendingCandidate) return;
                                        replaceSession(
                                            decideColorLabCandidate(
                                                activeSession,
                                                pendingCandidate.id,
                                                decision,
                                            ),
                                        );
                                        setActiveCandidateId(null);
                                        setMatchedRejectedCandidate(null);
                                    }}
                                    onReview={(caseId, review: ColorLabComparisonReview) => {
                                        if (!pendingCandidate) return;
                                        replaceSession(
                                            reviewColorLabComparison(
                                                activeSession,
                                                pendingCandidate.id,
                                                caseId,
                                                review,
                                            ),
                                        );
                                    }}
                                    session={activeSession}
                                />
                            )}
                        {!busy && !showVibrantExperiment && activeSession.status === 'complete' && (
                            <AlbumColorLabCompleteStage session={activeSession} />
                        )}
                    </div>
                    <SessionTimeline session={activeSession} />
                </div>
                <Text isMuted>
                    Exports contain only session metadata, 32 x 32 RGBA samples, picker and Node
                    Vibrant analysis, feedback, and candidate decisions. They do not contain full
                    artwork, artwork URLs, or credentials. Place exported JSON under
                    .scratch/album-color-lab/sessions/ for Codex analysis.
                </Text>
            </Stack>
        </main>
    );
};

export default AlbumColorLabRoute;
