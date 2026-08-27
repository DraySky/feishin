import { useEffect, useState } from 'react';

import type { AlbumDetailSeedSelection } from '/@/renderer/features/albums/utils/album-detail-seed';
import { selectAlbumDetailSeed } from '/@/renderer/features/albums/utils/album-detail-seed';
import { getFastAverageColor } from '/@/renderer/hooks/use-fast-average-color';

export const useAlbumDetailSeed = (args: {
    dominant?: string;
    src: string;
}): AlbumDetailSeedSelection | null => {
    const { dominant, src } = args;
    const [result, setResult] = useState<{
        selection: AlbumDetailSeedSelection;
        src: string;
    } | null>(null);

    useEffect(() => {
        let cancelled = false;

        if (!dominant || !src) {
            return;
        }

        Promise.allSettled([
            getFastAverageColor({ algorithm: 'sqrt', src }),
            getFastAverageColor({ algorithm: 'simple', src }),
        ]).then(([sqrt, simple]) => {
            if (cancelled) {
                return;
            }

            const selection = selectAlbumDetailSeed({
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
