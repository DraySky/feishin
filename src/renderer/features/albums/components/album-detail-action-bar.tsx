import type { MouseEvent } from 'react';

import { useTranslation } from 'react-i18next';

import styles from './album-detail-action-bar.module.css';

import { useIsPlayerFetching } from '/@/renderer/features/player/context/player-context';
import { useIsMutatingCreateFavorite } from '/@/renderer/features/shared/mutations/create-favorite-mutation';
import { useIsMutatingDeleteFavorite } from '/@/renderer/features/shared/mutations/delete-favorite-mutation';
import { useIsMutatingRating } from '/@/renderer/features/shared/mutations/set-rating-mutation';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Rating } from '/@/shared/components/rating/rating';
import { Spinner } from '/@/shared/components/spinner/spinner';

interface AlbumDetailActionBarProps {
    favorite?: boolean;
    onAlbumRadio: () => void;
    onFavorite?: (event: MouseEvent<HTMLButtonElement>) => void;
    onMore: (event: MouseEvent<HTMLButtonElement>) => void;
    onPlay: () => void;
    onRating?: (rating: number) => void;
    onShuffle: () => void;
    rating?: number;
}

export const AlbumDetailActionBar = ({
    favorite,
    onAlbumRadio,
    onFavorite,
    onMore,
    onPlay,
    onRating,
    onShuffle,
    rating,
}: AlbumDetailActionBarProps) => {
    const { t } = useTranslation();
    const isPlayerFetching = useIsPlayerFetching();
    const isMutatingFavorite =
        useIsMutatingCreateFavorite() || useIsMutatingDeleteFavorite();
    const isMutatingRating = useIsMutatingRating();

    return (
        <div className={styles.actionBar}>
            <Group className={styles.primaryActions} gap="sm">
                <ActionIcon
                    className={styles.playButton}
                    icon="mediaPlay"
                    iconProps={{ size: 'lg' }}
                    onClick={onPlay}
                    radius="xl"
                    size={48}
                    tooltip={{ label: t('player.play') }}
                    variant="transparent"
                />
                <ActionIcon
                    icon="mediaShuffle"
                    onClick={onShuffle}
                    radius="xl"
                    size="xl"
                    tooltip={{ label: t('player.shuffle') }}
                    variant="subtle"
                />
                {onFavorite && (
                    <ActionIcon
                        disabled={isMutatingFavorite}
                        icon="favorite"
                        iconProps={{ fill: favorite ? 'primary' : undefined }}
                        onClick={onFavorite}
                        radius="xl"
                        size="xl"
                        tooltip={{ label: t('common.favorite') }}
                        variant="subtle"
                    />
                )}
                <ActionIcon
                    disabled={isPlayerFetching}
                    onClick={onAlbumRadio}
                    radius="xl"
                    size="xl"
                    tooltip={{ label: t('player.albumRadio') }}
                    variant="subtle"
                >
                    {isPlayerFetching ? <Spinner size="sm" /> : <Icon icon="radio" size="xl" />}
                </ActionIcon>
                <ActionIcon
                    icon="ellipsisHorizontal"
                    onClick={onMore}
                    radius="xl"
                    size="xl"
                    tooltip={{ label: t('action.viewMore') }}
                    variant="subtle"
                />
            </Group>
            {onRating && (
                <Rating
                    className={styles.rating}
                    onChange={onRating}
                    readOnly={isMutatingRating}
                    size="md"
                    value={rating || 0}
                />
            )}
        </div>
    );
};
