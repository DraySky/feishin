import { openContextModal } from '@mantine/modals';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import actionBarStyles from './playlist-detail-action-bar.module.css';

import i18n from '/@/i18n/i18n';
import { PLAYLIST_SONG_TABLE_COLUMNS } from '/@/renderer/components/item-list/item-table-list/default-columns';
import { useListContext } from '/@/renderer/context/list-context';
import { ClientSideSongFilters } from '/@/renderer/features/playlists/components/client-side-song-filters';
import { usePlaylistSongListFilters } from '/@/renderer/features/playlists/hooks/use-playlist-song-list-filters';
import { FilterButton } from '/@/renderer/features/shared/components/filter-button';
import {
    ListConfigMenu,
    SONG_DISPLAY_TYPES,
} from '/@/renderer/features/shared/components/list-config-menu';
import { ListDisplayTypeToggleButton } from '/@/renderer/features/shared/components/list-display-type-toggle-button';
import { isFilterValueSet } from '/@/renderer/features/shared/components/list-filters';
import { ListRefreshButton } from '/@/renderer/features/shared/components/list-refresh-button';
import { ListSortByDropdown } from '/@/renderer/features/shared/components/list-sort-by-dropdown';
import { ListSortOrderToggleButton } from '/@/renderer/features/shared/components/list-sort-order-toggle-button';
import { FILTER_KEYS } from '/@/renderer/features/shared/utils';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Modal } from '/@/shared/components/modal/modal';
import { useDisclosure } from '/@/shared/hooks/use-disclosure';
import { LibraryItem, Song, SongListSort, SortOrder } from '/@/shared/types/domain-types';
import { ItemListKey } from '/@/shared/types/types';

interface PlaylistDetailSongListHeaderFiltersProps {
    isQueryBuilderVisible?: boolean;
    isSmartPlaylist?: boolean;
    onToggleQueryBuilder?: () => void;
}

const PlaylistSongListFiltersModal = () => {
    const { t } = useTranslation();
    const { isSidebarOpen, setIsSidebarOpen } = useListContext();
    const { clear, query } = usePlaylistSongListFilters();
    const [isOpen, handlers] = useDisclosure(false);

    const hasActiveFilters = useMemo(() => {
        return Boolean(
            isFilterValueSet(query[FILTER_KEYS.SONG.ALBUM_ARTIST_IDS]) ||
            isFilterValueSet(query[FILTER_KEYS.SONG.ARTIST_IDS]) ||
            query[FILTER_KEYS.SONG.FAVORITE] !== undefined ||
            isFilterValueSet(query[FILTER_KEYS.SONG.GENRE_ID]) ||
            query[FILTER_KEYS.SONG.HAS_RATING] !== undefined ||
            query[FILTER_KEYS.SONG.MAX_YEAR] !== undefined ||
            query[FILTER_KEYS.SONG.MIN_YEAR] !== undefined,
        );
    }, [query]);

    const handlePin = () => {
        setIsSidebarOpen?.(!isSidebarOpen);
    };

    const canPin = Boolean(setIsSidebarOpen);

    return (
        <>
            <FilterButton isActive={hasActiveFilters} onClick={handlers.toggle} />
            <Modal
                handlers={handlers}
                opened={isOpen}
                size="lg"
                styles={{
                    content: {
                        height: '100%',
                        maxHeight: '640px',
                        maxWidth: 'var(--theme-content-max-width)',
                        width: '100%',
                    },
                }}
                title={
                    <Group justify="space-between" style={{ paddingRight: '3rem', width: '100%' }}>
                        <Group>
                            {canPin && (
                                <ActionIcon
                                    icon={isSidebarOpen ? 'unpin' : 'pin'}
                                    onClick={handlePin}
                                    variant="subtle"
                                />
                            )}
                            {t('common.filters')}
                        </Group>
                        <Button onClick={clear} size="compact-sm" variant="subtle">
                            {t('common.reset')}
                        </Button>
                    </Group>
                }
            >
                <ClientSideSongFilters />
            </Modal>
        </>
    );
};

