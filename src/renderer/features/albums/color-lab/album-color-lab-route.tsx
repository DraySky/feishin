import { useQueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid/non-secure';
import { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import styles from './album-color-lab-route.module.css';

import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { getItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { AppRoute } from '/@/renderer/router/routes';
import { useCurrentServer } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Checkbox } from '/@/shared/components/checkbox/checkbox';
import { Group } from '/@/shared/components/group/group';
import { Progress } from '/@/shared/components/progress/progress';
import { Select } from '/@/shared/components/select/select';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Textarea } from '/@/shared/components/textarea/textarea';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { toast } from '/@/shared/components/toast/toast';
import {
    Album,
    AlbumListSort,
    LibraryItem,
    SortOrder,
    albumListSortMap,
} from '/@/shared/types/domain-types';

import {
    COLOR_LAB_HUE_FAMILIES,
    COLOR_LAB_ISSUES,
    ColorLabBatch,
    ColorLabCase,
    ColorLabFeedback,
    ColorLabIssue,
} from './album-color-lab-types';
import {
    EMPTY_COLOR_LAB_STORAGE,
    ColorLabStorageState,
    loadColorLabStorage,
    saveColorLabStorage,
} from './album-color-lab-storage';
import {
    captureColorLabCase,
    exportColorLabBatch,
    hasColorLabResultChanged,
    mapWithConcurrency,
    parseColorLabExport,
    replayColorLabCase,
    sampleToDataUrl,
} from './album-color-lab-utils';

const ISSUE_LABELS: Record<ColorLabIssue, string> = {
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

type CaseFilter = 'all' | 'changed' | 'comparison' | ColorLabFeedback['overall'];

const PalettePreview = ({ colorCase, current = false }: { colorCase: ColorLabCase; current?: boolean }) => {
    const replay = current ? replayColorLabCase(colorCase) : null;
    const palette = replay?.palette ?? colorCase.baseline.palette;
    const rgb = replay?.analysis.selected.rgb ?? colorCase.baseline.selectedRgb;
    return (
        <div
            className={styles.palettePreview}
            style={{
                background: `linear-gradient(160deg, ${palette.heroTop.css}, ${palette.heroMid.css} 52%, ${palette.heroBottom.css})`,
            }}
        >
            <strong>{rgb}</strong>
            <span>{current ? 'Current' : 'Baseline'}</span>
        </div>
    );
};

const isTypingTarget = (target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    return !!element?.closest('input, textarea, select, [contenteditable="true"]');
};

const AlbumColorLabRoute = () => {
    const queryClient = useQueryClient();
    const server = useCurrentServer();
    const [storage, setStorage] = useState<ColorLabStorageState>(EMPTY_COLOR_LAB_STORAGE);
    const [ready, setReady] = useState(false);
    const [batchName, setBatchName] = useState('Calibration 01');
    const [batchKind, setBatchKind] = useState<'calibration' | 'holdout'>('calibration');
    const [batchSize, setBatchSize] = useState('20');
    const [filter, setFilter] = useState<CaseFilter>('all');
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState({ complete: 0, total: 0 });
    const [search, setSearch] = useState('');
    const [searchResults, setSearchResults] = useState<Album[]>([]);

    useEffect(() => {
        loadColorLabStorage()
            .then((value) => setStorage(value))
            .finally(() => setReady(true));
    }, []);

    const updateStorage = (updater: (value: ColorLabStorageState) => ColorLabStorageState) => {
        setStorage((value) => {
            const next = updater(value);
            void saveColorLabStorage(next);
            return next;
        });
    };

    const activeBatch = storage.batches.find((batch) => batch.id === storage.activeBatchId) ?? null;
    const replayedCases = useMemo(
        () =>
            (activeBatch?.cases ?? []).map((colorCase) => {
                const current = replayColorLabCase(colorCase);
                return {
                    changed: !!current && hasColorLabResultChanged(colorCase.baseline.analysis, current.analysis),
                    colorCase,
                    current,
                };
            }),
        [activeBatch],
    );
    const filteredCases = replayedCases.filter(({ changed, colorCase }) => {
        if (filter === 'all') return true;
        if (filter === 'changed') return changed;
        if (filter === 'comparison') return changed && !colorCase.comparisonReview;
        return colorCase.feedback.overall === filter;
    });
    const storedIndex = activeBatch ? storage.activeCaseByBatch[activeBatch.id] ?? 0 : 0;
    const activeEntry = filteredCases[Math.min(storedIndex, Math.max(filteredCases.length - 1, 0))];
    const activeCase = activeEntry?.colorCase ?? null;

    const replaceBatch = (batch: ColorLabBatch) => {
        updateStorage((value) => ({
            ...value,
            activeBatchId: batch.id,
            batches: [...value.batches.filter((item) => item.id !== batch.id), batch],
        }));
    };

    const setCaseIndex = (index: number) => {
        if (!activeBatch) return;
        updateStorage((value) => ({
            ...value,
            activeCaseByBatch: {
                ...value.activeCaseByBatch,
                [activeBatch.id]: Math.max(0, Math.min(index, filteredCases.length - 1)),
            },
        }));
    };

    const advance = () => {
        const nextUnrated = filteredCases.findIndex(
            ({ colorCase }, index) => index > storedIndex && colorCase.feedback.overall === 'unrated',
        );
        setCaseIndex(nextUnrated === -1 ? storedIndex + 1 : nextUnrated);
    };

    const updateCase = (updater: (colorCase: ColorLabCase) => ColorLabCase) => {
        if (!activeBatch || !activeCase) return;
        const now = new Date().toISOString();
        replaceBatch({
            ...activeBatch,
            cases: activeBatch.cases.map((colorCase) =>
                colorCase.albumId === activeCase.albumId && colorCase.serverId === activeCase.serverId
                    ? updater(colorCase)
                    : colorCase,
            ),
            updatedAt: now,
        });
    };

    const setFeedback = (feedback: ColorLabFeedback, shouldAdvance = false) => {
        updateCase((colorCase) => ({ ...colorCase, feedback }));
        if (shouldAdvance) advance();
    };

    const getAlbumImageUrl = (album: Pick<Album, '_serverId' | 'imageId'>) =>
        getItemImageUrl({
            id: album.imageId,
            itemType: LibraryItem.ALBUM,
            serverId: album._serverId,
            size: 300,
        });

    const analyzeAlbums = async (albums: Album[]) => {
        setBusy(true);
        setProgress({ complete: 0, total: albums.length });
        const results = await mapWithConcurrency(albums, 5, async (album) => {
            try {
                const imageUrl = getAlbumImageUrl(album);
                if (!imageUrl) throw new Error('Album has no artwork');
                return await captureColorLabCase(album, imageUrl);
            } finally {
                setProgress((value) => ({ ...value, complete: value.complete + 1 }));
            }
        });
        const cases = results.flatMap((result) =>
            result.status === 'fulfilled' ? [result.value] : [],
        );
        const failed = results.length - cases.length;
        setBusy(false);
        return { cases, failed };
    };

    const createBatch = async () => {
        if (!server?.id || !batchName.trim()) return;
        setBusy(true);
        try {
            const randomSupported = !!albumListSortMap[server.type][AlbumListSort.RANDOM];
            const size = Number(batchSize);
            const response = await queryClient.fetchQuery(
                albumQueries.list({
                    query: {
                        limit: randomSupported ? size : Math.max(size * 3, 60),
                        sortBy: randomSupported ? AlbumListSort.RANDOM : AlbumListSort.NAME,
                        sortOrder: SortOrder.ASC,
                        startIndex: 0,
                    },
                    serverId: server.id,
                }),
            );
            const source = randomSupported
                ? response.items.slice(0, size)
                : [...response.items].sort(() => Math.random() - 0.5).slice(0, size);
            const { cases, failed } = await analyzeAlbums(source);
            const now = new Date().toISOString();
            const batch: ColorLabBatch = {
                cases,
                createdAt: now,
                id: nanoid(),
                kind: batchKind,
                name: batchName.trim(),
                sourceServerId: server.id,
                updatedAt: now,
            };
            replaceBatch(batch);
            toast.success({ message: `Created ${cases.length} cases${failed ? `, skipped ${failed}` : ''}` });
        } catch (error) {
            setBusy(false);
            toast.error({ message: error instanceof Error ? error.message : 'Unable to create batch' });
        }
    };

    const searchAlbums = async () => {
        if (!server?.id || !search.trim()) return;
        try {
            const response = await queryClient.fetchQuery(
                albumQueries.list({
                    query: {
                        limit: 20,
                        searchTerm: search.trim(),
                        sortBy: AlbumListSort.NAME,
                        sortOrder: SortOrder.ASC,
                        startIndex: 0,
                    },
                    serverId: server.id,
                }),
            );
            setSearchResults(response.items);
        } catch (error) {
            toast.error({ message: error instanceof Error ? error.message : 'Search failed' });
        }
    };

    const addAlbum = async (album: Album) => {
        if (!activeBatch) return;
        if (activeBatch.cases.some((item) => item.albumId === album.id && item.serverId === album._serverId)) {
            toast.info({ message: 'Album is already in this batch' });
            return;
        }
        const { cases, failed } = await analyzeAlbums([album]);
        if (failed || !cases[0]) {
            toast.error({ message: 'Unable to sample this album artwork' });
            return;
        }
        replaceBatch({
            ...activeBatch,
            cases: [...activeBatch.cases, cases[0]],
            updatedAt: new Date().toISOString(),
        });
        setSearchResults([]);
    };

    const importBatch = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const batch = parseColorLabExport(JSON.parse(await file.text()));
            replaceBatch(batch);
            toast.success({ message: `Imported ${batch.cases.length} cases` });
        } catch (error) {
            toast.error({ message: error instanceof Error ? error.message : 'Invalid Color Lab export' });
        }
    };

    useEffect(() => {
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (!activeCase || isTypingTarget(event.target)) return;
            if (event.key.toLowerCase() === 'g') {
                setFeedback({ ...activeCase.feedback, issues: [], overall: 'good' }, true);
            } else if (event.key.toLowerCase() === 'n') {
                setFeedback({ ...activeCase.feedback, overall: 'needs-adjustment' });
            } else if (event.key === 'ArrowLeft') {
                setCaseIndex(storedIndex - 1);
            } else if (event.key === 'ArrowRight') {
                setCaseIndex(storedIndex + 1);
            } else if (event.key === 'Enter' && activeCase.feedback.overall !== 'unrated') {
                advance();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    });

    if (!import.meta.env.DEV) return null;
    if (!ready) return <Text>Loading Color Lab...</Text>;

    const totals = activeBatch?.cases.reduce(
        (result, colorCase) => {
            result[colorCase.feedback.overall]++;
            colorCase.feedback.issues.forEach((issue) => result.issues.set(issue, (result.issues.get(issue) ?? 0) + 1));
            return result;
        },
        { good: 0, issues: new Map<ColorLabIssue, number>(), 'needs-adjustment': 0, unrated: 0 },
    );
    const comparisonTotals = replayedCases.reduce(
        (result, entry) => {
            if (entry.changed) {
                if (entry.colorCase.comparisonReview) {
                    result[entry.colorCase.comparisonReview]++;
                } else {
                    result.unreviewed++;
                }
            }
            return result;
        },
        { better: 0, same: 0, unreviewed: 0, worse: 0 },
    );
    const currentImageUrl = activeCase && server?.id === activeCase.serverId
        ? getItemImageUrl({ id: activeCase.imageId, itemType: LibraryItem.ALBUM, serverId: activeCase.serverId, size: 500 })
        : undefined;
    const sampleImageUrl = activeCase ? sampleToDataUrl(activeCase.sample) : '';

    return (
        <main className={styles.root}>
            <Stack gap="lg">
                <Group justify="space-between">
                    <div>
                        <TextTitle order={1}>Album Color Lab</TextTitle>
                        <Text isMuted>Developer-only calibration and deterministic replay</Text>
                    </div>
                    <Group>
                        <Button component="label">
                            Import Batch
                            <input accept="application/json" hidden onChange={importBatch} type="file" />
                        </Button>
                        {activeBatch && <Button onClick={() => exportColorLabBatch(activeBatch)}>Export Batch</Button>}
                    </Group>
                </Group>

                <section className={styles.toolbar}>
                    <TextInput label="Batch name" onChange={(event) => setBatchName(event.currentTarget.value)} value={batchName} />
                    <Select data={[{ label: 'Calibration', value: 'calibration' }, { label: 'Holdout', value: 'holdout' }]} label="Kind" onChange={(value) => setBatchKind((value as typeof batchKind) ?? 'calibration')} value={batchKind} />
                    <Select data={['20', '40', '60']} label="Size" onChange={(value) => setBatchSize(value ?? '20')} value={batchSize} />
                    <Button disabled={!server || busy} loading={busy} onClick={createBatch}>Load albums</Button>
                    <Select data={storage.batches.map((batch) => ({ label: `${batch.name} (${batch.cases.length})`, value: batch.id }))} label="Saved batches" onChange={(value) => updateStorage((state) => ({ ...state, activeBatchId: value }))} placeholder="Select batch" value={storage.activeBatchId} />
                </section>

                {busy && progress.total > 0 && (
                    <Stack gap="xs">
                        <Text>Analyzing artwork {progress.complete} / {progress.total}</Text>
                        <Progress value={(progress.complete / progress.total) * 100} />
                    </Stack>
                )}

                {activeBatch && totals && (
                    <>
                        <section className={styles.summary}>
                            <strong>{activeBatch.name}</strong>
                            <span>Total {activeBatch.cases.length}</span>
                            <span>Rated {totals.good + totals['needs-adjustment']}</span>
                            <span>Unrated {totals.unrated}</span>
                            <span>Good {totals.good}</span>
                            <span>Needs adjustment {totals['needs-adjustment']}</span>
                            <span>Better {comparisonTotals.better}</span>
                            <span>Same {comparisonTotals.same}</span>
                            <span>Worse {comparisonTotals.worse}</span>
                            <span>Changed unreviewed {comparisonTotals.unreviewed}</span>
                            {[...totals.issues].map(([issue, count]) => <span key={issue}>{ISSUE_LABELS[issue]}: {count}</span>)}
                        </section>
                        <Group>
                            <Select data={[
                                { label: 'All', value: 'all' },
                                { label: 'Unrated', value: 'unrated' },
                                { label: 'Good', value: 'good' },
                                { label: 'Needs adjustment', value: 'needs-adjustment' },
                                { label: 'Changed from baseline', value: 'changed' },
                                { label: 'Comparison unreviewed', value: 'comparison' },
                            ]} label="Filter" onChange={(value) => { setFilter((value as CaseFilter) ?? 'all'); setCaseIndex(0); }} value={filter} />
                            <Text>{filteredCases.length ? `${storedIndex + 1} / ${filteredCases.length}` : 'No matching cases'}</Text>
                        </Group>
                    </>
                )}

                {activeCase && activeEntry?.current && (
                    <section className={styles.review}>
                        <div className={styles.visuals}>
                            <img alt={`${activeCase.albumName} cover`} className={styles.cover} onError={(event) => { event.currentTarget.src = sampleImageUrl; }} src={currentImageUrl || sampleImageUrl} />
                            <PalettePreview colorCase={activeCase} />
                            {activeEntry.changed && <PalettePreview colorCase={activeCase} current />}
                        </div>
                        <Stack gap="xs">
                            <TextTitle order={2}>{activeCase.albumName}</TextTitle>
                            <Text>{activeCase.albumArtistName}{activeCase.releaseYear ? ` - ${activeCase.releaseYear}` : ''}</Text>
                            <Button component={Link} to={AppRoute.LIBRARY_ALBUMS_DETAIL.replace(':albumId', activeCase.albumId)} variant="subtle">Open Album Detail</Button>
                        </Stack>
                        <Group>
                            <Button onClick={() => setFeedback({ ...activeCase.feedback, issues: [], overall: 'good' }, true)} variant={activeCase.feedback.overall === 'good' ? 'filled' : 'default'}>Good</Button>
                            <Button onClick={() => setFeedback({ ...activeCase.feedback, overall: 'needs-adjustment' })} variant={activeCase.feedback.overall === 'needs-adjustment' ? 'filled' : 'default'}>Needs adjustment</Button>
                        </Group>

                        {activeCase.feedback.overall === 'needs-adjustment' && (
                            <Stack gap="md">
                                <div className={styles.issueGrid}>
                                    {COLOR_LAB_ISSUES.map((issue) => (
                                        <Checkbox checked={activeCase.feedback.issues.includes(issue)} key={issue} label={ISSUE_LABELS[issue]} onChange={(event) => {
                                            const issues = event.currentTarget.checked
                                                ? [...activeCase.feedback.issues, issue]
                                                : activeCase.feedback.issues.filter((item) => item !== issue);
                                            setFeedback({ ...activeCase.feedback, issues });
                                        }} />
                                    ))}
                                </div>
                                <Group grow>
                                    <Select clearable data={['slight', 'moderate', 'strong']} label="Severity (optional)" onChange={(value) => setFeedback({ ...activeCase.feedback, severity: value as ColorLabFeedback['severity'] })} value={activeCase.feedback.severity} />
                                    <Select clearable data={[...COLOR_LAB_HUE_FAMILIES]} label="Preferred hue family (optional)" onChange={(value) => setFeedback({ ...activeCase.feedback, preferredHueFamily: value as ColorLabFeedback['preferredHueFamily'] })} value={activeCase.feedback.preferredHueFamily} />
                                </Group>
                                <Textarea label="Notes (optional)" minRows={2} onChange={(event) => setFeedback({ ...activeCase.feedback, notes: event.currentTarget.value })} value={activeCase.feedback.notes} />
                                <Button onClick={advance}>Save & Next</Button>
                            </Stack>
                        )}

                        {activeEntry.changed && (
                            <Group>
                                <Text>Comparison:</Text>
                                {(['better', 'same', 'worse'] as const).map((review) => (
                                    <Button key={review} onClick={() => updateCase((colorCase) => ({ ...colorCase, comparisonReview: review }))} variant={activeCase.comparisonReview === review ? 'filled' : 'default'}>{review === 'same' ? 'Same / still acceptable' : review}</Button>
                                ))}
                            </Group>
                        )}

                        <Group justify="space-between">
                            <Button disabled={storedIndex === 0} onClick={() => setCaseIndex(storedIndex - 1)}>Previous</Button>
                            <Text isMuted>Shortcuts: G good, N adjust, Enter next, Left/Right navigate</Text>
                            <Button disabled={storedIndex >= filteredCases.length - 1} onClick={() => setCaseIndex(storedIndex + 1)}>Next</Button>
                        </Group>

                        <details className={styles.diagnostics}>
                            <summary>Diagnostics</summary>
                            <Group>
                                <Button onClick={() => void navigator.clipboard.writeText(JSON.stringify(activeEntry.current?.analysis, null, 2))} size="compact-sm">Copy diagnostics</Button>
                                <Text>Mode: {activeEntry.current.analysis.mode}</Text>
                                <Text>Selected H/C/L: {activeEntry.current.analysis.selected.tone.hue.toFixed(1)} / {activeEntry.current.analysis.selected.tone.chroma.toFixed(3)} / {activeEntry.current.analysis.selected.tone.lightness.toFixed(3)}</Text>
                                <Text>Neutral/chromatic: {(activeEntry.current.analysis.neutralShare * 100).toFixed(1)}% / {(activeEntry.current.analysis.chromaticShare * 100).toFixed(1)}%</Text>
                            </Group>
                            <pre>{JSON.stringify(activeEntry.current.analysis, null, 2)}</pre>
                        </details>
                    </section>
                )}

                {activeBatch && (
                    <section className={styles.searchPanel}>
                        <TextTitle order={3}>Add a specific album</TextTitle>
                        <Group align="end">
                            <TextInput label="Album search" onChange={(event) => setSearch(event.currentTarget.value)} onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') void searchAlbums(); }} value={search} />
                            <Button onClick={searchAlbums}>Search</Button>
                        </Group>
                        <div className={styles.searchResults}>
                            {searchResults.map((album) => (
                                <Button key={album.id} onClick={() => addAlbum(album)} variant="subtle">Add {album.name} - {album.albumArtistName}</Button>
                            ))}
                        </div>
                    </section>
                )}

                <Text isMuted>Color Lab exports are local calibration data. Keep them out of Git. The repo's .scratch directory is ignored and is a good place to keep exported batches for Codex analysis.</Text>
            </Stack>
        </main>
    );
};

export default AlbumColorLabRoute;
