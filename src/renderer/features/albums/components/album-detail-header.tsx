import { useQuery, useQueryClient } from '@tanstack/react-query';
import { forwardRef, Fragment, Ref, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import styles from './album-detail-header.module.css';

import { queryKeys } from '/@/renderer/api/query-keys';
import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { AlbumDetailActionBar } from '/@/renderer/features/albums/components/album-detail-action-bar';
import { JoinedArtists } from '/@/renderer/features/albums/components/joined-artists';
import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { LibraryHeader } from '/@/renderer/features/shared/components/library-header';
import { useSetFavorite } from '/@/renderer/features/shared/hooks/use-set-favorite';
import { useSetRating } from '/@/renderer/features/shared/hooks/use-set-rating';
import { songsQueries } from '/@/renderer/features/songs/api/songs-api';
import { AppRoute } from '/@/renderer/router/routes';
import { useCurrentServer, useShowFavorites, useShowRatings } from '/@/renderer/store';
import { useArtistRadioCount } from '/@/renderer/store/settings.store';
import {
    formatCollectionDurationString,
    formatPartialIsoDateUTC,
    formatSizeString,
} from '/@/renderer/utils';
import { normalizeReleaseTypes } from '/@/renderer/utils/normalize-release-types';
import { Group } from '/@/shared/components/group/group';
import { Separator } from '/@/shared/components/separator/separator';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { LibraryItem, ServerType } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

interface AlbumDetailHeaderProps {
    heroRef?: Ref<HTMLDivElement>;
    isAlbumPlaybackLinked: boolean;
    isPlaying: boolean;
    onPlay: () => void;
    onToggleAlbumShuffleOnPlay: () => void;
    shuffleActive: boolean;
}

const AlbumDetailHeaderBase = (
    {
        heroRef,
        isAlbumPlaybackLinked,
        isPlaying,
        onPlay,
        onToggleAlbumShuffleOnPlay,
        shuffleActive,
    }: AlbumDetailHeaderProps,
    ref: Ref<HTMLDivElement>,
) => {
    const { albumId } = useParams() as { albumId: string };
    const { t } = useTranslation();
    const server = useCurrentServer();
    const showRatings = useShowRatings();
    const showFavorites = useShowFavorites();
    const queryClient = useQueryClient();
    const albumRadioCount = useArtistRadioCount();
    const detailQuery = useQuery(
        albumQueries.detail({ query: { id: albumId }, serverId: server?.id }),
    );

    const showRating =
        showRatings &&
        (detailQuery?.data?._serverType === ServerType.NAVIDROME ||
            detailQuery?.data?._serverType === ServerType.SUBSONIC);

    const { addToQueueByData, toggleShuffle } = usePlayer();

    const setRating = useSetRating();
    const setFavorite = useSetFavorite();

    const handleFavorite = showFavorites
        ? () => {
              if (!detailQuery?.data) return;
              setFavorite(
                  detailQuery.data._serverId,
                  [detailQuery.data.id],
                  LibraryItem.ALBUM,
                  !detailQuery.data.userFavorite,
              );
          }
        : undefined;

    const handleUpdateRating = showRating
        ? (rating: number) => {
              if (!detailQuery?.data) return;

              if (detailQuery.data.userRating === rating) {
                  return setRating(
                      detailQuery.data._serverId,
                      [detailQuery.data.id],
                      LibraryItem.ALBUM,
                      0,
                  );
              }

              return setRating(
                  detailQuery.data._serverId,
                  [detailQuery.data.id],
                  LibraryItem.ALBUM,
                  rating,
              );
          }
        : undefined;

    const handleMoreOptions = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!detailQuery?.data) return;
        ContextMenuController.call({
            cmd: { items: [detailQuery.data], type: LibraryItem.ALBUM },
            event: e,
        });
    };

    const handleAlbumRadio = async () => {
        if (!server?.id || !albumId) return;

        try {
            const albumRadioSongs = await queryClient.fetchQuery({
                ...songsQueries.albumRadio({
                    query: {
                        albumId: albumId,
                        count: albumRadioCount,
                    },
                    serverId: server.id,
                }),
                queryKey: queryKeys.player.fetch({ albumId: albumId }),
            });
            if (albumRadioSongs && albumRadioSongs.length > 0) {
                addToQueueByData(albumRadioSongs, Play.NOW);
            }
        } catch (error) {
            console.error('Failed to load album radio:', error);
        }
    };

    const releaseYear = detailQuery?.data?.releaseYear;
    const releaseDate = detailQuery?.data?.releaseDate;

    const metadataItems = useMemo(() => {
        const items: Array<{ id: string; value: React.ReactNode | string | undefined }> = [];

        const album = detailQuery?.data;

        if (!album) return [];

        const originalDifferentFromRelease =
            album.originalDate && album.originalDate !== album.releaseDate;

        const originalYearDifferentFromRelease =
            album.originalYear > 0 &&
            album.releaseYear != null &&
            album.originalYear !== album.releaseYear;

        const playCount = album?.playCount;

        const trackYearRangeDifferent = album.trackYearRange?.max !== album.trackYearRange?.min;

        if (album.trackYearRange && trackYearRangeDifferent) {
            items.push({
                id: 'trackYearRange',
                value: `${album.trackYearRange.min}-${album.trackYearRange.max}`,
            });
        }

        if (album.originalDate && originalDifferentFromRelease) {
            items.push({
                id: 'originalDate',
                value: `${formatPartialIsoDateUTC(album.originalDate)}`,
            });
        } else if (album.originalYear > 0 && originalYearDifferentFromRelease) {
            items.push({
                id: 'originalYear',
                value: `${album.originalYear}`,
            });
        }

        const prefixNecessary = items.length > 0;
        const releasePrefix = prefixNecessary ? `${t('page.albumDetail.released')} ` : '';
        const releaseYearPrefix = prefixNecessary ? `${t('page.albumDetail.released')} ` : '';
        if (releaseDate) {
            items.push({
                id: 'releaseDate',
                value: `${releasePrefix}${formatPartialIsoDateUTC(releaseDate)}`,
            });
        } else if (releaseYear != null && releaseYear > 0) {
            items.push({
                id: 'releaseYear',
                value: `${releaseYearPrefix}${releaseYear}`,
            });
        }

        items.push(
            ...[
                {
                    id: 'songCount',
                    value: t('entity.trackWithCount', { count: detailQuery?.data?.songCount || 0 }),
                },
                {
                    id: 'duration',
                    value: formatCollectionDurationString(detailQuery?.data?.duration || 0),
                },
                {
                    id: 'explicitStatus',
                    value: detailQuery?.data?.explicitStatus,
                },
                {
                    id: 'size',
                    value: detailQuery?.data?.size
                        ? formatSizeString(detailQuery?.data?.size)
                        : undefined,
                },
                {
                    id: 'playCount',
                    value: playCount ? t('entity.play', { count: playCount }) : undefined,
                },
            ],
        );

        return items.filter((item) => !!item.value);
    }, [detailQuery?.data, releaseDate, releaseYear, t]);

    const headerItem = useMemo(() => {
        const album = detailQuery?.data;

        if (!album) return null;

        const releaseTypes = album.releaseType
            ? normalizeReleaseTypes([album.releaseType], t)
            : null;

        const releaseTypeText = releaseTypes?.length ? releaseTypes[0] : null;

        if (releaseTypeText) {
            return (
                <Group gap="sm">
                    <Text
                        component={Link}
                        fw={600}
                        isLink
                        size="md"
                        to={AppRoute.LIBRARY_ALBUMS}
                        tt="uppercase"
                    >
                        {releaseTypeText}
                    </Text>
                    {album.version && (
                        <>
                            <Text fw={600} isMuted>
                                <Separator />
                            </Text>
                            <Text>{album.version}</Text>
                        </>
                    )}
                </Group>
            );
        }

        return null;
    }, [detailQuery?.data, t]);

    return (
        <Stack gap={0} ref={ref}>
            <LibraryHeader
                condensedHero
                item={{
                    children: headerItem,
                    explicitStatus: detailQuery?.data?.explicitStatus ?? null,
                    imageId: detailQuery?.data?.imageId,
                    imageUrl: detailQuery?.data?.imageUrl,
                    route: AppRoute.LIBRARY_ALBUMS,
                    type: LibraryItem.ALBUM,
                }}
                ref={heroRef}
                title={detailQuery?.data?.name || ''}
            >
                <Stack gap="md" w="100%">
                    <Group className={styles.metadataGroup} gap="xs">
                        {metadataItems.map((item, index) => (
                            <Fragment key={item.id}>
                                {index === 0 && <Text isNoSelect>♫ </Text>}
                                {index > 0 && (
                                    <Text isMuted isNoSelect>
                                        <Separator />
                                    </Text>
                                )}
                                <Text fw={400}>{item.value}</Text>
                            </Fragment>
                        ))}
                    </Group>
                    <Group className={styles.metadataGroup}>
                        <JoinedArtists
                            artistName={detailQuery?.data?.albumArtistName || ''}
                            artists={detailQuery?.data?.albumArtists || []}
                        />
                    </Group>
                </Stack>
            </LibraryHeader>
            <AlbumDetailActionBar
                favorite={detailQuery?.data?.userFavorite}
                isPlaying={isPlaying}
                onAlbumRadio={handleAlbumRadio}
                onFavorite={handleFavorite}
                onMore={handleMoreOptions}
                onPlay={onPlay}
                onRating={handleUpdateRating}
                onShuffle={() => {
                    if (isAlbumPlaybackLinked) {
                        toggleShuffle();
                    } else {
                        onToggleAlbumShuffleOnPlay();
                    }
                }}
                rating={detailQuery?.data?.userRating || 0}
                shuffleActive={shuffleActive}
            />
        </Stack>
    );
};

export const AlbumDetailHeader = forwardRef(AlbumDetailHeaderBase);
