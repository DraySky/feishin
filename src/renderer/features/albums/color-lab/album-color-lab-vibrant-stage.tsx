import { useEffect, useState } from 'react';

import {
    isColorLabTypingTarget,
    PaletteHeroPreview,
    ResultPreview,
    StageHeader,
} from './album-color-lab-components';
import styles from './album-color-lab-route.module.css';
import { getColorLabCases } from './album-color-lab-session';
import {
    COLOR_LAB_VIBRANT_SWATCHES,
    type ColorLabSession,
    type ColorLabVibrantBestSource,
} from './album-color-lab-types';

import { createAlbumDetailPalette } from '/@/renderer/features/albums/utils/album-detail-palette';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Select } from '/@/shared/components/select/select';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

interface AlbumColorLabVibrantStageProps {
    analyzing: boolean;
    getImageUrl: (serverId: string, imageId: null | string) => string | undefined;
    onClose: () => void;
    onPreference: (
        roundId: string,
        caseId: string,
        bestSource: ColorLabVibrantBestSource | null,
    ) => void;
    session: ColorLabSession;
}

export const AlbumColorLabVibrantStage = ({
    analyzing,
    getImageUrl,
    onClose,
    onPreference,
    session,
}: AlbumColorLabVibrantStageProps) => {
    const cases = getColorLabCases(session).filter(
        ({ colorCase }) => colorCase.feedback.overall !== 'unrated',
    );
    const [index, setIndex] = useState(0);
    const active = cases[Math.min(index, cases.length - 1)];

    useEffect(() => {
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (isColorLabTypingTarget(event.target)) return;
            if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1));
            else if (event.key === 'ArrowRight') {
                setIndex((value) => Math.min(cases.length - 1, value + 1));
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [cases.length]);

    if (!active) {
        return (
            <Stack gap="lg">
                <StageHeader detail="Rate at least one baseline case first" title="Node Vibrant" />
                <section className={styles.waitingState}>
                    <TextTitle order={2}>No reviewed baseline cases</TextTitle>
                    <Button onClick={onClose}>Return to session</Button>
                </section>
            </Stack>
        );
    }

    const { colorCase, roundId } = active;
    const imageUrl = getImageUrl(colorCase.serverId, colorCase.imageId);
    const experiment = colorCase.vibrant;
    const preferenceOptions = [
        { label: 'None', value: 'none' },
        { label: 'Current Feishin', value: 'current-feishin' },
        ...COLOR_LAB_VIBRANT_SWATCHES.flatMap(({ key, label, source }) =>
            experiment?.swatches[key] ? [{ label, value: source }] : [],
        ),
    ];

    return (
        <Stack gap="lg">
            <StageHeader
                detail="Compare the frozen Feishin result with Node Vibrant on the same 32 x 32 sample"
                progress={{ current: index + 1, total: cases.length }}
                title="Node Vibrant experiment"
            />
            <section className={styles.review}>
                <div className={styles.casePosition}>
                    <div>
                        <TextTitle order={2}>{colorCase.albumName}</TextTitle>
                        <Text>
                            {colorCase.albumArtistName} -{' '}
                            {colorCase.feedback.overall.replace('-', ' ')}
                        </Text>
                    </div>
                    <Button onClick={onClose} variant="default">
                        Return to session
                    </Button>
                </div>
                <div className={styles.vibrantComparison}>
                    <div>
                        <TextTitle order={3}>Current Feishin reference</TextTitle>
                        <ResultPreview
                            colorCase={colorCase}
                            imageUrl={imageUrl}
                            label="Current Feishin"
                            result={colorCase.baseline}
                        />
                    </div>
                    <div>
                        <TextTitle order={3}>Node Vibrant candidates</TextTitle>
                        <div className={styles.vibrantGrid}>
                            {COLOR_LAB_VIBRANT_SWATCHES.map(({ key, label }) => {
                                const swatch = experiment?.swatches[key];
                                return swatch ? (
                                    <PaletteHeroPreview
                                        colorCase={colorCase}
                                        compact
                                        imageUrl={imageUrl}
                                        key={key}
                                        label={label}
                                        palette={createAlbumDetailPalette(swatch.hex)}
                                        rgb={`${swatch.hex} / rgb(${swatch.rgb.join(', ')})`}
                                    />
                                ) : (
                                    <div className={styles.vibrantMissing} key={key}>
                                        <strong>{label}</strong>
                                        <span>{analyzing ? 'Analyzing...' : 'Unavailable'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <Select
                    data={preferenceOptions}
                    description="Optional. This does not affect baseline completion or picker behavior."
                    label="Best color source"
                    onChange={(value) =>
                        onPreference(
                            roundId,
                            colorCase.id,
                            value === 'none' ? null : (value as ColorLabVibrantBestSource),
                        )
                    }
                    value={experiment?.bestSource ?? 'none'}
                    width="20rem"
                />
                <Group justify="space-between">
                    <Button disabled={index === 0} onClick={() => setIndex(index - 1)}>
                        Previous
                    </Button>
                    <Text isMuted>Left/Right navigate</Text>
                    <Button
                        disabled={index >= cases.length - 1}
                        onClick={() => setIndex(index + 1)}
                    >
                        Next
                    </Button>
                </Group>
            </section>
        </Stack>
    );
};
