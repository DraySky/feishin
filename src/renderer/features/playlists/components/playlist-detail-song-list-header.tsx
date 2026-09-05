import type { MouseEvent, Ref } from 'react';

import { forwardRef, Fragment, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import styles from './playlist-detail-song-list-header.module.css';

import { useListContext } from '/@/renderer/context/list-context';
import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import { PlaylistDetailActionBar } from '/@/renderer/features/playlists/components/playlist-detail-action-bar';
import { PlaylistDetailSongListHeaderFilters } from '/@/renderer/features/playlists/components/playlist-detail-song-list-header-filters';
import { useDeletePlaylistImage } from '/@/renderer/features/playlists/mutations/delete-playlist-image-mutation';
import { useUploadPlaylistImage } from '/@/renderer/features/playlists/mutations/upload-playlist-image-mutation';
import { LibraryHeader } from '/@/renderer/features/shared/components/library-header';
import { getPlaylistLeafName } from '/@/renderer/features/sidebar/components/playlist-folder-tree';
import { AppRoute } from '/@/renderer/router/routes';
import {
    useCurrentServer,
    useSidebarPlaylistFolders,
    useSidebarPlaylistFolderSeparator,
} from '/@/renderer/store';
import { formatCollectionDurationString } from '/@/renderer/utils';
import { replaceURLWithHTMLLinks } from '/@/renderer/utils/linkify';
import { hasFeature } from '/@/shared/api/utils';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { FileButton } from '/@/shared/components/file-button/file-button';
import { Group } from '/@/shared/components/group/group';
import { Separator } from '/@/shared/components/separator/separator';
import { Spoiler } from '/@/shared/components/spoiler/spoiler';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { LibraryItem, Playlist, Song } from '/@/shared/types/domain-types';
import { ServerFeature } from '/@/shared/types/features-types';

interface PlaylistDetailSongListHeaderProps {
    data: Playlist;
    heroRef?: Ref<HTMLDivElement>;
    imageUrl?: string;
    isPlaying: boolean;
    isQueryBuilderVisible?: boolean;
    isSmartPlaylist?: boolean;
    onPlay: () => void;
    onShuffle: () => void;
    onToggleQueryBuilder?: () => void;
    shuffleActive: boolean;
}

function ImageUploadOverlay({
    data,
    onUploadFile,
}: {
    data: Playlist;
    onUploadFile: (file: File) => Promise<void>;
}) {
    const deletePlaylistImageMutation = useDeletePlaylistImage({});
    const server = useCurrentServer();

    if (!hasFeature(server, ServerFeature.PLAYLIST_IMAGE_UPLOAD)) return null;

    return (
        <Group gap="xs">
            <FileButton
                accept="image/*"
                onChange={async (file) => {
                    if (!file) return;
                    await onUploadFile(file);
                }}
            >
                {(props) => (
                    <ActionIcon
                        icon="uploadImage"
                        iconProps={{ size: 'lg' }}
                        radius="xl"
                        size="xs"
                        variant="default"
                        {...props}
                    />
                )}
            </FileButton>
            <ActionIcon
                disabled={!data.uploadedImage}
                icon="delete"
                iconProps={{ size: 'lg' }}
                onClick={(event) => {
                    event.stopPropagation();
                    deletePlaylistImageMutation.mutate({
                        apiClientProps: { serverId: data._serverId },
                        query: { id: data.id },
                    });
                }}
                radius="xl"
                size="xs"
                variant="default"
            />
        </Group>
    );
}

const PlaylistDetailSongListHeaderBase = (
    {
        data,
        heroRef,
        imageUrl,
        isPlaying,
        isQueryBuilderVisible,
        isSmartPlaylist,
        onPlay,
        onShuffle,
        onToggleQueryBuilder,
        shuffleActive,
    }: PlaylistDetailSongListHeaderProps,
    ref: Ref<HTMLDivElement>,
) => {
    const { t } = useTranslation();
    const { listData } = useListContext();
    const server = useCurrentServer();
    const foldersEnabled = useSidebarPlaylistFolders();
    const folderSeparator = useSidebarPlaylistFolderSeparator();
    const uploadPlaylistImageMutation = useUploadPlaylistImage({});
    const playlistSongs = listData as Song[];
    const playlistDisplayName = useMemo(() => {
        if (!foldersEnabled) return data.name;
        return getPlaylistLeafName(data.name, folderSeparator);
    }, [data.name, folderSeparator, foldersEnabled]);
    const playlistDescription = data.description?.trim();
    const trackCount = data.songCount ?? playlistSongs.length;
    const metadataItems = [
        t('entity.trackWithCount', { count: trackCount }),
        data.duration ? formatCollectionDurationString(data.duration) : undefined,
    ].filter(Boolean) as string[];
    const canUploadPlaylistImage =
        hasFeature(server, ServerFeature.PLAYLIST_IMAGE_UPLOAD) && Boolean(data._serverId);

    const handlePlaylistImageUpload = useCallback(
        async (file: File) => {
            const buffer = await file.arrayBuffer();
            uploadPlaylistImageMutation.mutate({
                apiClientProps: { serverId: data._serverId },
                body: { image: new Uint8Array(buffer) },
                query: { id: data.id },
            });
        },
        [data._serverId, data.id, uploadPlaylistImageMutation],
    );

    const handleMore = (event: MouseEvent<HTMLButtonElement>) => {
        ContextMenuController.call({
            cmd: { items: [data], type: LibraryItem.PLAYLIST },
            event,
        });
    };

    return (
        <Stack gap={0} ref={ref}>
            <LibraryHeader
                condensedHero
                containerClassName={styles.playlistHeader}
                imageOverlay={
                    <ImageUploadOverlay data={data} onUploadFile={handlePlaylistImageUpload} />
                }
                imageUrl={imageUrl}
                item={{
                    children: (
                        <Text
                            component={Link}
                            fw={600}
                            isLink
                            size="md"
                            to={AppRoute.PLAYLISTS}
                            tt="uppercase"
                        >
                            {isSmartPlaylist
                                ? t('entity.smartPlaylist')
                                : t('entity.playlist', { count: 1 })}
                        </Text>
                    ),
                    imageId: data.imageId,
                    imageUrl: data.imageUrl,
                    route: AppRoute.PLAYLISTS,
                    type: LibraryItem.PLAYLIST,
                }}
                onImageFileDrop={canUploadPlaylistImage ? handlePlaylistImageUpload : undefined}
                ref={heroRef}
                showImageDropIndicator={false}
                title={playlistDisplayName}
            >
                <Stack gap="md" w="100%">
                    {playlistDescription && (
                        <Spoiler hideLabel={<></>} maxHeight={52} showLabel={<></>}>
                            <Text className={styles.description} size="sm">
                                {replaceURLWithHTMLLinks(playlistDescription)}
                            </Text>
                        </Spoiler>
                    )}
                    <Group className={styles.metadataGroup} gap="xs">
                        {metadataItems.map((item, index) => (
                            <Fragment key={item}>
                                {index === 0 && <Text isNoSelect>♫ </Text>}
                                {index > 0 && (
                                    <Text isMuted isNoSelect>
                                        <Separator />
                                    </Text>
                                )}
                                <Text fw={400}>{item}</Text>
                            </Fragment>
                        ))}
                    </Group>
                </Stack>
            </LibraryHeader>
            <PlaylistDetailActionBar
                disabled={!playlistSongs.length}
                isPlaying={isPlaying}
                onMore={handleMore}
                onPlay={onPlay}
                onShuffle={onShuffle}
                shuffleActive={shuffleActive}
                utilities={
                    <PlaylistDetailSongListHeaderFilters
                        isQueryBuilderVisible={isQueryBuilderVisible}
                        isSmartPlaylist={isSmartPlaylist}
                        onToggleQueryBuilder={onToggleQueryBuilder}
                    />
                }
            />
        </Stack>
    );
};

export const PlaylistDetailSongListHeader = forwardRef(PlaylistDetailSongListHeaderBase);
