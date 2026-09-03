import { forwardRef, useMemo } from 'react';
import { useEffect } from 'react';

import { playSongFromItemListControl } from '/@/renderer/components/item-list/helpers/play-row-from-list';
import { useItemListColumnReorder } from '/@/renderer/components/item-list/helpers/use-item-list-column-reorder';
import { useItemListColumnResize } from '/@/renderer/components/item-list/helpers/use-item-list-column-resize';
import { useItemListScrollPersist } from '/@/renderer/components/item-list/helpers/use-item-list-scroll-persist';
import { ItemListWithPagination } from '/@/renderer/components/item-list/item-list-pagination/item-list-pagination';
import { ItemTableList } from '/@/renderer/components/item-list/item-table-list/item-table-list';
import { ItemTableListColumn } from '/@/renderer/components/item-list/item-table-list/item-table-list-column';
import { ItemControls, ItemListTableComponentProps } from '/@/renderer/components/item-list/types';
import { useListContext } from '/@/renderer/context/list-context';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { usePlaylistSongListFilters } from '/@/renderer/features/playlists/hooks/use-playlist-song-list-filters';
import { useSearchTermFilter } from '/@/renderer/features/shared/hooks/use-search-term-filter';
import { searchLibraryItems } from '/@/renderer/features/shared/utils';
import { usePlayerSong } from '/@/renderer/store';
import { sortSongList } from '/@/shared/api/utils';
import {
    LibraryItem,
    PlaylistSongListQuery,
    PlaylistSongListResponse,
    Song,
} from '/@/shared/types/domain-types';
import { ItemListKey, Play, TableColumn } from '/@/shared/types/types';

interface PlaylistDetailSongListTableProps extends Omit<
    ItemListTableComponentProps<PlaylistSongListQuery>,
    'query'
> {
    currentPage?: number;
    data: PlaylistSongListResponse;
    items?: Song[];
    itemsPerPage?: number;
    onPageChange?: (page: number) => void;
    pageScroll?: boolean;
}

export const PlaylistDetailSongListTable = forwardRef<any, PlaylistDetailSongListTableProps>(
    (
        {
            autoFitColumns = false,
            columns,
            currentPage,
            data,
            enableAlternateRowColors = false,
            enableHeader = true,
            enableHorizontalBorders = false,
            enableRowHoverHighlight = true,
            enableSelection = true,
            enableVerticalBorders = false,
            items: itemsProp,
            itemsPerPage,
            onPageChange,
            pageScroll = false,
            saveScrollOffset = true,
            size = 'default',
        },
        ref,
    ) => {
        const { handleOnScrollEnd, scrollOffset } = useItemListScrollPersist({
            enabled: saveScrollOffset && !pageScroll,
        });

        const { handleColumnReordered } = useItemListColumnReorder({
            itemListKey: ItemListKey.PLAYLIST_SONG,
        });

        const { handleColumnResized } = useItemListColumnResize({
            itemListKey: ItemListKey.PLAYLIST_SONG,
        });

        const { searchTerm } = useSearchTermFilter();
        const { query } = usePlaylistSongListFilters();

        const albumGroupingEnabled = columns.some(
            (col) => col.id === TableColumn.ALBUM_GROUP && col.isEnabled,
        );

        const songDataFromData = useMemo(() => {
            let list = data?.items || [];
            if (searchTerm) {
                list = searchLibraryItems(list, searchTerm, LibraryItem.SONG);
                return list;
            }
            return sortSongList(list, query.sortBy, query.sortOrder);
        }, [data?.items, searchTerm, query.sortBy, query.sortOrder]);

        const { id: playlistId, playlistPlayback, setListData } = useListContext();
        const songData = itemsProp ?? songDataFromData;

        useEffect(() => {
            if (itemsProp == null && setListData) {
                setListData(songDataFromData);
            }
        }, [itemsProp, songDataFromData, setListData]);

        const player = usePlayer();

        const currentSong = usePlayerSong();

        const overrideControls: Partial<ItemControls> = useMemo(() => {
            return {
                onDirectPlay: ({ index, internalState, item }) => {
                    if (!item) {
                        return;
                    }

                    if (playlistPlayback) {
                        playlistPlayback.play(songData, item as Song);
                    } else {
                        playSongFromItemListControl({
                            collection: songData,
                            contextPlaylistId: playlistId,
                            index,
                            internalState,
                            item: item as Song,
                            meta: { playType: Play.NOW },
                            player,
                        });
                    }
                },
                onDoubleClick: ({ index, internalState, item, meta }) => {
                    if (!item) {
                        return;
                    }

                    playSongFromItemListControl({
                        index,
                        internalState,
                        item: item as Song,
                        meta,
                        player,
                    });
                },
            };
        }, [player, playlistId, playlistPlayback, songData]);

        const getRowId = useMemo(() => {
            return (item: unknown) => {
                if (!item || typeof item !== 'object') {
                    return 'id';
                }
                const song = item as Song;
                return song.playlistItemId || song.id;
            };
        }, []);

        const effectiveColumns = useMemo(() => {
            if (albumGroupingEnabled) return columns;
            return columns.filter((col) => col.id !== TableColumn.ALBUM_GROUP);
        }, [columns, albumGroupingEnabled]);

        const isPaginated =
            typeof currentPage === 'number' &&
            typeof itemsPerPage === 'number' &&
            typeof onPageChange === 'function';
        const totalCount = songData.length;
        const pageCount = Math.max(1, Math.ceil(totalCount / (itemsPerPage ?? 1)));
        const paginatedData = useMemo(() => {
            if (!isPaginated || currentPage == null || itemsPerPage == null) return songData;
            const start = currentPage * itemsPerPage;
            return songData.slice(start, start + itemsPerPage);
        }, [isPaginated, currentPage, itemsPerPage, songData]);
        const dataToRender = isPaginated ? paginatedData : songData;
        const rowOrderKey = useMemo(
            () => dataToRender.map((song) => song.playlistItemId || song.id).join('|'),
            [dataToRender],
        );

        const table = (
            <ItemTableList
                activeRowId={currentSong?.id}
                autoFitColumns={autoFitColumns}
                CellComponent={ItemTableListColumn}
                columns={effectiveColumns}
                data={dataToRender}
                enableAlternateRowColors={enableAlternateRowColors}
                enableDragScroll={!pageScroll}
                enableExpansion={false}
                enableHeader={enableHeader}
                enableHorizontalBorders={enableHorizontalBorders}
                enableRowHoverHighlight={enableRowHoverHighlight}
                enableSelection={enableSelection}
                enableStickyHeader={pageScroll}
                enableVerticalBorders={enableVerticalBorders}
                getRowId={getRowId}
                initialTop={
                    pageScroll
                        ? undefined
                        : {
                              to: scrollOffset ?? 0,
                              type: 'offset',
                          }
                }
                itemType={LibraryItem.PLAYLIST_SONG}
                key={rowOrderKey}
                onColumnReordered={handleColumnReordered}
                onColumnResized={handleColumnResized}
                onScrollEnd={pageScroll ? undefined : handleOnScrollEnd}
                overrideControls={overrideControls}
                ref={ref}
                size={size}
            />
        );

        if (isPaginated && itemsPerPage != null) {
            return (
                <ItemListWithPagination
                    currentPage={currentPage!}
                    itemsPerPage={itemsPerPage}
                    onChange={onPageChange!}
                    pageCount={pageCount}
                    pageScroll={pageScroll}
                    totalItemCount={totalCount}
                >
                    {table}
                </ItemListWithPagination>
            );
        }

        return table;
    },
);

