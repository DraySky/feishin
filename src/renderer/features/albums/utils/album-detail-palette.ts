export interface AlbumDetailTone {
    chroma: number;
    css: string;
    hue: number;
    lightness: number;
}

export interface AlbumDetailPalette {
    base: string;
    continuationBarely: string;
    continuationFaint: AlbumDetailTone;
    continuationMid: AlbumDetailTone;
    continuationNear: string;
    continuationSoft: string;
    continuationStart: AlbumDetailTone;
    continuationTrace: string;
    continuationUltraNear: string;
    continuationWhisper: string;
    heroBottom: AlbumDetailTone;
    heroMid: AlbumDetailTone;
    heroTop: AlbumDetailTone;
    intensity: number;
    seed: AlbumDetailTone | null;
}

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

const interpolate = (from: number, to: number, amount: number) =>
    from + (to - from) * amount;

const smoothstep = (min: number, max: number, value: number) => {
    const normalized = clamp((value - min) / (max - min), 0, 1);
    return normalized * normalized * (3 - 2 * normalized);
};

const createTone = (lightness: number, chroma: number, hue: number): AlbumDetailTone => ({
    chroma,
    css: `oklch(${lightness.toFixed(4)} ${chroma.toFixed(4)} ${hue.toFixed(2)})`,
    hue,
    lightness,
});

const parseRgb = (color: string) => {
    const channels = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);

    return channels
        ? ([Number(channels[1]), Number(channels[2]), Number(channels[3])] as const)
        : null;
};

export const parseAlbumDetailColor = (color: string): AlbumDetailTone | null => {
    const rgb = parseRgb(color);

    if (!rgb) {
        return null;
    }

    const [red, green, blue] = rgb.map((channel) => {
        const normalized = clamp(channel / 255, 0, 1);
        return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    const linearL = Math.cbrt(
        0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue,
    );
    const linearM = Math.cbrt(
        0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue,
    );
    const linearS = Math.cbrt(
        0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue,
    );
    const lightness =
        0.2104542553 * linearL + 0.793617785 * linearM - 0.0040720468 * linearS;
    const a = 1.9779984951 * linearL - 2.428592205 * linearM + 0.4505937099 * linearS;
    const b = 0.0259040371 * linearL + 0.7827717662 * linearM - 0.808675766 * linearS;
    const chroma = Math.hypot(a, b);
    const hue = chroma < 0.0001 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;

    return createTone(lightness, chroma, hue < 0 ? hue + 360 : hue);
};

export const createAlbumDetailPalette = (base: string): AlbumDetailPalette => {
    const seed = parseAlbumDetailColor(base);

    if (!seed) {
        const fallback = { chroma: 0, css: base, hue: 0, lightness: 0 };
        return {
            base,
            continuationBarely: base,
            continuationFaint: fallback,
            continuationMid: fallback,
            continuationNear: base,
            continuationSoft: base,
            continuationStart: fallback,
            continuationTrace: base,
            continuationUltraNear: base,
            continuationWhisper: base,
            heroBottom: fallback,
            heroMid: fallback,
            heroTop: fallback,
            intensity: 0,
            seed: null,
        };
    }

    const chromaIntensity = smoothstep(0.1, 0.2, seed.chroma);
    const lightnessIntensity = smoothstep(0.45, 0.62, seed.lightness);
    const intensity = clamp(chromaIntensity * 0.72 + lightnessIntensity * 0.28, 0, 1);
    const heroTop = createTone(
        clamp(
            seed.lightness + interpolate(0.1, 0.025, intensity),
            0.5,
            interpolate(0.66, 0.62, intensity),
        ),
        clamp(seed.chroma * interpolate(1.08, 0.68, intensity), 0.055, 0.2),
        seed.hue,
    );
    const heroMid = createTone(
        clamp(seed.lightness + interpolate(0.03, -0.015, intensity), 0.42, 0.58),
        clamp(seed.chroma * interpolate(1.02, 0.72, intensity), 0.05, 0.19),
        seed.hue,
    );
    const heroBottom = createTone(
        clamp(heroMid.lightness - interpolate(0.07, 0.09, intensity), 0.3, 0.46),
        clamp(seed.chroma * interpolate(0.95, 0.7, intensity), 0.045, 0.17),
        seed.hue,
    );
    const continuationStart = createTone(
        Math.max(0.24, heroBottom.lightness - 0.055),
        clamp(heroBottom.chroma * 0.88, 0.035, 0.15),
        seed.hue,
    );
    const continuationMid = createTone(
        Math.max(0.18, heroBottom.lightness - 0.12),
        clamp(heroBottom.chroma * 0.68, 0.025, 0.11),
        seed.hue,
    );
    const continuationFaint = createTone(
        Math.max(0.14, heroBottom.lightness - 0.17),
        clamp(heroBottom.chroma * 0.45, 0.015, 0.075),
        seed.hue,
    );

    return {
        base,
        continuationBarely:
            `color-mix(in oklab, ${continuationFaint.css} 1.5%, ` +
            'var(--theme-colors-background))',
        continuationFaint,
        continuationMid,
        continuationNear:
            `color-mix(in oklab, ${continuationFaint.css} 18%, ` +
            'var(--theme-colors-background))',
        continuationSoft:
            `color-mix(in oklab, ${continuationFaint.css} 45%, ` +
            'var(--theme-colors-background))',
        continuationStart,
        continuationTrace:
            `color-mix(in oklab, ${continuationFaint.css} 4%, ` +
            'var(--theme-colors-background))',
        continuationUltraNear:
            `color-mix(in oklab, ${continuationFaint.css} 13%, ` +
            'var(--theme-colors-background))',
        continuationWhisper:
            `color-mix(in oklab, ${continuationFaint.css} 8%, ` +
            'var(--theme-colors-background))',
        heroBottom,
        heroMid,
        heroTop,
        intensity,
        seed,
    };
};
