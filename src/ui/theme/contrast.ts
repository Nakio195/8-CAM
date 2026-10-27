// WCAG 2.1 contrast computation, used by the tests that check every text / background pair of the theme
// (specification section 6.13: AA level for each combination).

function channel(value: number): number
{
    const ratio = value / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a "#rrggbb" colour. */
export function relativeLuminance(hex: string): number
{
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!match)
    {
        throw new Error(`Expected a #rrggbb colour, got '${hex}'`);
    }
    const [red, green, blue] = [match[1], match[2], match[3]].map((part) => channel(parseInt(part as string, 16)));
    return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

export function contrastRatio(foreground: string, background: string): number
{
    const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
    return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** WCAG AA: 4.5:1 for normal text, 3:1 for large text (24 px, or 18.66 px bold) and interface graphics. */
export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
