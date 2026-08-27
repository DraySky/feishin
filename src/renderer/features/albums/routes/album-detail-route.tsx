import { useSuspenseQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { useParams } from 'react-router';

import styles from './album-detail-route.module.css';

import { useItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { NativeScrollArea } from '/@/renderer/components/native-scroll-area/native-scroll-area';
import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { AlbumDetailContent } from '/@/renderer/features/albums/components/album-detail-content';
import { AlbumDetailHeader } from '/@/renderer/features/albums/components/album-detail-header';
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

const AlbumDetailRoute = () => {
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const heroRef = useRef<HTMLDivElement>(null);
    const { albumBackground, albumBackgroundBlur } = useAlbumBackground();
    const enableTableHeader = useSettingsStore(
        (state) => state.lists[ItemListKey.ALBUM_DETAIL]?.table.enableHeader,
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

    const background = backgroundColor ?? ALBUM_DETAIL_BG_FALLBACK;
    const albumHeaderHeight = useHeaderHeight(headerRef);
    const heroHeight = useHeaderHeight(heroRef);
    const continuationHeight = Math.max(
        albumHeaderHeight -
            heroHeight +
            (enableTableHeader ? ALBUM_DETAIL_TABLE_HEADER_HEIGHT : 0),
        0,
    );

    const showBlurredImage = albumBackground;

    return (
        <AnimatedPage key={`album-detail-${albumId}`}>
            <NativeScrollArea
                pageHeaderProps={{
                    backgroundColor: backgroundColor ?? ALBUM_DETAIL_BG_FALLBACK,
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
                    style={{ '--album-color-base': background } as React.CSSProperties}
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
                                height: `${continuationHeight}px`,
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
