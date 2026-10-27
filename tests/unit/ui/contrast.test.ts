import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AA_LARGE_TEXT, AA_NORMAL_TEXT, contrastRatio, relativeLuminance } from "@ui/theme/contrast";

// Reads the design tokens straight from the CSS, so the checks follow every change of the theme
const CSS = readFileSync(join(import.meta.dirname, "..", "..", "..", "src", "ui", "theme", "tokens.css"), "utf8");

function block(selector: string): Record<string, string>
{
    const start = CSS.indexOf(selector);
    const open = CSS.indexOf("{", start);
    const close = CSS.indexOf("}", open);
    const tokens: Record<string, string> = {};
    for (const match of CSS.slice(open, close).matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi))
    {
        tokens[match[1] as string] = (match[2] as string).toLowerCase();
    }
    return tokens;
}

const LIGHT = block(":root\n{");
const DARK = { ...LIGHT, ...block(':root[data-theme="dark"]') };

/** Text / background pairs used by the interface: all must reach AA for normal text. */
const TEXT_PAIRS: [string, string][] = [
    ["--text", "--surface"],
    ["--text", "--surface-panel"],
    ["--text", "--surface-sunken"],
    ["--text-muted", "--surface"],
    ["--text-muted", "--surface-panel"],
    ["--header-text", "--header-background"],
    ["--action-text", "--action-background"],
    ["--secondary-text", "--secondary-background"],
    ["--success-text", "--success-background"],
    ["--warning-text", "--warning-background"],
    ["--error-text", "--error-background"],
    ["--info-text", "--info-background"],
    ["--help-text", "--help-background"],
    ["--tooltip-text", "--tooltip-background"],
    ["--sticker-success-text", "--sticker-success"],
    ["--sticker-warning-text", "--sticker-warning"],
    ["--sticker-error-text", "--sticker-error"],
    ["--sticker-info-text", "--sticker-info"],
    ["--sticker-neutral-text", "--sticker-neutral"],
    ["--sticker-accent-text", "--sticker-accent"],
    ["--canvas-text", "--canvas-background"]
];

describe("WCAG contrast of the theme (specification 6.13)", () =>
{
    it("computes the reference ratios", () =>
    {
        expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
        expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
        expect(relativeLuminance("#ffffff")).toBe(1);
        expect(() => relativeLuminance("red")).toThrow();
    });

    it("explains the deeper red used behind white text", () =>
    {
        expect(contrastRatio("#ffffff", LIGHT["--brand-rouge"] ?? "")).toBeLessThan(AA_NORMAL_TEXT);
        expect(contrastRatio("#ffffff", LIGHT["--brand-rouge-strong"] ?? "")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    for (const [name, theme] of [["light", LIGHT], ["dark", DARK]] as const)
    {
        it(`reaches AA for every text pair of the ${name} theme`, () =>
        {
            const failures = TEXT_PAIRS
                .map(([text, background]) => ({ text, background, ratio: contrastRatio(theme[text] ?? "", theme[background] ?? "") }))
                .filter((pair) => pair.ratio < AA_NORMAL_TEXT)
                .map((pair) => `${pair.text} on ${pair.background}: ${pair.ratio.toFixed(2)}`);
            expect(failures).toEqual([]);
        });

        it(`keeps the focus ring and the borders of status colours visible in the ${name} theme`, () =>
        {
            expect(contrastRatio(theme["--focus"] ?? "", theme["--surface"] ?? "")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
        });
    }
});
