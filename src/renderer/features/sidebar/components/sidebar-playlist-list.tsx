import { openContextModal } from '@mantine/modals';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { motion } from 'motion/react';
import { createContext, memo, MouseEvent, useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, Link, useNavigate, useParams } from 'react-router';

import styles from './sidebar-playlist-list.module.css';

import { useItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { playlistsQueries } from '/@/renderer/features/playlists/api/playlists-api';
import { openCreatePlaylistModal } from '/@/renderer/features/playlists/components/create-playlist-form';
import { useIsMutatingSidebarPlaylistFolderMove } from '/@/renderer/features/playlists/mutations/sidebar-playlist-folder-move-mutation';
import {
    type PlaylistLastPlayedMap,
    type SidebarPlaylistSortMode,
    sortPlaylistsByLastPlayed,
} from '/@/renderer/features/playlists/utils/playlist-sidebar-organization';
import { ItemRowPlayControls } from '/@/renderer/features/shared/components/item-row-play-controls';
import {
    collectFolderPaths,
    getPlaylistLeafName,
    PlaylistFolderDragExpandProvider,
    PlaylistFolderViews,
    PlaylistRootAccordionControl,
    usePlaylistFolderState,
    usePlaylistFolderViewState,
    usePlaylistNavigationState,
} from '/@/renderer/features/sidebar/components/playlist-folder-tree';
import { useDragDrop } from '/@/renderer/hooks/use-drag-drop';
import { useDragMonitor } from '/@/renderer/hooks/use-drag-monitor';
import { AppRoute } from '/@/renderer/router/routes';
import {
    useCurrentPlaylistContextId,
    useCurrentServer,
    useCurrentServerId,
    usePermissions,
    useSidebarPlaylistFolderSeparator,
    useSidebarPlaylistListFilterRegex,
    useSidebarPlaylistMode,
    useSidebarPlaylistSorting,
} from '/@/renderer/store';
import { formatDurationString } from '/@/renderer/utils';
import { Accordion } from '/@/shared/components/accordion/accordion';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { animationProps } from '/@/shared/components/animations/animation-props';
import { animationVariants } from '/@/shared/components/animations/animation-variants';
import { ButtonProps } from '/@/shared/components/button/button';
import { DropdownMenu } from '/@/shared/components/dropdown-menu/dropdown-menu';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Image } from '/@/shared/components/image/image';
import { LoadingOverlay } from '/@/shared/components/loading-overlay/loading-overlay';
import { Text } from '/@/shared/components/text/text';
import { useLocalStorage } from '/@/shared/hooks/use-local-storage';
import {
    LibraryItem,
    Playlist,
    PlaylistListSort,
    Song,
    SortOrder,
} from '/@/shared/types/domain-types';
import { DragData, DragOperation, DragTarget } from '/@/shared/types/drag-and-drop';
import { Play } from '/@/shared/types/types';

const MotionLink = motion.create(Link);

const playlistRowDimVariants = animationVariants.combine(animationVariants.fadeIn, {
    hidden: { opacity: 0.5 },
});

const getPlaylistOrderKey = (serverId: string | undefined, scope: 'owned' | 'shared') => {
    const sid = serverId || 'local';
    return `playlist_order:${sid}:${scope}`;
};

const getPinnedPlaylistOrderKey = (serverId: string | undefined, scope: 'owned' | 'shared') => {
    const sid = serverId || 'local';
    return `pinned_playlist_order:${sid}:${scope}`;
};

const getHiddenPlaylistIdsKey = (serverId: string | undefined, scope: 'owned' | 'shared') => {
    const sid = serverId || 'local';
    return `hidden_playlist_ids:${sid}:${scope}`;
};

const splitPinnedPlaylists = (items: Playlist[], pinnedIds: string[]) => {
    const pinnedIdSet = new Set(pinnedIds);
    const itemById = new Map(items.map((item) => [item.id, item]));
    const pinned = pinnedIds
        .map((id) => itemById.get(id))
        .filter((item): item is Playlist => item !== undefined);
    const unpinned = items.filter((item) => !pinnedIdSet.has(item.id));

    return { pinned, unpinned };
};

const reorderPlaylistIds = (
    currentIds: string[],
    sourceIds: string[],
    targetId: string,
    edge: 'bottom' | 'top',
) => {
    const targetIndex = currentIds.indexOf(targetId);
    if (targetIndex === -1) return currentIds;

    const idsWithoutSources = currentIds.filter((id) => !sourceIds.includes(id));
    const sourcesBeforeTarget = sourceIds.filter((id) => {
        const sourceIndex = currentIds.indexOf(id);
        return sourceIndex !== -1 && sourceIndex < targetIndex;
    }).length;
    const insertIndexInFiltered =
        edge === 'top' ? targetIndex - sourcesBeforeTarget : targetIndex - sourcesBeforeTarget + 1;
    const insertIndex = Math.max(0, Math.min(insertIndexInFiltered, idsWithoutSources.length));

    return [
        ...idsWithoutSources.slice(0, insertIndex),
        ...sourceIds,
        ...idsWithoutSources.slice(insertIndex),
    ];
};

export const SidebarPlaylistAddDragContext = createContext(false);

