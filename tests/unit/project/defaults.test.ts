import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILT_IN_DEFAULTS, parseAppDefaults } from "@project/index";

const SITE_FILE = join(import.meta.dirname, "..", "..", "..", "public", "defaults.json");

describe("site defaults", () =>
{
    it("ships a defaults.json that is read without issue, isolation in climb milling", () =>
    {
        const { defaults, issues } = parseAppDefaults(readFileSync(SITE_FILE, "utf8"));
        expect(issues).toEqual([]);
        expect(defaults.isolation.direction).toBe("climb");
    });

    it("keeps the built-in value of every setting missing or invalid, and says which", () =>
    {
        const { defaults, issues } = parseAppDefaults(JSON.stringify({
            $comment: "ignored",
            isolation: { passes: 3, direction: "sideways", $comment: "ignored" },
            cutout: { tabCount: 2.5, tabWidth: 3 },
            engraving: {}
        }));
        expect(defaults.isolation).toEqual({ ...BUILT_IN_DEFAULTS.isolation, passes: 3 });
        expect(defaults.cutout).toEqual({ ...BUILT_IN_DEFAULTS.cutout, tabWidth: 3 });
        expect(defaults.drilling).toEqual(BUILT_IN_DEFAULTS.drilling);
        expect(issues).toEqual([
            "isolation.direction: invalid value \"sideways\"",
            "cutout.tabCount: invalid value 2.5",
            "engraving: unknown operation"
        ]);
    });

    it("falls back to the built-in defaults when the file cannot be read", () =>
    {
        expect(parseAppDefaults("{ not json")).toEqual({ defaults: BUILT_IN_DEFAULTS, issues: ["file: not valid JSON"] });
        expect(parseAppDefaults("[]").issues).toEqual(["file: not an object"]);
    });
});
