import { useEffect, useState } from 'react';

import type { AlbumDetailArtworkAnalysis } from '/@/renderer/features/albums/utils/album-detail-artwork-color';
import { sampleAlbumDetailArtwork } from '/@/renderer/features/albums/utils/album-detail-artwork-color';
import type { AlbumDetailSeedSelection } from '/@/renderer/features/albums/utils/album-detail-seed';
import { selectAlbumDetailSeed } from '/@/renderer/features/albums/utils/album-detail-seed';
import { getFastAverageColor } from '/@/renderer/hooks/use-fast-average-color';

export const useAlbumDetailSeed = (args: {
    dominant?: string;
    src: string;
}): AlbumDetailArtworkAnalysis | AlbumDetailSeedSelection | null => {
    const { dominant, src } = args;
    const [result, setResult] = useState<{
        selection: AlbumDetailArtworkAnalysis | AlbumDetailSeedSelection;
        src: string;
    } | null>(null);

    useEffect(() => {
        let cancelled = false;

        if (!dominant || !src) {
            return;
        }

        Promise.allSettled([
            sampleAlbumDetailArtwork(src),
            getFastAverageColor({ algorithm: 'sqrt', src }),
            getFastAverageColor({ algorithm: 'simple', src }),
        ]).then(([sampled, sqrt, simple]) => {
            if (cancelled) {
                return;
            }

            const selection =
                sampled.status === 'fulfilled'
                    ? sampled.value
                    : selectAlbumDetailSeed({
                          dominant,
                          simple: simple.status === 'fulfilled' ? simple.value : undefined,
                          sqrt: sqrt.status === 'fulfilled' ? sqrt.value : undefined,
                      });

            if (selection) {
                setResult({ selection, src });
            }
        });

        return () => {
            cancelled = true;
        };
    }, [dominant, src]);

    return result?.src === src ? result.selection : null;
};
