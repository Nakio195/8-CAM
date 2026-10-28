import { describe, expect, it } from "vitest";
import { DEFAULT_ISOLATION } from "@cam/isolation/index";
import { parseDefaults, pickDefaults, sameAsDefaults } from "@project/index";

describe("operation defaults", () =>
{
    it("isolates in climb milling unless the user chose otherwise", () =>
    {
        expect(DEFAULT_ISOLATION.direction).toBe("climb");
    });

    it("keeps only the settings that do not depend on the board", () =>
    {
        expect(pickDefaults("drilling", { cycle: "peck", peckDepth: 0.4, dwell: 0, depth: 1.8 })).toEqual({ cycle: "peck", peckDepth: 0.4, dwell: 0 });
        expect(pickDefaults("cutout", { mode: "shape", direction: "climb", tabWidth: 3, tabHeight: 0.4, tabCount: 6, depth: 1.7, margin: 2 }))
            .toEqual({ mode: "shape", direction: "climb", tabWidth: 3, tabHeight: 0.4, tabCount: 6 });
    });

    it("drops what cannot be trusted when reading them back", () =>
    {
        expect(parseDefaults(null)).toEqual({});
        expect(parseDefaults("not json")).toEqual({});
        expect(parseDefaults(JSON.stringify({
            isolation: { passes: 3, direction: "sideways", overlap: 2, extra: 1 },
            drilling: "peck",
            other: { passes: 1 }
        }))).toEqual({ isolation: { passes: 3 } });
    });

    it("tells when an operation already has the defaults", () =>
    {
        const stored = { isolation: pickDefaults("isolation", { ...DEFAULT_ISOLATION, passes: 3 }) };
        expect(sameAsDefaults("isolation", { ...DEFAULT_ISOLATION, passes: 3 }, stored)).toBe(true);
        expect(sameAsDefaults("isolation", { ...DEFAULT_ISOLATION, passes: 2 }, stored)).toBe(false);
        expect(sameAsDefaults("drilling", { cycle: "simple" }, stored)).toBe(false);
    });
});
