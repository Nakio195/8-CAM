import { describe, expect, it } from "vitest";
import { translate } from "@ui/i18n/index";
import { formatDuration } from "@ui/machining/format";
import { automaticLabel, decimalsFor } from "@ui/tools/labels";
import { defaultLibrary } from "@cam/tools/index";

const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>): string => translate("fr", key, values);

describe("display formats", () =>
{
    it("formats durations", () =>
    {
        expect(formatDuration(42.4, t)).toBe("42 s");
        expect(formatDuration(725, t)).toBe("12 min 05 s");
        expect(formatDuration(4800, t)).toBe("1 h 20 min");
        expect(formatDuration(-3, t)).toBe("0 s");
    });

    it("chooses the fewest decimals showing a size exactly", () =>
    {
        expect([decimalsFor(1), decimalsFor(0.8), decimalsFor(0.25), decimalsFor(3.175), decimalsFor(0.0751)]).toEqual([0, 1, 2, 3, 3]);
    });

    it("names built-in tools from their parameters", () =>
    {
        const number = (value: number, decimals: number): string => value.toFixed(decimals).replace(".", ",");
        expect(defaultLibrary().map((tool) => automaticLabel(tool, t, number))).toEqual([
            "V-bit 20° pointe 0,1 mm", "V-bit 30° pointe 0,2 mm", "Fraise 0,8 mm", "Fraise maïs 1,5 mm",
            "Foret 0,6 mm", "Foret 0,8 mm", "Foret 1 mm", "Foret 1,2 mm"
        ]);
    });
});