interface SidebarPlaylistHiddenContextValue {
    hiddenPlaylistIds: Set<string>;
    onUnhide: (playlistId: string) => void;
}

const SidebarPlaylistHiddenContext = createContext<SidebarPlaylistHiddenContextValue>({
    hiddenPlaylistIds: new Set(),
    onUnhide: () => undefined,
});

const SidebarPlaylistSortContext = createContext<SidebarPlaylistSortMode>('default');

const isAddToPlaylistDragSource = (source: DragData) => {
    return (
        source.itemType !== undefined &&
        source.type !== DragTarget.PLAYLIST &&
        (source.operation?.includes(DragOperation.ADD) ?? false)
    );
};

export const useSidebarPlaylistAddDragMonitor = () => {
    const [isAddDragActive, setIsAddDragActive] = useState(false);

    const handleAddDragStart = useCallback(() => {
        setIsAddDragActive(true);
    }, []);

    const handleAddDragDrop = useCallback(() => {
        setIsAddDragActive(false);
    }, []);

    useDragMonitor({
        canMonitor: isAddToPlaylistDragSource,
        onDragStart: handleAddDragStart,
        onDrop: handleAddDragDrop,
    });

    return isAddDragActive;
};

export interface PlaylistRowButtonProps extends Omit<ButtonProps, 'onContextMenu' | 'onPlay'> {
    isPinned?: boolean;
    item: Playlist;
    name: string;
    onContextMenu: (e: MouseEvent<HTMLAnchorElement>, item: Playlist) => void;
    onReorder?: (sourceIds: string[], targetId: string, edge: 'bottom' | 'top' | null) => void;
    to: string;
}

