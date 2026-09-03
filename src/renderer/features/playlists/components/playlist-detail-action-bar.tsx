import type { MouseEvent, ReactNode } from 'react';

import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

import styles from './playlist-detail-action-bar.module.css';

import { ListSearchInput } from '/@/renderer/features/shared/components/list-search-input';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Group } from '/@/shared/components/group/group';

interface PlaylistDetailActionBarProps {
    disabled?: boolean;
    isPlaying: boolean;
    onMore: (event: MouseEvent<HTMLButtonElement>) => void;
    onPlay: () => void;
    onShuffle: () => void;
    shuffleActive: boolean;
    utilities?: ReactNode;
}

export const PlaylistDetailActionBar = ({
    disabled,
    isPlaying,
    onMore,
    onPlay,
    onShuffle,
    shuffleActive,
    utilities,
}: PlaylistDetailActionBarProps) => {
    const { t } = useTranslation();

    return (
        <div className={styles.actionBar}>
            <Group className={styles.primaryActions} gap="sm">
                <ActionIcon
                    className={styles.playButton}
                    disabled={disabled}
                    icon={isPlaying ? 'mediaPause' : 'mediaPlay'}
                    iconProps={{ size: 'xl' }}
                    onClick={onPlay}
                    radius="xl"
                    size={60}
                    tooltip={{ label: t(isPlaying ? 'player.pause' : 'player.play') }}
                    variant="transparent"
                />
                <ActionIcon
                    aria-pressed={shuffleActive}
                    className={clsx(styles.secondaryAction, styles.shuffleAction)}
                    data-shuffle-active={shuffleActive || undefined}
                    disabled={disabled}
                    icon="mediaShuffle"
                    iconProps={{ size: '2xl' }}
                    onClick={onShuffle}
                    radius="xl"
                    size={46}
                    tooltip={{ label: t('player.shuffle') }}
                    variant="subtle"
                />
                <ActionIcon
                    className={styles.secondaryAction}
                    icon="ellipsisHorizontal"
                    iconProps={{ size: '2xl' }}
                    onClick={onMore}
                    radius="xl"
                    size={46}
                    tooltip={{ label: t('action.viewMore') }}
                    variant="subtle"
                />
            </Group>
            <Group className={styles.utilityActions} gap="xs" wrap="wrap">
                <ListSearchInput />
                {utilities}
            </Group>
        </div>
    );
};
