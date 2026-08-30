import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { useParams } from 'react-router';

import styles from './album-detail-route.module.css';

import { useItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { TableItemSize } from '/@/renderer/components/item-list/item-table-list/item-table-list';
import { NativeScrollArea } from '/@/renderer/components/native-scroll-area/native-scroll-area';
import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { AlbumDetailContent } from '/@/renderer/features/albums/components/album-detail-content';
import { AlbumDetailHeader } from '/@/renderer/features/albums/components/album-detail-header';
import { useAlbumDetailSeed } from '/@/renderer/features/albums/hooks/use-album-detail-seed';
import { createAlbumDetailPalette } from '/@/renderer/features/albums/utils/album-detail-palette';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import {
    LibraryBackgroundImage,
    useHeaderHeight,
} from '/@/renderer/features/shared/components/library-background-overlay';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';
import { LibraryHeaderBar } from '/@/renderer/features/shared/components/library-header-bar';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';
import { useFastAverageColor } from '/@/renderer/hooks';
import { useAlbumBackground, useCurrentServerId } from '/@/renderer/store';
import { useSettingsStore } from '/@/renderer/store/settings.store';
import { LibraryItem } from '/@/shared/types/domain-types';
import { ItemListKey } from '/@/shared/types/types';

const ALBUM_DETAIL_BG_FALLBACK = 'var(--theme-colors-foreground-muted)';
const ALBUM_DETAIL_TABLE_HEADER_HEIGHT = 40;
const ALBUM_DETAIL_TAIL_ROWS = 5;
const toGradientStop = (ratio: number) => `${ratio * 100}%`;

const AlbumDetailRoute = () => {
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const heroRef = useRef<HTMLDivElement>(null);
    const { albumBackground, albumBackgroundBlur } = useAlbumBackground();
    const enableTableHeader = useSettingsStore(
        (state) => state.lists[ItemListKey.ALBUM_DETAIL]?.table.enableHeader,
    );
    const tableSize = useSettingsStore(
        (state) => state.lists[ItemListKey.ALBUM_DETAIL]?.table.size,
    );

    const { albumId } = useParams() as { albumId: string };
    const serverId = useCurrentServerId();

    const detailQuery = useSuspenseQuery({
        ...albumQueries.detail({ query: { id: albumId }, serverId }),
    });

    const imageUrl =
        useItemImageUrl({
            id: detailQuery?.data?.imageId || undefined,
            itemType: LibraryItem.ALBUM,
            type: 'itemCard',
        }) || '';

    const { background: backgroundColor } = useFastAverageColor({
        id: albumId,
        src: imageUrl,
        srcLoaded: true,
    });

    const seedSelection = useAlbumDetailSeed({ dominant: backgroundColor, src: imageUrl });
    const background =
        seedSelection?.selected.rgb ?? backgroundColor ?? ALBUM_DETAIL_BG_FALLBACK;
    const palette = useMemo(() => createAlbumDetailPalette(background), [background]);
    const albumHeaderHeight = useHeaderHeight(headerRef);
    const heroHeight = useHeaderHeight(heroRef);
    const continuationHeight = Math.max(
        albumHeaderHeight -
            heroHeight +
            (enableTableHeader ? ALBUM_DETAIL_TABLE_HEADER_HEIGHT : 0),
        0,
    );
    const rowHeight =
        tableSize === 'compact'
            ? TableItemSize.COMPACT
            : tableSize === 'medium'
              ? TableItemSize.MEDIUM
              : tableSize === 'large'
                ? TableItemSize.LARGE
                : TableItemSize.DEFAULT;
    const tailHeight = rowHeight * ALBUM_DETAIL_TAIL_ROWS;
    const gradientHeight = continuationHeight + tailHeight;
    const primaryRatio = gradientHeight > 0 ? continuationHeight / gradientHeight : 0;
    const gradientStops = {
        fade14: toGradientStop(primaryRatio * 0.92),
        fade21: toGradientStop(primaryRatio * 0.88),
        fade30: toGradientStop(primaryRatio * 0.82),
        fade4: toGradientStop(primaryRatio * 0.978),
        fade40: toGradientStop(primaryRatio * 0.75),
        fade52: toGradientStop(primaryRatio * 0.67),
        fade64: toGradientStop(primaryRatio * 0.58),
        fade76: toGradientStop(primaryRatio * 0.47),
        fade8: toGradientStop(primaryRatio * 0.955),
        faint: toGradientStop(primaryRatio * 0.34),
        mid: toGradientStop(primaryRatio * 0.18),
        transparent: toGradientStop(primaryRatio),
    };

    const showBlurredImage = albumBackground;

    return (
        <AnimatedPage key={`album-detail-${albumId}`}>
            <NativeScrollArea
                pageHeaderProps={{
                    backgroundColor: background,
                    children: (
                        <LibraryHeaderBar>
                            <LibraryHeaderBar.PlayButton
                                ids={[albumId]}
                                itemType={LibraryItem.ALBUM}
                                variant="default"
                            />
                            <LibraryHeaderBar.Title>{detailQuery.data.name}</LibraryHeaderBar.Title>
                        </LibraryHeaderBar>
                    ),
                    offset: 200,
                    target: headerRef,
                }}
                ref={scrollAreaRef}
            >
                <div
                    className={styles.routeSurface}
                    style={
                        {
                            '--album-color-base': palette.base,
                            '--album-color-continuation-fade-14': palette.continuationFade14,
                            '--album-color-continuation-fade-21': palette.continuationFade21,
                            '--album-color-continuation-fade-30': palette.continuationFade30,
                            '--album-color-continuation-fade-4': palette.continuationFade4,
                            '--album-color-continuation-fade-40': palette.continuationFade40,
                            '--album-color-continuation-fade-52': palette.continuationFade52,
                            '--album-color-continuation-fade-64': palette.continuationFade64,
                            '--album-color-continuation-fade-76': palette.continuationFade76,
                            '--album-color-continuation-fade-8': palette.continuationFade8,
                            '--album-color-continuation-faint': palette.continuationFaintFade,
                            '--album-color-continuation-mid': palette.continuationMidFade,
                            '--album-color-continuation-start': palette.continuationStart.css,
                            '--album-color-hero-bottom': palette.heroBottom.css,
                            '--album-color-hero-mid': palette.heroMid.css,
                            '--album-color-hero-top': palette.heroTop.css,
                            '--album-gradient-fade-14-stop': gradientStops.fade14,
                            '--album-gradient-fade-21-stop': gradientStops.fade21,
                            '--album-gradient-fade-30-stop': gradientStops.fade30,
                            '--album-gradient-fade-4-stop': gradientStops.fade4,
                            '--album-gradient-fade-40-stop': gradientStops.fade40,
                            '--album-gradient-fade-52-stop': gradientStops.fade52,
                            '--album-gradient-fade-64-stop': gradientStops.fade64,
                            '--album-gradient-fade-76-stop': gradientStops.fade76,
                            '--album-gradient-fade-8-stop': gradientStops.fade8,
                            '--album-gradient-faint-stop': gradientStops.faint,
                            '--album-gradient-mid-stop': gradientStops.mid,
                            '--album-gradient-transparent-stop': gradientStops.transparent,
                        } as React.CSSProperties
                    }
                >
                    {showBlurredImage ? (
                        <LibraryBackgroundImage
                            blur={albumBackgroundBlur}
                            headerRef={heroRef}
                            imageUrl={imageUrl}
                        />
                    ) : (
                        <div
                            className={styles.heroBackground}
                            style={
                                {
                                    height: heroHeight > 0 ? `${heroHeight}px` : '0px',
                                    visibility: heroHeight > 0 ? 'visible' : 'hidden',
                                } as React.CSSProperties
                            }
                        />
                    )}
                    <div
                        className={styles.backgroundContinuation}
                        style={
                            {
                                height: `${gradientHeight}px`,
                                top: heroHeight > 0 ? `${heroHeight}px` : '0px',
                                visibility:
                                    heroHeight > 0 && albumHeaderHeight > 0 ? 'visible' : 'hidden',
                            } as React.CSSProperties
                        }
                    />
                    <div className={styles.foreground}>
                        <LibraryContainer>
                            <AlbumDetailHeader
                                heroRef={heroRef}
                                ref={headerRef as React.Ref<HTMLDivElement>}
                            />
                            <AlbumDetailContent />
                        </LibraryContainer>
                    </div>
                </div>
            </NativeScrollArea>
        </AnimatedPage>
    );
};

const AlbumDetailRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <AlbumDetailRoute />
        </PageErrorBoundary>
    );
};

export default AlbumDetailRouteWithBoundary;