export const PlaylistRowButton = memo(
    ({ isPinned = false, item, name, onContextMenu, onReorder, to }: PlaylistRowButtonProps) => {
        const url = {
            pathname: generatePath(AppRoute.PLAYLISTS_DETAIL_SONGS, { playlistId: to }),
            state: { item },
        };
        const { t } = useTranslation();
        const navigate = useNavigate();
        const sidebarPlaylistSorting = useSidebarPlaylistSorting();
        const sidebarPlaylistMode = useSidebarPlaylistMode();
        const isCompact = sidebarPlaylistMode === 'compact';
        const playingPlaylistId = useCurrentPlaylistContextId();
        const { playlistId: openPlaylistId } = useParams();
        const isPlaying = playingPlaylistId === item.id;
        const isOpen = openPlaylistId === item.id;

        const [isHovered, setIsHovered] = useState(false);
        const isSmartPlaylist = Boolean(item.rules);
        const isAddDragActive = useContext(SidebarPlaylistAddDragContext);
        const { hiddenPlaylistIds, onUnhide } = useContext(SidebarPlaylistHiddenContext);
        const sortMode = useContext(SidebarPlaylistSortContext);
        const isHidden = hiddenPlaylistIds.has(item.id);

        const { isDraggedOver, isDragging, ref } = useDragDrop<HTMLAnchorElement>({
            drag: {
                getId: () => {
                    return item && item.id ? [item.id] : [];
                },
                getItem: () => {
                    return item ? [item] : [];
                },
                itemType: LibraryItem.PLAYLIST,
                metadata: { isPinned },
                operation: [DragOperation.ADD, DragOperation.REORDER],
                target: DragTarget.PLAYLIST,
            },
            drop: {
                canDrop: (args) => {
                    // Allow dropping items into a playlist (ADD)
                    const canAdd =
                        !isSmartPlaylist &&
                        args.source.itemType !== undefined &&
                        args.source.type !== DragTarget.PLAYLIST &&
                        (args.source.operation?.includes(DragOperation.ADD) ?? false);

                    // Allow reordering playlists when source is playlist and operation includes REORDER
                    // do not allow cross-scope reorders
                    const canReorder =
                        args.source.itemType === LibraryItem.PLAYLIST &&
                        args.source.type === DragTarget.PLAYLIST &&
                        (args.source.operation?.includes(DragOperation.REORDER) ?? false);
                    const sourceIsPinned = Boolean(args.source.metadata?.isPinned);
                    const canReorderWithinGroup =
                        canReorder &&
                        sourceIsPinned === isPinned &&
                        (isPinned || (sidebarPlaylistSorting && sortMode === 'default'));
                    return canAdd || canReorderWithinGroup;
                },
                getData: () => {
                    return {
                        id: [to],
                        item: [],
                        itemType: LibraryItem.PLAYLIST,
                        type: DragTarget.PLAYLIST,
                    };
                },
                onDrag: () => {
                    return;
                },
                onDragLeave: () => {
                    return;
                },
                onDrop: (args) => {
                    const sourceItemType = args.source.itemType as LibraryItem;
                    const sourceIds = args.source.id;

                    // Handle playlist reordering locally
                    if (
                        sourceItemType === LibraryItem.PLAYLIST &&
                        (args.source.operation?.includes(DragOperation.REORDER) ?? false) &&
                        args.edge &&
                        (args.edge === 'top' || args.edge === 'bottom') &&
                        onReorder
                    ) {
                        const sourceIsPinned = Boolean(args.source.metadata?.isPinned);
                        if (
                            sourceIsPinned !== isPinned ||
                            (!isPinned && (!sidebarPlaylistSorting || sortMode !== 'default'))
                        ) {
                            return;
                        }

                        const sourceItems = Array.isArray(args.source.item)
                            ? (args.source.item as Playlist[])
                            : undefined;

                        // Prevent cross-scope reorders (owned <-> shared)
                        if (!isPinned && sourceItems && sourceItems.length > 0) {
                            if (sourceItems.some((si) => si.ownerId !== item.ownerId)) {
                                return;
                            }
                        }

                        onReorder(sourceIds, to, args.edge);
                        return;
                    }

                    if (isSmartPlaylist) {
                        return;
                    }

                    const modalProps: {
                        albumId?: string[];
                        artistId?: string[];
                        folderId?: string[];
                        genreId?: string[];
                        initialSelectedIds?: string[];
                        playlistId?: string[];
                        songId?: string[];
                    } = {
                        initialSelectedIds: [to],
                    };

                    switch (sourceItemType) {
                        case LibraryItem.ALBUM:
                            modalProps.albumId = sourceIds;
                            break;
                        case LibraryItem.ALBUM_ARTIST:
                        case LibraryItem.ARTIST:
                            modalProps.artistId = sourceIds;
                            break;
                        case LibraryItem.FOLDER:
                            modalProps.folderId = sourceIds;
                            break;
                        case LibraryItem.GENRE:
                            modalProps.genreId = sourceIds;
                            break;
                        case LibraryItem.PLAYLIST:
                            modalProps.playlistId = sourceIds;
                            break;
                        case LibraryItem.PLAYLIST_SONG:
                        case LibraryItem.QUEUE_SONG:
                        case LibraryItem.SONG:
                            if (args.source.item && Array.isArray(args.source.item)) {
                                const songs = args.source.item as Song[];
                                modalProps.songId = songs.map((song) => song.id);
                            } else {
                                modalProps.songId = sourceIds;
                            }
                            break;
                        default:
                            return;
                    }

                    openContextModal({
                        innerProps: modalProps,
                        modal: 'addToPlaylist',
                        size: 'lg',
                        title: t('form.addToPlaylist.title'),
                    });
                },
            },
            isEnabled: true,
        });

        const player = usePlayer();
        const serverId = useCurrentServerId();

        const permissions = usePermissions();

        const handlePlay = useCallback(
            (id: string, type: Play) => {
                player.addToQueueByFetch(serverId, [id], LibraryItem.PLAYLIST, type);
            },
            [player, serverId],
        );

        const imageUrl = useItemImageUrl({
            id: item.imageId || undefined,
            itemType: LibraryItem.PLAYLIST,
            type: 'table',
        });

        const isDimmed = isHidden || isDragging || (isSmartPlaylist && isAddDragActive);

        return (
            <MotionLink
                {...animationProps.fadeIn}
                animate={isDimmed ? 'hidden' : 'show'}
                className={clsx(styles.row, {
                    [styles.rowCompact]: isCompact,
                    [styles.rowDraggedOver]: isDraggedOver && !isSmartPlaylist,
                    [styles.rowHover]: isHovered,
                    [styles.rowOpen]: isOpen,
                })}
                initial={false}
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                    if (e.button === 0 && e.altKey && isHidden && !isDragging) {
                        e.preventDefault();
                        onUnhide(item.id);
                        navigate(url.pathname, { state: url.state });
                    }
                }}
                onContextMenu={(e: MouseEvent<HTMLAnchorElement>) => {
                    e.preventDefault();
                    onContextMenu(e, item);
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                ref={ref}
                to={url}
                variants={playlistRowDimVariants}
            >
                {isCompact ? (
                    <>
                        <div className={clsx(styles.nameGroup, styles.nameGroupCompact)}>
                            {isPinned && (
                                <Icon
                                    className={styles.pinIndicator}
                                    color="primary"
                                    icon="pin"
                                    size="xs"
                                />
                            )}
                            <Text
                                className={clsx(styles.compactName, {
                                    [styles.nameActive]: isPlaying,
                                })}
                                fw={500}
                                size="md"
                            >
                                {name}
                            </Text>
                        </div>
                        {isHovered && (
                            <ItemRowPlayControls
                                className={clsx(styles.controls, styles.controlsCompact)}
                                onPlay={(playType) => handlePlay(to, playType)}
                            />
                        )}
                    </>
                ) : (
                    <>
                        <div className={styles.rowGroup}>
                            <Image containerClassName={styles.imageContainer} src={imageUrl} />
                            <div className={styles.metadata}>
                                <div className={styles.nameGroup}>
                                    {isPinned && (
                                        <Icon
                                            className={styles.pinIndicator}
                                            color="primary"
                                            icon="pin"
                                            size="xs"
                                        />
                                    )}
                                    <Text
                                        className={clsx(styles.name, {
                                            [styles.nameActive]: isPlaying,
                                        })}
                                        fw={500}
                                        size="md"
                                    >
                                        {name}
                                    </Text>
                                </div>
                                <div className={styles.metadataGroup}>
                                    <div
                                        className={clsx(
                                            styles.metadataGroupItem,
                                            styles.metadataGroupItemNoShrink,
                                        )}
                                    >
                                        <Icon color="muted" icon="itemSong" size="sm" />
                                        <Text isMuted size="sm">
                                            {item.songCount || 0}
                                        </Text>
                                    </div>
                                    <div className={styles.metadataGroupItem}>
                                        <Icon color="muted" icon="duration" size="sm" />
                                        <Text isMuted size="sm">
                                            {formatDurationString(item.duration ?? 0)}
                                        </Text>
                                    </div>
                                    {item.ownerId === permissions.userId &&
                                        Boolean(item.public) && (
                                            <div className={styles.metadataGroupItem}>
                                                <Text isMuted size="sm">
                                                    {t('common.public')}
                                                </Text>
                                            </div>
                                        )}
                                    {item.ownerId !== permissions.userId && (
                                        <div className={styles.metadataGroupItem}>
                                            <Icon color="muted" icon="user" size="sm" />
                                            <Text isMuted size="sm">
                                                {item.owner}
                                            </Text>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {isHovered && (
                            <ItemRowPlayControls
                                className={styles.controls}
                                onPlay={(playType) => handlePlay(to, playType)}
                            />
                        )}
                    </>
                )}
            </MotionLink>
        );
    },
);

interface SidebarPlaylistListProps {
    enableHiddenPlaylists?: boolean;
    lastPlayed?: PlaylistLastPlayedMap;
    onSortModeChange?: (sortMode: SidebarPlaylistSortMode) => void;
    revealHiddenPlaylists?: boolean;
    sortMode?: SidebarPlaylistSortMode;
}

export const SidebarPlaylistList = ({
    enableHiddenPlaylists = false,
    lastPlayed = {},
    onSortModeChange,
    revealHiddenPlaylists = false,
    sortMode = 'default',
}: SidebarPlaylistListProps = {}) => {
    const player = usePlayer();
    const { t } = useTranslation();
    const server = useCurrentServer();
    const sidebarPlaylistSorting = useSidebarPlaylistSorting();
    const folderSeparator = useSidebarPlaylistFolderSeparator();
    const filterRegex = useSidebarPlaylistListFilterRegex();

    const playlistsQuery = useQuery(
        playlistsQueries.list({
            query: {
                sortBy: PlaylistListSort.NAME,
                sortOrder: SortOrder.ASC,
                startIndex: 0,
            },
            serverId: server?.id,
        }),
    );

    const handlePlayPlaylist = useCallback(
        (id: string, playType: Play) => {
            player.addToQueueByFetch(server.id, [id], LibraryItem.PLAYLIST, playType);
        },
        [player, server.id],
    );

    const [pinnedPlaylistIds, setPinnedPlaylistIds] = useLocalStorage<string[]>({
        defaultValue: [],
        key: getPinnedPlaylistOrderKey(server.id, 'owned'),
    });
    const [hiddenPlaylistIds, setHiddenPlaylistIds] = useLocalStorage<string[]>({
        defaultValue: [],
        key: getHiddenPlaylistIdsKey(server.id, 'owned'),
    });
    const hiddenPlaylistIdSet = useMemo(
        () => new Set(enableHiddenPlaylists ? hiddenPlaylistIds : []),
        [enableHiddenPlaylists, hiddenPlaylistIds],
    );
    const handleUnhidePlaylist = useCallback(
        (playlistId: string) => {
            setHiddenPlaylistIds((current) => current.filter((id) => id !== playlistId));
        },
        [setHiddenPlaylistIds],
    );

    const handleContextMenu = useCallback(
        (e: MouseEvent<HTMLAnchorElement>, playlist: Playlist) => {
            e.preventDefault();
            e.stopPropagation();
            const isPinned = pinnedPlaylistIds.includes(playlist.id);
            const isHidden = hiddenPlaylistIdSet.has(playlist.id);
            ContextMenuController.call({
                cmd: {
                    items: [playlist],
                    sidebarHidden: enableHiddenPlaylists
                        ? {
                              isHidden,
                              onToggle: () => {
                                  setHiddenPlaylistIds((current) =>
                                      current.includes(playlist.id)
                                          ? current.filter((id) => id !== playlist.id)
                                          : [...current, playlist.id],
                                  );
                              },
                          }
                        : undefined,
                    sidebarPin: {
                        isPinned,
                        onToggle: () => {
                            setPinnedPlaylistIds((current) =>
                                current.includes(playlist.id)
                                    ? current.filter((id) => id !== playlist.id)
                                    : [...current, playlist.id],
                            );
                        },
                    },
                    type: LibraryItem.PLAYLIST,
                },
                event: e,
            });
        },
        [
            enableHiddenPlaylists,
            hiddenPlaylistIdSet,
            pinnedPlaylistIds,
            setHiddenPlaylistIds,
            setPinnedPlaylistIds,
        ],
    );

    const [playlistOrder, setPlaylistOrder] = useLocalStorage<string[]>({
        defaultValue: [],
        key: getPlaylistOrderKey(server.id, 'owned'),
    });

    const playlistItems = useMemo(() => {
        const base = { handlePlay: handlePlayPlaylist };

        if (!server?.type || !server?.username || !playlistsQuery.data?.items) {
            return { ...base, items: playlistsQuery.data?.items };
        }

        let regex: null | RegExp = null;
        if (filterRegex) {
            try {
                regex = new RegExp(filterRegex, 'i');
            } catch {
                // Invalid regex, ignore filtering
            }
        }

        const ownedPlaylistItems: Array<Playlist> = [];

        for (const playlist of playlistsQuery.data?.items ?? []) {
            if (!playlist.owner || playlist.owner === server.username) {
                // Filter out playlists that match the regex
                if (regex && regex.test(playlist.name)) {
                    continue;
                }
                ownedPlaylistItems.push(playlist);
            }
        }

        if (!ownedPlaylistItems || !sidebarPlaylistSorting || !playlistOrder) {
            return { ...base, items: ownedPlaylistItems };
        }

        // Apply saved order, include only playlists that still exist
        const idMap = new Map(ownedPlaylistItems.map((it) => [it.id, it]));
        const ordered = playlistOrder
            .map((id) => idMap.get(id))
            .filter((it): it is Playlist => it !== undefined);

        // Append any new items that weren't in saved order
        const remaining = ownedPlaylistItems.filter((it) => !playlistOrder.includes(it.id));
        const newPlaylistItems = [...ordered, ...remaining];
        return { ...base, items: newPlaylistItems };
    }, [
        handlePlayPlaylist,
        playlistsQuery.data?.items,
        server.type,
        server.username,
        sidebarPlaylistSorting,
        playlistOrder,
        filterRegex,
    ]);

    const { pinned: allPinnedPlaylistItems, unpinned: allUnpinnedPlaylistItems } = useMemo(
        () => splitPinnedPlaylists(playlistItems.items ?? [], pinnedPlaylistIds),
        [pinnedPlaylistIds, playlistItems.items],
    );
    const sortedUnpinnedPlaylistItems = useMemo(
        () =>
            sortMode === 'recentlyPlayed'
                ? sortPlaylistsByLastPlayed(allUnpinnedPlaylistItems, lastPlayed)
                : allUnpinnedPlaylistItems,
        [allUnpinnedPlaylistItems, lastPlayed, sortMode],
    );
    const pinnedPlaylistItems = useMemo(
        () =>
            allPinnedPlaylistItems.filter(
                (playlist) => revealHiddenPlaylists || !hiddenPlaylistIdSet.has(playlist.id),
            ),
        [allPinnedPlaylistItems, hiddenPlaylistIdSet, revealHiddenPlaylists],
    );
    const unpinnedPlaylistItems = useMemo(
        () =>
            sortedUnpinnedPlaylistItems.filter(
                (playlist) => revealHiddenPlaylists || !hiddenPlaylistIdSet.has(playlist.id),
            ),
        [hiddenPlaylistIdSet, revealHiddenPlaylists, sortedUnpinnedPlaylistItems],
    );
    const pinnedPlaylistIdSet = useMemo(() => new Set(pinnedPlaylistIds), [pinnedPlaylistIds]);
    const hiddenContextValue = useMemo(
        () => ({ hiddenPlaylistIds: hiddenPlaylistIdSet, onUnhide: handleUnhidePlaylist }),
        [handleUnhidePlaylist, hiddenPlaylistIdSet],
    );

    const handleReorder = (
        sourceIds: string[],
        targetId: string,
        edge: 'bottom' | 'top' | null,
    ) => {
        if (!playlistItems?.items || !edge) return;

        const targetIsPinned = pinnedPlaylistIdSet.has(targetId);
        const sourceIsPinned = sourceIds.every((id) => pinnedPlaylistIdSet.has(id));
        const sourceIsUnpinned = sourceIds.every((id) => !pinnedPlaylistIdSet.has(id));
        if (targetIsPinned !== sourceIsPinned || (!targetIsPinned && !sourceIsUnpinned)) return;

        if (targetIsPinned) {
            setPinnedPlaylistIds((current) =>
                reorderPlaylistIds(current, sourceIds, targetId, edge),
            );
            return;
        }

        if (sortMode !== 'default') return;

        setPlaylistOrder(
            reorderPlaylistIds(
                playlistItems.items.map((playlist) => playlist.id),
                sourceIds,
                targetId,
                edge,
            ),
        );
    };

    const handleCreatePlaylistModal = (e: MouseEvent<HTMLButtonElement>) => {
        openCreatePlaylistModal(server, e);
    };

    const folderViewState = usePlaylistFolderViewState(unpinnedPlaylistItems);
    const { folderView, groups, tree } = folderViewState;
    const navigation = usePlaylistNavigationState();
    const inNavigation = folderView === 'navigation' && navigation.pathStack.length > 0;

    const folderPaths = useMemo(() => {
        if (folderView === 'single') {
            return groups.reduce<string[]>((acc, g) => {
                if (g.type === 'folder') acc.push(g.name);
                return acc;
            }, []);
        }
        return collectFolderPaths(tree);
    }, [folderView, groups, tree]);

    const { expandedSet, setMany, toggle } = usePlaylistFolderState('owned');
    const allExpanded =
        folderPaths.length > 0 && folderPaths.every((path) => expandedSet.has(path));

    const handleToggleAllFolders = useCallback(
        (e: MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            setMany(folderPaths, !allExpanded);
        },
        [setMany, folderPaths, allExpanded],
    );

    const handleNavigateUp = useCallback(
        (e: MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            navigation.goUp();
        },
        [navigation],
    );

    const showExpandAll = folderView !== 'navigation' && folderPaths.length > 0;
    const isFolderMovePending = useIsMutatingSidebarPlaylistFolderMove();

    return (
        <Accordion.Item value="playlists">
            <PlaylistRootAccordionControl allPlaylists={playlistItems?.items ?? []}>
                <Group gap="xs" justify="space-between" pr="var(--theme-spacing-md)" wrap="nowrap">
                    <Group gap="xs" style={{ minWidth: 0 }} wrap="nowrap">
                        {inNavigation && (
                            <ActionIcon
                                icon="arrowLeftS"
                                iconProps={{ size: 'lg' }}
                                onClick={handleNavigateUp}
                                size="xs"
                                tooltip={{ label: t('common.back') }}
                                variant="subtle"
                            />
                        )}
                        <Text className={styles.name} fw={500}>
                            {inNavigation ? navigation.currentName : t('page.sidebar.playlists')}
                        </Text>
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                        {onSortModeChange && (
                            <DropdownMenu position="bottom-end">
                                <DropdownMenu.Target>
                                    <ActionIcon
                                        icon="sort"
                                        iconProps={{ size: 'lg' }}
                                        onClick={(e) => e.stopPropagation()}
                                        size="xs"
                                        tooltip={{ label: t('action.sortPlaylists') }}
                                        variant="subtle"
                                    />
                                </DropdownMenu.Target>
                                <DropdownMenu.Dropdown onClick={(event) => event.stopPropagation()}>
                                    <DropdownMenu.Item
                                        isSelected={sortMode === 'default'}
                                        onClick={() => onSortModeChange?.('default')}
                                    >
                                        {t('filter.default')}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item
                                        isSelected={sortMode === 'recentlyPlayed'}
                                        onClick={() => onSortModeChange?.('recentlyPlayed')}
                                    >
                                        {t('filter.recentlyPlayed')}
                                    </DropdownMenu.Item>
                                </DropdownMenu.Dropdown>
                            </DropdownMenu>
                        )}
                        <ActionIcon
                            icon="add"
                            iconProps={{
                                size: 'lg',
                            }}
                            onClick={handleCreatePlaylistModal}
                            size="xs"
                            tooltip={{
                                label: t('action.createPlaylist'),
                            }}
                            variant="subtle"
                        />
                        {showExpandAll && (
                            <ActionIcon
                                icon={allExpanded ? 'collapseAll' : 'expandAll'}
                                iconProps={{
                                    size: 'lg',
                                }}
                                onClick={handleToggleAllFolders}
                                size="xs"
                                tooltip={{
                                    label: t(
                                        allExpanded
                                            ? 'action.collapseAllFolders'
                                            : 'action.expandAllFolders',
                                        {
                                            postProcess: 'sentenceCase',
                                        },
                                    ),
                                }}
                                variant="subtle"
                            />
                        )}
                        <ActionIcon
                            component={Link}
                            icon="list"
                            iconProps={{
                                size: 'lg',
                            }}
                            onClick={(e) => e.stopPropagation()}
                            size="xs"
                            to={AppRoute.PLAYLISTS}
                            tooltip={{
                                label: t('action.viewPlaylists'),
                            }}
                            variant="subtle"
                        />
                    </Group>
                </Group>
            </PlaylistRootAccordionControl>
            <Accordion.Panel className={styles.panel}>
                <LoadingOverlay pos="absolute" visible={isFolderMovePending} />
                <SidebarPlaylistHiddenContext.Provider value={hiddenContextValue}>
                    <SidebarPlaylistSortContext.Provider value={sortMode}>
                        <PlaylistFolderDragExpandProvider
                            expandedSet={expandedSet}
                            setMany={setMany}
                        >
                            {pinnedPlaylistItems.map((playlist) => (
                                <PlaylistRowButton
                                    isPinned
                                    item={playlist}
                                    key={playlist.id}
                                    name={
                                        folderViewState.foldersEnabled
                                            ? getPlaylistLeafName(playlist.name, folderSeparator)
                                            : playlist.name
                                    }
                                    onContextMenu={handleContextMenu}
                                    onReorder={handleReorder}
                                    to={playlist.id}
                                />
                            ))}
                            <PlaylistFolderViews
                                {...folderViewState}
                                allPlaylists={playlistItems?.items ?? []}
                                expandedSet={expandedSet}
                                navigation={navigation}
                                onContextMenu={handleContextMenu}
                                onReorder={handleReorder}
                                onToggleFolder={toggle}
                            />
                        </PlaylistFolderDragExpandProvider>
                    </SidebarPlaylistSortContext.Provider>
                </SidebarPlaylistHiddenContext.Provider>
            </Accordion.Panel>
        </Accordion.Item>
    );
};

export const SidebarSharedPlaylistList = ({
    enableHiddenPlaylists = false,
    lastPlayed = {},
    revealHiddenPlaylists = false,
    sortMode = 'default',
}: SidebarPlaylistListProps = {}) => {
    const player = usePlayer();
    const { t } = useTranslation();
    const server = useCurrentServer();
    const sidebarPlaylistSorting = useSidebarPlaylistSorting();
    const folderSeparator = useSidebarPlaylistFolderSeparator();
    const filterRegex = useSidebarPlaylistListFilterRegex();

    const playlistsQuery = useQuery(
        playlistsQueries.list({
            query: {
                sortBy: PlaylistListSort.NAME,
                sortOrder: SortOrder.ASC,
                startIndex: 0,
            },
            serverId: server?.id,
        }),
    );

    const handlePlayPlaylist = useCallback(
        (id: string, playType: Play) => {
            if (!server?.id) return;
            player.addToQueueByFetch(server.id, [id], LibraryItem.PLAYLIST, playType);
        },
        [player, server.id],
    );

    const [pinnedPlaylistIds, setPinnedPlaylistIds] = useLocalStorage<string[]>({
        defaultValue: [],
        key: getPinnedPlaylistOrderKey(server.id, 'shared'),
    });
    const [hiddenPlaylistIds, setHiddenPlaylistIds] = useLocalStorage<string[]>({
        defaultValue: [],
        key: getHiddenPlaylistIdsKey(server.id, 'shared'),
    });
    const hiddenPlaylistIdSet = useMemo(
        () => new Set(enableHiddenPlaylists ? hiddenPlaylistIds : []),
        [enableHiddenPlaylists, hiddenPlaylistIds],
    );
    const handleUnhidePlaylist = useCallback(
        (playlistId: string) => {
            setHiddenPlaylistIds((current) => current.filter((id) => id !== playlistId));
        },
        [setHiddenPlaylistIds],
    );

    const handleContextMenu = useCallback(
        (e: MouseEvent<HTMLAnchorElement>, playlist: Playlist) => {
            e.preventDefault();
            e.stopPropagation();
            const isPinned = pinnedPlaylistIds.includes(playlist.id);
            const isHidden = hiddenPlaylistIdSet.has(playlist.id);
            ContextMenuController.call({
                cmd: {
                    items: [playlist],
                    sidebarHidden: enableHiddenPlaylists
                        ? {
                              isHidden,
                              onToggle: () => {
                                  setHiddenPlaylistIds((current) =>
                                      current.includes(playlist.id)
                                          ? current.filter((id) => id !== playlist.id)
                                          : [...current, playlist.id],
                                  );
                              },
                          }
                        : undefined,
                    sidebarPin: {
                        isPinned,
                        onToggle: () => {
                            setPinnedPlaylistIds((current) =>
                                current.includes(playlist.id)
                                    ? current.filter((id) => id !== playlist.id)
                                    : [...current, playlist.id],
                            );
                        },
                    },
                    type: LibraryItem.PLAYLIST,
                },
                event: e,
            });
        },
        [
            enableHiddenPlaylists,
            hiddenPlaylistIdSet,
            pinnedPlaylistIds,
            setHiddenPlaylistIds,
            setPinnedPlaylistIds,
        ],
    );

    const [playlistOrder, setPlaylistOrder] = useLocalStorage<string[]>({
        defaultValue: [],
        key: getPlaylistOrderKey(server.id, 'shared'),
    });

    const playlistItems = useMemo(() => {
        const base = { handlePlay: handlePlayPlaylist };

        if (!server?.type || !server?.username || !playlistsQuery.data?.items) {
            return { ...base, items: playlistsQuery.data?.items };
        }

        let regex: null | RegExp = null;
        if (filterRegex) {
            try {
                regex = new RegExp(filterRegex, 'i');
            } catch {
                // Invalid regex, ignore filtering
            }
        }

        const sharedPlaylistItems: Array<Playlist> = [];

        for (const playlist of playlistsQuery.data?.items ?? []) {
            if (playlist.owner && playlist.owner !== server.username) {
                // Filter out playlists that match the regex
                if (regex && regex.test(playlist.name)) {
                    continue;
                }
                sharedPlaylistItems.push(playlist);
            }
        }

        if (!sharedPlaylistItems || !sidebarPlaylistSorting || !playlistOrder) {
            return { ...base, items: sharedPlaylistItems };
        }

        // Apply saved order, include only playlists that still exist
        const idMap = new Map(sharedPlaylistItems.map((it) => [it.id, it]));
        const ordered = playlistOrder
            .map((id) => idMap.get(id))
            .filter((it): it is Playlist => it !== undefined);

        // Append any new items that weren't in saved order
        const remaining = sharedPlaylistItems.filter((it) => !playlistOrder.includes(it.id));
        const newPlaylistItems = [...ordered, ...remaining];
        return { ...base, items: newPlaylistItems };
    }, [
        handlePlayPlaylist,
        playlistsQuery.data?.items,
        server.type,
        server.username,
        sidebarPlaylistSorting,
        playlistOrder,
        filterRegex,
    ]);

    const { pinned: allPinnedPlaylistItems, unpinned: allUnpinnedPlaylistItems } = useMemo(
        () => splitPinnedPlaylists(playlistItems.items ?? [], pinnedPlaylistIds),
        [pinnedPlaylistIds, playlistItems.items],
    );
    const sortedUnpinnedPlaylistItems = useMemo(
        () =>
            sortMode === 'recentlyPlayed'
                ? sortPlaylistsByLastPlayed(allUnpinnedPlaylistItems, lastPlayed)
                : allUnpinnedPlaylistItems,
        [allUnpinnedPlaylistItems, lastPlayed, sortMode],
    );
    const pinnedPlaylistItems = useMemo(
        () =>
            allPinnedPlaylistItems.filter(
                (playlist) => revealHiddenPlaylists || !hiddenPlaylistIdSet.has(playlist.id),
            ),
        [allPinnedPlaylistItems, hiddenPlaylistIdSet, revealHiddenPlaylists],
    );
    const unpinnedPlaylistItems = useMemo(
        () =>
            sortedUnpinnedPlaylistItems.filter(
                (playlist) => revealHiddenPlaylists || !hiddenPlaylistIdSet.has(playlist.id),
            ),
        [hiddenPlaylistIdSet, revealHiddenPlaylists, sortedUnpinnedPlaylistItems],
    );
    const pinnedPlaylistIdSet = useMemo(() => new Set(pinnedPlaylistIds), [pinnedPlaylistIds]);
    const hiddenContextValue = useMemo(
        () => ({ hiddenPlaylistIds: hiddenPlaylistIdSet, onUnhide: handleUnhidePlaylist }),
        [handleUnhidePlaylist, hiddenPlaylistIdSet],
    );

    const handleReorder = (
        sourceIds: string[],
        targetId: string,
        edge: 'bottom' | 'top' | null,
    ) => {
        if (!playlistItems?.items || !edge) return;

        const targetIsPinned = pinnedPlaylistIdSet.has(targetId);
        const sourceIsPinned = sourceIds.every((id) => pinnedPlaylistIdSet.has(id));
        const sourceIsUnpinned = sourceIds.every((id) => !pinnedPlaylistIdSet.has(id));
        if (targetIsPinned !== sourceIsPinned || (!targetIsPinned && !sourceIsUnpinned)) return;

        if (targetIsPinned) {
            setPinnedPlaylistIds((current) =>
                reorderPlaylistIds(current, sourceIds, targetId, edge),
            );
            return;
        }

        if (sortMode !== 'default') return;

        setPlaylistOrder(
            reorderPlaylistIds(
                playlistItems.items.map((playlist) => playlist.id),
                sourceIds,
                targetId,
                edge,
            ),
        );
    };

    const folderViewState = usePlaylistFolderViewState(unpinnedPlaylistItems);
    const navigation = usePlaylistNavigationState();
    const { expandedSet, setMany, toggle } = usePlaylistFolderState('shared');
    const inNavigation =
        folderViewState.folderView === 'navigation' && navigation.pathStack.length > 0;

    const handleNavigateUp = useCallback(
        (e: MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            navigation.goUp();
        },
        [navigation],
    );

    const isFolderMovePending = useIsMutatingSidebarPlaylistFolderMove();

    if (pinnedPlaylistItems.length === 0 && unpinnedPlaylistItems.length === 0) {
        return null;
    }

    return (
        <Accordion.Item value="shared-playlists">
            <Accordion.Control component="motion.div" role="button" style={{ userSelect: 'none' }}>
                <Group gap="xs" style={{ minWidth: 0 }} wrap="nowrap">
                    {inNavigation && (
                        <ActionIcon
                            icon="arrowLeftS"
                            iconProps={{ size: 'lg' }}
                            onClick={handleNavigateUp}
                            size="xs"
                            tooltip={{ label: t('common.back') }}
                            variant="subtle"
                        />
                    )}
                    <Text className={styles.name} fw={500} variant="secondary">
                        {inNavigation ? navigation.currentName : t('page.sidebar.shared')}
                    </Text>
                </Group>
            </Accordion.Control>
            <Accordion.Panel className={styles.panel}>
                <LoadingOverlay pos="absolute" visible={isFolderMovePending} />
                <SidebarPlaylistHiddenContext.Provider value={hiddenContextValue}>
                    <SidebarPlaylistSortContext.Provider value={sortMode}>
                        <PlaylistFolderDragExpandProvider
                            expandedSet={expandedSet}
                            setMany={setMany}
                        >
                            {pinnedPlaylistItems.map((playlist) => (
                                <PlaylistRowButton
                                    isPinned
                                    item={playlist}
                                    key={playlist.id}
                                    name={
                                        folderViewState.foldersEnabled
                                            ? getPlaylistLeafName(playlist.name, folderSeparator)
                                            : playlist.name
                                    }
                                    onContextMenu={handleContextMenu}
                                    onReorder={handleReorder}
                                    to={playlist.id}
                                />
                            ))}
                            <PlaylistFolderViews
                                {...folderViewState}
                                allPlaylists={playlistItems?.items ?? []}
                                expandedSet={expandedSet}
                                navigation={navigation}
                                onContextMenu={handleContextMenu}
                                onReorder={handleReorder}
                                onToggleFolder={toggle}
                            />
                        </PlaylistFolderDragExpandProvider>
                    </SidebarPlaylistSortContext.Provider>
                </SidebarPlaylistHiddenContext.Provider>
            </Accordion.Panel>
        </Accordion.Item>
    );
};
