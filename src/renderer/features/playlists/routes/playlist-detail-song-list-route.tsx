import type { CSSProperties } from 'react';

import { closeAllModals, openModal } from '@mantine/modals';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, useNavigate, useParams } from 'react-router';

import styles from './playlist-detail-song-list-route.module.css';

import { useItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { TableItemSize } from '/@/renderer/components/item-list/item-table-list/item-table-list';
import { NativeScrollArea } from '/@/renderer/components/native-scroll-area/native-scroll-area';
import { ListContext, useListContext } from '/@/renderer/context/list-context';
import { useAlbumDetailSeed } from '/@/renderer/features/albums/hooks/use-album-detail-seed';
import { createAlbumDetailPalette } from '/@/renderer/features/albums/utils/album-detail-palette';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { playlistsQueries } from '/@/renderer/features/playlists/api/playlists-api';
import { ClientSideSongFilters } from '/@/renderer/features/playlists/components/client-side-song-filters';
import { PlaylistDetailSongListContent } from '/@/renderer/features/playlists/components/playlist-detail-song-list-content';
import { PlaylistDetailSongListHeader } from '/@/renderer/features/playlists/components/playlist-detail-song-list-header';
import { PlaylistQueryBuilderRef } from '/@/renderer/features/playlists/components/playlist-query-builder';
import { PlaylistQueryEditor } from '/@/renderer/features/playlists/components/playlist-query-editor';
import { SaveAsPlaylistForm } from '/@/renderer/features/playlists/components/save-as-playlist-form';
import { usePlaylistSongListFilters } from '/@/renderer/features/playlists/hooks/use-playlist-song-list-filters';
import { useUpdatePlaylist } from '/@/renderer/features/playlists/mutations/update-playlist-mutation';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import {
    LibraryBackgroundImage,
    useHeaderHeight,
} from '/@/renderer/features/shared/components/library-background-overlay';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';
import { LibraryHeaderBar } from '/@/renderer/features/shared/components/library-header-bar';
import { ListWithSidebarContainer } from '/@/renderer/features/shared/components/list-with-sidebar-container';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';
import { useFastAverageColor } from '/@/renderer/hooks';
import { AppRoute } from '/@/renderer/router/routes';
import {
    useAlbumBackground,
    useCurrentServer,
    usePageSidebar,
    usePlayerShuffle,
    usePlayerStatus,
    useQueuePlaybackContext,
} from '/@/renderer/store';
import { useSettingsStore } from '/@/renderer/store/settings.store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem, ServerType, Song } from '/@/shared/types/domain-types';
import { ItemListKey, Play, PlayerShuffle, PlayerStatus } from '/@/shared/types/types';

const PLAYLIST_DETAIL_BG_FALLBACK = 'var(--theme-colors-foreground-muted)';
const PLAYLIST_DETAIL_TABLE_HEADER_HEIGHT = 40;
const PLAYLIST_DETAIL_TAIL_ROWS = 5;
const toGradientStop = (ratio: number) => `${ratio * 100}%`;

const PlaylistSongListFiltersSidebar = () => {
    const { t } = useTranslation();
    const { setIsSidebarOpen } = useListContext();
    const { clear } = usePlaylistSongListFilters();

    return (
        <Stack>
            <Group justify="space-between" pb={0} pl="md" pr="md" pt="md">
                <Text fw={500} size="xl">
                    {t('common.filters')}
                </Text>
                <Group gap="xs">
                    <Button onClick={clear} size="compact-sm" variant="subtle">
                        {t('common.reset')}
                    </Button>
                    {setIsSidebarOpen && (
                        <ActionIcon
                            icon="unpin"
                            onClick={() => setIsSidebarOpen(false)}
                            size="compact-sm"
                            variant="subtle"
                        />
                    )}
                </Group>
            </Group>
            <ClientSideSongFilters />
        </Stack>
    );
};

const PlaylistDetailSongListRoute = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { playlistId } = useParams() as { playlistId: string };
    const server = useCurrentServer();
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const heroRef = useRef<HTMLDivElement>(null);
    const { albumBackground, albumBackgroundBlur } = useAlbumBackground();
    const player = usePlayer();
    const playerShuffle = usePlayerShuffle();
    const playerStatus = usePlayerStatus();
    const queuePlaybackContext = useQueuePlaybackContext();
    const [playlistShuffleOnPlay, setPlaylistShuffleOnPlay] = useState(false);

    const detailQuery = useSuspenseQuery({
        ...playlistsQueries.detail({ query: { id: playlistId }, serverId: server?.id }),
    });
    const updatePlaylistMutation = useUpdatePlaylist({});

    const handleSave = (
        filter: Record<string, any>,
        extraFilters: {
            limit?: number;
            limitPercent?: number;
            sortBy?: string[];
            sortOrder?: string;
        },
    ) => {
        const sortValue =
            extraFilters.sortBy && extraFilters.sortBy.length > 0
                ? extraFilters.sortBy[0]
                : '+dateAdded';

        const rules = {
            ...filter,
            limit: extraFilters.limit ?? undefined,
            limitPercent: extraFilters.limitPercent ?? undefined,
            sort: sortValue,
        };

        updatePlaylistMutation.mutate(
            {
                apiClientProps: { serverId: detailQuery.data._serverId },
                body: {
                    comment: detailQuery.data.description || '',
                    name: detailQuery.data.name,
                    ownerId: detailQuery.data.ownerId || '',
                    public: detailQuery.data.public || false,
                    queryBuilderRules: rules,
                    sync: detailQuery.data.sync || false,
                },
                query: { id: playlistId },
            },
            {
                onSuccess: () => {
                    toast.success({ message: 'Playlist has been saved' });
                },
            },
        );
    };

    const handleSaveAs = (
        filter: Record<string, any>,
        extraFilters: {
            limit?: number;
            limitPercent?: number;
            sortBy?: string[];
            sortOrder?: string;
        },
    ) => {
        const sortValue =
            extraFilters.sortBy && extraFilters.sortBy.length > 0
                ? extraFilters.sortBy[0]
                : '+dateAdded';

        const rules = {
            ...filter,
            limit: extraFilters.limit ?? undefined,
            limitPercent: extraFilters.limitPercent ?? undefined,
            sort: sortValue,
        };

        openModal({
            children: (
                <SaveAsPlaylistForm
                    body={{
                        comment: detailQuery.data.description || '',
                        name: detailQuery.data.name,
                        ownerId: detailQuery.data.ownerId || '',
                        public: detailQuery.data.public || false,
                        queryBuilderRules: rules,
                        sync: detailQuery.data.sync || false,
                    }}
                    onCancel={closeAllModals}
                    onSuccess={(data) =>
                        navigate(
                            generatePath(AppRoute.PLAYLISTS_DETAIL_SONGS, {
                                playlistId: data?.id || '',
                            }),
                        )
                    }
                    serverId={detailQuery.data._serverId || ''}
                />
            ),
            title: t('common.saveAs'),
        });
    };

    const isSmartPlaylist = Boolean(
        detailQuery.data.rules && server?.type === ServerType.NAVIDROME,
    );

    const [queryBuilderPlaylistId, setQueryBuilderPlaylistId] = useState<string>();
    const showQueryBuilder = queryBuilderPlaylistId === playlistId;
    const [isQueryBuilderExpanded, setIsQueryBuilderExpanded] = useState(true);
    const queryBuilderRef = useRef<PlaylistQueryBuilderRef>(null);

    const handleToggleExpand = () => {
        setIsQueryBuilderExpanded((prev) => !prev);
    };

    const handleToggleShowQueryBuilder = () => {
        if (!isSmartPlaylist) return;
        setQueryBuilderPlaylistId(showQueryBuilder ? undefined : playlistId);
    };

    const displayMode: LibraryItem.SONG = LibraryItem.SONG;
    const listKey = ItemListKey.PLAYLIST_SONG;
    const tableConfig = useSettingsStore((state) => state.lists[listKey]?.table);

    const [itemCount, setItemCount] = useState<number | undefined>(undefined);
    const [listData, setListData] = useState<unknown[]>([]);
    const [mode, setMode] = useState<'edit' | 'view'>('view');
    const [isSidebarOpen, setIsSidebarOpen] = usePageSidebar(listKey);

    const isPlaylistPlaybackLinked =
        queuePlaybackContext?.source === 'playlistDetail' &&
        queuePlaybackContext.playlistId === playlistId &&
        queuePlaybackContext.serverId === detailQuery.data._serverId;
    const shuffleActive = isPlaylistPlaybackLinked
        ? playerShuffle === PlayerShuffle.TRACK
        : playlistShuffleOnPlay;
    const isPlaylistPlaying = isPlaylistPlaybackLinked && playerStatus === PlayerStatus.PLAYING;
    const shuffleActiveRef = useRef(shuffleActive);
    shuffleActiveRef.current = shuffleActive;

    useEffect(() => {
        setPlaylistShuffleOnPlay(false);
    }, [playlistId]);

    useEffect(() => {
        setQueryBuilderPlaylistId(undefined);
        setIsQueryBuilderExpanded(true);
    }, [playlistId]);

    useEffect(() => {
        if (isPlaylistPlaybackLinked) {
            setPlaylistShuffleOnPlay(playerShuffle === PlayerShuffle.TRACK);
        }
    }, [isPlaylistPlaybackLinked, playerShuffle]);

    const playPlaylist = useCallback(
        (songs: Song[], selectedSong?: Song) => {
            player.addToQueueByData(songs, Play.NOW, selectedSong?.id, playlistId, {
                playlistDetail: {
                    playItemId: selectedSong?.playlistItemId,
                    playlistId,
                    serverId: detailQuery.data._serverId,
                    shuffle: shuffleActiveRef.current,
                },
            });
        },
        [detailQuery.data._serverId, player, playlistId],
    );
    const handlePlaylistPlay = useCallback(
        () => playPlaylist(listData as Song[]),
        [listData, playPlaylist],
    );
    const handlePlaylistPrimaryPlayback = useCallback(() => {
        if (isPlaylistPlaybackLinked && playerStatus === PlayerStatus.PLAYING) {
            player.mediaPause();
            return;
        }

        if (isPlaylistPlaybackLinked && playerStatus === PlayerStatus.PAUSED) {
            player.mediaPlay();
            return;
        }

        handlePlaylistPlay();
    }, [handlePlaylistPlay, isPlaylistPlaybackLinked, player, playerStatus]);

    const togglePlaylistShuffle = useCallback(() => {
        if (isPlaylistPlaybackLinked) {
            player.toggleShuffle();
            return;
        }

        setPlaylistShuffleOnPlay((value) => !value);
    }, [isPlaylistPlaybackLinked, player]);

    const imageUrl =
        useItemImageUrl({
            id: detailQuery.data.imageId || undefined,
            itemType: LibraryItem.PLAYLIST,
            type: 'itemCard',
        }) || '';
    const { background: backgroundColor } = useFastAverageColor({
        default: PLAYLIST_DETAIL_BG_FALLBACK,
        id: playlistId,
        src: imageUrl,
        srcLoaded: true,
    });
    const seedSelection = useAlbumDetailSeed({ dominant: backgroundColor, src: imageUrl });
    const background =
        seedSelection?.selected.rgb ?? backgroundColor ?? PLAYLIST_DETAIL_BG_FALLBACK;
    const palette = useMemo(() => createAlbumDetailPalette(background), [background]);
    const playlistHeaderHeight = useHeaderHeight(headerRef);
    const heroHeight = useHeaderHeight(heroRef);
    const continuationHeight = Math.max(
        playlistHeaderHeight -
            heroHeight +
            (tableConfig?.enableHeader ? PLAYLIST_DETAIL_TABLE_HEADER_HEIGHT : 0),
        0,
    );
    const rowHeight =
        tableConfig?.size === 'compact'
            ? TableItemSize.COMPACT
            : tableConfig?.size === 'medium'
              ? TableItemSize.MEDIUM
              : tableConfig?.size === 'large'
                ? TableItemSize.LARGE
                : TableItemSize.DEFAULT;
    const tailHeight = rowHeight * PLAYLIST_DETAIL_TAIL_ROWS;
    const gradientHeight = continuationHeight + tailHeight;
    const primaryRatio = gradientHeight > 0 ? continuationHeight / gradientHeight : 0;
    const gradientStops = {
        fade4: toGradientStop(primaryRatio * 0.978),
        fade8: toGradientStop(primaryRatio * 0.955),
        fade14: toGradientStop(primaryRatio * 0.92),
        fade21: toGradientStop(primaryRatio * 0.88),
        fade30: toGradientStop(primaryRatio * 0.82),
        fade40: toGradientStop(primaryRatio * 0.75),
        fade52: toGradientStop(primaryRatio * 0.67),
        fade64: toGradientStop(primaryRatio * 0.58),
        fade76: toGradientStop(primaryRatio * 0.47),
        faint: toGradientStop(primaryRatio * 0.34),
        mid: toGradientStop(primaryRatio * 0.18),
        transparent: toGradientStop(primaryRatio),
    };

    const providerValue = useMemo(() => {
        return {
            customFilters: undefined,
            displayMode,
            id: playlistId,
            isSidebarOpen,
            isSmartPlaylist,
            itemCount,
            listData,
            listKey,
            mode,
            pageKey: listKey,
            playlistPlayback: {
                play: playPlaylist,
            },
            setIsSidebarOpen,
            setItemCount,
            setListData,
            setMode,
        };
    }, [
        playlistId,
        isSmartPlaylist,
        displayMode,
        listKey,
        isSidebarOpen,
        itemCount,
        listData,
        mode,
        playPlaylist,
        setIsSidebarOpen,
    ]);

    return (
        <AnimatedPage key={`playlist-detail-songList-${playlistId}`}>
            <ListContext.Provider value={providerValue}>
                <NativeScrollArea
                    pageHeaderProps={{
                        backgroundColor: background,
                        children: (
                            <LibraryHeaderBar>
                                <LibraryHeaderBar.PlayButton
                                    isPlaying={isPlaylistPlaying}
                                    itemType={LibraryItem.PLAYLIST}
                                    neutralGlass
                                    onPlay={handlePlaylistPrimaryPlayback}
                                    variant="default"
                                />
                                <LibraryHeaderBar.Title>
                                    {detailQuery.data.name}
                                </LibraryHeaderBar.Title>
                                {isSmartPlaylist && (
                                    <LibraryHeaderBar.Badge
                                        className={styles.stickySmartPlaylistBadge}
                                    >
                                        {t('entity.smartPlaylist')}
                                    </LibraryHeaderBar.Badge>
                                )}
                            </LibraryHeaderBar>
                        ),
                        offset: 200,
                        target: headerRef,
                    }}
                    ref={scrollAreaRef}
                >
                    <div
                        className={styles.routeSurface}
                        style={
                            {
                                '--playlist-color-base': palette.base,
                                '--playlist-color-continuation-fade-4': palette.continuationFade4,
                                '--playlist-color-continuation-fade-8': palette.continuationFade8,
                                '--playlist-color-continuation-fade-14': palette.continuationFade14,
                                '--playlist-color-continuation-fade-21': palette.continuationFade21,
                                '--playlist-color-continuation-fade-30': palette.continuationFade30,
                                '--playlist-color-continuation-fade-40': palette.continuationFade40,
                                '--playlist-color-continuation-fade-52': palette.continuationFade52,
                                '--playlist-color-continuation-fade-64': palette.continuationFade64,
                                '--playlist-color-continuation-fade-76': palette.continuationFade76,
                                '--playlist-color-continuation-faint':
                                    palette.continuationFaintFade,
                                '--playlist-color-continuation-mid': palette.continuationMidFade,
                                '--playlist-color-continuation-start':
                                    palette.continuationStart.css,
                                '--playlist-color-hero-bottom': palette.heroBottom.css,
                                '--playlist-color-hero-mid': palette.heroMid.css,
                                '--playlist-color-hero-top': palette.heroTop.css,
                                '--playlist-gradient-fade-4-stop': gradientStops.fade4,
                                '--playlist-gradient-fade-8-stop': gradientStops.fade8,
                                '--playlist-gradient-fade-14-stop': gradientStops.fade14,
                                '--playlist-gradient-fade-21-stop': gradientStops.fade21,
                                '--playlist-gradient-fade-30-stop': gradientStops.fade30,
                                '--playlist-gradient-fade-40-stop': gradientStops.fade40,
                                '--playlist-gradient-fade-52-stop': gradientStops.fade52,
                                '--playlist-gradient-fade-64-stop': gradientStops.fade64,
                                '--playlist-gradient-fade-76-stop': gradientStops.fade76,
                                '--playlist-gradient-faint-stop': gradientStops.faint,
                                '--playlist-gradient-mid-stop': gradientStops.mid,
                                '--playlist-gradient-transparent-stop': gradientStops.transparent,
                            } as CSSProperties
                        }
                    >
                        {albumBackground && imageUrl ? (
                            <LibraryBackgroundImage
                                blur={albumBackgroundBlur}
                                headerRef={heroRef}
                                imageUrl={imageUrl}
                            />
                        ) : (
                            <div
                                className={styles.heroBackground}
                                style={{
                                    height: heroHeight > 0 ? `${heroHeight}px` : '0px',
                                    visibility: heroHeight > 0 ? 'visible' : 'hidden',
                                }}
                            />
                        )}
                        <div
                            className={styles.backgroundContinuation}
                            style={{
                                height: `${gradientHeight}px`,
                                top: heroHeight > 0 ? `${heroHeight}px` : '0px',
                                visibility:
                                    heroHeight > 0 && playlistHeaderHeight > 0
                                        ? 'visible'
                                        : 'hidden',
                            }}
                        />
                        <div className={styles.foreground}>
                            <LibraryContainer>
                                <PlaylistDetailSongListHeader
                                    data={detailQuery.data}
                                    heroRef={heroRef}
                                    imageUrl={imageUrl}
                                    isPlaying={isPlaylistPlaying}
                                    isQueryBuilderVisible={showQueryBuilder}
                                    isSmartPlaylist={isSmartPlaylist}
                                    onPlay={handlePlaylistPrimaryPlayback}
                                    onShuffle={togglePlaylistShuffle}
                                    onToggleQueryBuilder={handleToggleShowQueryBuilder}
                                    ref={headerRef}
                                    shuffleActive={shuffleActive}
                                />
                                {isSmartPlaylist && (
                                    <div
                                        aria-hidden={!showQueryBuilder}
                                        className={styles.queryEditorSection}
                                        data-hidden={!showQueryBuilder || undefined}
                                    >
                                        <PlaylistQueryEditor
                                            detailQuery={detailQuery}
                                            handleSave={handleSave}
                                            handleSaveAs={handleSaveAs}
                                            isQueryBuilderExpanded={isQueryBuilderExpanded}
                                            key={playlistId}
                                            onToggleExpand={handleToggleExpand}
                                            playlistId={playlistId}
                                            queryBuilderRef={queryBuilderRef}
                                            updatePlaylistMutation={updatePlaylistMutation}
                                        />
                                    </div>
                                )}
                                <div className={styles.listContent}>
                                    <ListWithSidebarContainer pageScroll>
                                        <ListWithSidebarContainer.SidebarPortal>
                                            <Suspense fallback={<Spinner container />}>
                                                <PlaylistSongListFiltersSidebar />
                                            </Suspense>
                                        </ListWithSidebarContainer.SidebarPortal>
                                        <Suspense fallback={<Spinner container />}>
                                            <PlaylistDetailSongListContent pageScroll />
                                        </Suspense>
                                    </ListWithSidebarContainer>
                                </div>
                            </LibraryContainer>
                        </div>
                    </div>
                </NativeScrollArea>
            </ListContext.Provider>
        </AnimatedPage>
    );
};

const PlaylistDetailSongListRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <PlaylistDetailSongListRoute />
        </PageErrorBoundary>
    );
};

export default PlaylistDetailSongListRouteWithBoundary;
