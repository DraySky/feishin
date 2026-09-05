import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { AddToPlaylistAction } from '/@/renderer/features/context-menu/actions/add-to-playlist-action';
import { DeletePlaylistAction } from '/@/renderer/features/context-menu/actions/delete-playlist-action';
import { EditPlaylistAction } from '/@/renderer/features/context-menu/actions/edit-playlist-action';
import { GetInfoAction } from '/@/renderer/features/context-menu/actions/get-info-action';
import { PlayAction } from '/@/renderer/features/context-menu/actions/play-action';
import { ContextMenuPreview } from '/@/renderer/features/context-menu/components/context-menu-preview';
import { usePermissions } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { LibraryItem, Playlist } from '/@/shared/types/domain-types';

interface PlaylistContextMenuProps {
    items: Playlist[];
    sidebarHidden?: {
        isHidden: boolean;
        onToggle: () => void;
    };
    sidebarPin?: {
        isPinned: boolean;
        onToggle: () => void;
    };
    type: LibraryItem.PLAYLIST;
}

export const PlaylistContextMenu = ({
    items,
    sidebarHidden,
    sidebarPin,
    type,
}: PlaylistContextMenuProps) => {
    const { t } = useTranslation();
    const { ids } = useMemo(() => {
        const ids = items.map((item) => item.id);
        return { ids };
    }, [items]);

    const { userId, ...permissions } = usePermissions();

    const canEditPublic = permissions.playlists.editPublic;

    const includesNonOwnedPublic = items.some((item) => item.public && item.ownerId !== userId);

    const canEditPlaylist = canEditPublic || !includesNonOwnedPublic;
    const canDeletePlaylist = canEditPublic || !includesNonOwnedPublic;

    return (
        <ContextMenu.Content
            bottomStickyContent={<ContextMenuPreview items={items} itemType={type} />}
        >
            <PlayAction ids={ids} itemType={LibraryItem.PLAYLIST} />
            <ContextMenu.Divider />
            <AddToPlaylistAction items={ids} itemType={LibraryItem.PLAYLIST} />
            {sidebarPin && (
                <ContextMenu.Item
                    leftIcon={sidebarPin.isPinned ? 'unpin' : 'pin'}
                    onSelect={sidebarPin.onToggle}
                >
                    {t(sidebarPin.isPinned ? 'action.unpinPlaylist' : 'action.pinPlaylist')}
                </ContextMenu.Item>
            )}
            {sidebarHidden && (
                <ContextMenu.Item
                    leftIcon={sidebarHidden.isHidden ? 'visibility' : 'visibilityOff'}
                    leftIconFill="default"
                    onSelect={sidebarHidden.onToggle}
                >
                    {t(sidebarHidden.isHidden ? 'action.unhidePlaylist' : 'action.hidePlaylist')}
                </ContextMenu.Item>
            )}
            <ContextMenu.Divider />
            <EditPlaylistAction disabled={!canEditPlaylist} items={items} />
            <DeletePlaylistAction disabled={!canDeletePlaylist} items={items} />
            <ContextMenu.Divider />
            <GetInfoAction disabled={items.length === 0} items={items} />
        </ContextMenu.Content>
    );
};
