import clsx from 'clsx';
import { t } from 'i18next';
import { ReactNode, useCallback } from 'react';

import styles from './row-index-column.module.css';

import {
    ItemTableListInnerColumn,
    TableColumnContainer,
    TableColumnTextContainer,
} from '/@/renderer/components/item-list/item-table-list/item-table-list-column';
import { ItemListItem } from '/@/renderer/components/item-list/types';
import { ItemRowPlayControls } from '/@/renderer/features/shared/components/item-row-play-controls';
import { useAppFocus } from '/@/renderer/hooks/use-app-focus';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Flex } from '/@/shared/components/flex/flex';
import { HoverCard } from '/@/shared/components/hover-card/hover-card';
import { Text } from '/@/shared/components/text/text';
import { Play, PlayerStatus } from '/@/shared/types/types';

export const PlayingEqualizer = () => {
    const isAppFocused = useAppFocus();

    return (
        <span
            aria-hidden="true"
            className={styles.playingEqualizer}
            data-animation-paused={!isAppFocused}
        >
            <span />
            <span />
            <span />
        </span>
    );
};

export const RowPlayControlCell = (
    props: ItemTableListInnerColumn & {
        activePlaybackState?: PlayerStatus.PAUSED | PlayerStatus.PLAYING;
        indexContent: ReactNode;
        onActivePlayback: () => void;
        onDirectPlay?: () => void;
        onPlay: (playType: Play) => void;
        showPlayControls: boolean;
    },
) => {
    const {
        activePlaybackState,
        controls,
        data,
        enableExpansion,
        getRowItem,
        indexContent,
        internalState,
        itemType,
        onActivePlayback,
        onDirectPlay,
        onPlay,
        rowIndex,
        showPlayControls,
    } = props;

    const handleExpand = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            const item = (getRowItem?.(rowIndex) ?? data[rowIndex]) as ItemListItem;
            const rowId = internalState.extractRowId(item);
            const index = rowId ? internalState.findItemIndex(rowId) : -1;
            controls.onExpand?.({
                event: e,
                index,
                internalState,
                item,
                itemType,
            });
        },
        [controls, data, getRowItem, internalState, itemType, rowIndex],
    );

    const getIndexDisplay = (useMutedText: boolean) => {
        const hideOnHoverClass = enableExpansion ? 'hide-on-hover' : undefined;

        if (typeof indexContent === 'number') {
            return useMutedText ? (
                <Text className={hideOnHoverClass} isMuted isNoSelect>
                    {indexContent}
                </Text>
            ) : (
                indexContent
            );
        }

        return <span className={hideOnHoverClass}>{indexContent}</span>;
    };

    const expansionTarget = (
        <div className={styles.playTarget}>
            {getIndexDisplay(true)}
            <ActionIcon
                className={clsx(styles.expand, 'hover-only')}
                icon="arrowDownS"
                iconProps={{ color: 'muted', size: 'md' }}
                onClick={handleExpand}
                size="xs"
                variant="subtle"
            />
        </div>
    );

    if (enableExpansion) {
        return (
            <TableColumnContainer {...props} className={styles.expansionCell}>
                <div className={styles.expansionInner}>
                    {showPlayControls ? (
                        <HoverCard openDelay={300} position="top" withArrow withinPortal={false}>
                            <HoverCard.Target>{expansionTarget}</HoverCard.Target>
                            <HoverCard.Dropdown onClick={(e) => e.stopPropagation()}>
                                <ItemRowPlayControls onPlay={onPlay} />
                            </HoverCard.Dropdown>
                        </HoverCard>
                    ) : (
                        expansionTarget
                    )}
                </div>
            </TableColumnContainer>
        );
    }

    if (!showPlayControls) {
        return (
            <TableColumnTextContainer {...props}>{getIndexDisplay(false)}</TableColumnTextContainer>
        );
    }

    if (onDirectPlay) {
        const isActivePlaying = activePlaybackState === PlayerStatus.PLAYING;
        const isActivePaused = activePlaybackState === PlayerStatus.PAUSED;

        return (
            <TableColumnTextContainer
                {...props}
                className={clsx(styles.fullSizeContent, {
                    [styles.activeIndexContent]: isActivePaused,
                })}
                containerClassName={isActivePlaying ? styles.activePlayingCell : undefined}
            >
                <Flex
                    className={clsx(styles.indexContent, {
                        [styles.activePlayingControls]: isActivePlaying,
                    })}
                    justify="center"
                    w="100%"
                >
                    <span
                        className={isActivePlaying ? styles.activePlayingContent : 'hide-on-hover'}
                    >
                        {getIndexDisplay(false)}
                    </span>
                    <ActionIcon
                        aria-label={t(isActivePlaying ? 'player.pause' : 'player.play')}
                        className="hover-only"
                        icon={isActivePlaying ? 'mediaPause' : 'mediaPlay'}
                        iconProps={{ fill: 'default', size: 'md' }}
                        onClick={
                            isActivePlaying || isActivePaused ? onActivePlayback : onDirectPlay
                        }
                        size="xs"
                        stopsPropagation
                        variant="transparent"
                    />
                </Flex>
            </TableColumnTextContainer>
        );
    }

    return (
        <TableColumnTextContainer {...props} className={styles.fullSizeContent}>
            <HoverCard openDelay={300} position="top" withArrow withinPortal={false}>
                <HoverCard.Target>
                    <Flex className={styles.indexContent} justify="center" w="100%">
                        {getIndexDisplay(false)}
                    </Flex>
                </HoverCard.Target>
                <HoverCard.Dropdown onClick={(e) => e.stopPropagation()}>
                    <ItemRowPlayControls onPlay={onPlay} />
                </HoverCard.Dropdown>
            </HoverCard>
        </TableColumnTextContainer>
    );
};