export const PlaylistDetailSongListEditTable = forwardRef<any, PlaylistDetailSongListTableProps>(
    (
        {
            autoFitColumns = false,
            columns,
            data,
            enableAlternateRowColors = false,
            enableHeader = true,
            enableHorizontalBorders = false,
            enableRowHoverHighlight = true,
            enableSelection = true,
            enableVerticalBorders = false,
            pageScroll = false,
            saveScrollOffset = true,
            size = 'default',
        },
        ref,
    ) => {
        const { handleOnScrollEnd, scrollOffset } = useItemListScrollPersist({
            enabled: saveScrollOffset && !pageScroll,
        });

        const { handleColumnReordered } = useItemListColumnReorder({
            itemListKey: ItemListKey.PLAYLIST_SONG,
        });

        const { handleColumnResized } = useItemListColumnResize({
            itemListKey: ItemListKey.PLAYLIST_SONG,
        });

        const player = usePlayer();
        const { id: playlistId, playlistPlayback } = useListContext();

        const currentSong = usePlayerSong();

        const overrideControls: Partial<ItemControls> = useMemo(() => {
            return {
                onDirectPlay: ({ index, internalState, item }) => {
                    if (!item) {
                        return;
                    }

                    if (playlistPlayback) {
                        playlistPlayback.play(data.items, item as Song);
                    } else {
                        playSongFromItemListControl({
                            collection: data.items,
                            contextPlaylistId: playlistId,
                            index,
                            internalState,
                            item: item as Song,
                            meta: { playType: Play.NOW },
                            player,
                        });
                    }
                },
                onDoubleClick: ({ index, internalState, item, meta }) => {
                    if (!item) {
                        return;
                    }

                    playSongFromItemListControl({
                        index,
                        internalState,
                        item: item as Song,
                        meta,
                        player,
                    });
                },
            };
        }, [data.items, player, playlistId, playlistPlayback]);

        const getRowId = useMemo(() => {
            return (item: unknown) => {
                if (!item || typeof item !== 'object') {
                    return 'id';
                }
                const song = item as Song;
                return song.playlistItemId || song.id;
            };
        }, []);

        return (
            <ItemTableList
                activeRowId={currentSong?.id}
                autoFitColumns={autoFitColumns}
                CellComponent={ItemTableListColumn}
                columns={columns}
                data={data.items}
                enableAlternateRowColors={enableAlternateRowColors}
                enableDrag
                enableDragScroll={!pageScroll}
                enableExpansion={false}
                enableHeader={enableHeader}
                enableHorizontalBorders={enableHorizontalBorders}
                enableRowHoverHighlight={enableRowHoverHighlight}
                enableSelection={enableSelection}
                enableStickyHeader={pageScroll}
                enableVerticalBorders={enableVerticalBorders}
                getRowId={getRowId}
                initialTop={
                    pageScroll
                        ? undefined
                        : {
                              to: scrollOffset ?? 0,
                              type: 'offset',
                          }
                }
                itemType={LibraryItem.PLAYLIST_SONG}
                onColumnReordered={handleColumnReordered}
                onColumnResized={handleColumnResized}
                onScrollEnd={pageScroll ? undefined : handleOnScrollEnd}
                overrideControls={overrideControls}
                ref={ref}
                size={size}
            />
        );
    },
);
