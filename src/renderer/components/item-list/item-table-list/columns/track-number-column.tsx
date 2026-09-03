import styles from './row-index-column.module.css';

import { isRowPlayControlColumn } from '/@/renderer/components/item-list/helpers/get-row-play-control-column';
import { NumericColumn } from '/@/renderer/components/item-list/item-table-list/columns/numeric-column';
import {
    PlayingEqualizer,
    RowPlayControlCell,
} from '/@/renderer/components/item-list/item-table-list/columns/row-play-control-cell';
import {
    supportsTrackNumberRowPlayControls,
    useRowPlayControl,
} from '/@/renderer/components/item-list/item-table-list/columns/use-row-play-control';
import { ItemTableListInnerColumn } from '/@/renderer/components/item-list/item-table-list/item-table-list-column';
import { Flex } from '/@/shared/components/flex/flex';
import { Icon } from '/@/shared/components/icon/icon';
import { PlayerStatus, TableColumn } from '/@/shared/types/types';

export const TrackNumberColumn = (props: ItemTableListInnerColumn) => {
    if (
        isRowPlayControlColumn(TableColumn.TRACK_NUMBER, props.columns) &&
        supportsTrackNumberRowPlayControls(props.itemType)
    ) {
        return <PlayableTrackNumberColumn {...props} />;
    }

    return <NumericColumn {...props} />;
};

const PlayableTrackNumberColumn = (props: ItemTableListInnerColumn) => {
    const {
        activePlaybackState,
        handleActivePlayback,
        handleDirectPlay,
        handlePlay,
        isActive,
        isPlaying,
        showPlayControls,
    } = useRowPlayControl(props);
    const rowItem = props.getRowItem?.(props.rowIndex) ?? (props.data as unknown[])[props.rowIndex];
    const trackNumber = (rowItem as undefined | { trackNumber?: number })?.trackNumber;

    if (typeof trackNumber !== 'number') {
        return <NumericColumn {...props} />;
    }

    const indexContent = handleDirectPlay ? (
        activePlaybackState === PlayerStatus.PLAYING ? (
            <Flex className={styles.indexContent}>
                <PlayingEqualizer />
            </Flex>
        ) : (
            trackNumber
        )
    ) : isActive ? (
        <Flex className={styles.indexContent}>
            <Icon fill="primary" icon={isPlaying ? 'mediaPlay' : 'mediaPause'} />
        </Flex>
    ) : (
        trackNumber
    );

    return (
        <RowPlayControlCell
            {...props}
            activePlaybackState={activePlaybackState}
            indexContent={indexContent}
            onActivePlayback={handleActivePlayback}
            onDirectPlay={handleDirectPlay}
            onPlay={handlePlay}
            showPlayControls={showPlayControls}
        />
    );
};
