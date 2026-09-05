export type PlaylistLastPlayedMap = Record<string, number>;

export type SidebarPlaylistSortMode = 'default' | 'recentlyPlayed';

const getServerStorageKey = (prefix: string, serverId: string | undefined) =>
    `${prefix}:${serverId || 'local'}`;

export const getPlaylistLastPlayedKey = (serverId: string | undefined) =>
    getServerStorageKey('playlist_last_played', serverId);

export const getPlaylistSortModeKey = (serverId: string | undefined) =>
    getServerStorageKey('playlist_sort_mode', serverId);

export const sortPlaylistsByLastPlayed = <T extends { id: string }>(
    items: T[],
    lastPlayed: PlaylistLastPlayedMap,
): T[] =>
    items
        .map((item, defaultIndex) => ({ defaultIndex, item }))
        .sort((a, b) => {
            const aLastPlayed = lastPlayed[a.item.id];
            const bLastPlayed = lastPlayed[b.item.id];

            if (aLastPlayed === undefined && bLastPlayed === undefined) {
                return a.defaultIndex - b.defaultIndex;
            }
            if (aLastPlayed === undefined) return 1;
            if (bLastPlayed === undefined) return -1;

            return bLastPlayed - aLastPlayed || a.defaultIndex - b.defaultIndex;
        })
        .map(({ item }) => item);