export const PlaylistDetailSongListHeaderFilters = ({
    isQueryBuilderVisible,
    isSmartPlaylist,
    onToggleQueryBuilder,
}: PlaylistDetailSongListHeaderFiltersProps) => {
    const { t } = useTranslation();
    const { listData, listKey: listKeyFromContext, mode, setMode } = useListContext();
    const listKey = listKeyFromContext ?? ItemListKey.PLAYLIST_SONG;

    const isViewEditMode = !isSmartPlaylist;
    const isEditMode = mode === 'edit';

    const tracks = useMemo(() => {
        if (!listData?.length) {
            return [];
        }

        return (listData as Song[]).map((song) => song.id);
    }, [listData]);

    return (
        <Group gap="xs" justify="flex-end" wrap="wrap">
            <ListSortByDropdown
                buttonProps={{ className: actionBarStyles.textAction }}
                defaultSortByValue={SongListSort.ID}
                disabled={isEditMode}
                itemType={LibraryItem.PLAYLIST_SONG}
                listKey={ItemListKey.PLAYLIST_SONG}
            />
            <ListSortOrderToggleButton
                defaultSortOrder={SortOrder.ASC}
                disabled={isEditMode}
                listKey={ItemListKey.PLAYLIST_SONG}
            />
            <PlaylistSongListFiltersModal />
            <ListRefreshButton disabled={isEditMode} listKey={listKey} />
            {isViewEditMode && <SaveAndReplaceButton mode={mode} songIds={tracks} />}
            {isViewEditMode && (
                <Button
                    className={actionBarStyles.textAction}
                    onClick={() => setMode?.(mode === 'edit' ? 'view' : 'edit')}
                    uppercase
                    variant={mode === 'edit' ? 'state-error' : 'subtle'}
                >
                    {mode === 'edit' ? t('common.cancel') : t('common.edit')}
                </Button>
            )}
            {isSmartPlaylist && onToggleQueryBuilder && (
                <ActionIcon
                    aria-pressed={isQueryBuilderVisible}
                    icon="queryBuilder"
                    iconProps={{
                        color: isQueryBuilderVisible ? 'primary' : undefined,
                    }}
                    onClick={onToggleQueryBuilder}
                    tooltip={{ label: t('action.toggleSmartPlaylistEditor') }}
                    variant="subtle"
                />
            )}
            <ListDisplayTypeToggleButton listKey={listKey} />
            <ListConfigMenu
                displayTypes={SONG_DISPLAY_TYPES}
                listKey={listKey}
                tableColumnsData={PLAYLIST_SONG_TABLE_COLUMNS}
            />
        </Group>
    );
};

export const openSaveAndReplaceModal = (
    playlistId: string,
    songIds: string[],
    onSuccess: () => void,
) => {
    openContextModal({
        innerProps: { onSuccess, playlistId, songIds },
        modal: 'saveAndReplace',
        size: 'sm',
        title: i18n.t('common.saveAndReplace') as string,
    });
};

const SaveAndReplaceButton = ({ mode, songIds }: { mode?: 'edit' | 'view'; songIds: string[] }) => {
    const { t } = useTranslation();
    const { playlistId } = useParams() as { playlistId: string };
    const { setMode } = useListContext();

    const onSuccess = useCallback(() => {
        setMode?.('view');
    }, [setMode]);

    const handleOpenModal = useCallback(() => {
        if (!playlistId) return;

        openSaveAndReplaceModal(playlistId, songIds, onSuccess);
    }, [playlistId, songIds, onSuccess]);

    if (mode === 'view') {
        return null;
    }

    return (
        <Button
            leftSection={<Icon color="error" icon="save" />}
            onClick={handleOpenModal}
            size="sm"
            variant="subtle"
        >
            {t('common.saveAndReplace')}
        </Button>
    );
};
