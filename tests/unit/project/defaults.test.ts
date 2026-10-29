import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultLibrary, type Tool } from "@cam/tools/index";
import { BUILT_IN_DEFAULTS, parseAppDefaults } from "@project/index";

// npm run check:defaults checks this file; PCBCAM_DEFAULTS=path checks another one (the copy of the server)
const SITE_FILE = process.env.PCBCAM_DEFAULTS ?? join(import.meta.dirname, "..", "..", "..", "public", "defaults.json");

describe("site defaults", () =>
{
    it("ships a defaults.json that is read without issue, isolation in climb milling", () =>
    {
        const { defaults, issues } = parseAppDefaults(readFileSync(SITE_FILE, "utf8"));
        expect(issues).toEqual([]);
        expect(defaults.isolation.direction).toBe("climb");
        expect(defaults.machine).toMatchObject({ name: "SnapMaker", travelX: 400, postProfileId: "snapmaker-artisan" });
        expect(defaults.tools?.length).toBeGreaterThan(0);
        expect(defaults.tools?.every((tool) => tool.builtIn)).toBe(true);
    });

    it("keeps the valid tools of the site, leaves out the others and says which", () =>
    {
        const [vbit, endmill] = defaultLibrary() as [Tool, Tool];
        const { defaults, issues } = parseAppDefaults(JSON.stringify({
            tools: [{ ...vbit, builtIn: false }, { ...endmill, feedXY: -1 }, { ...vbit }, { id: "x" }]
        }));
        expect(defaults.tools).toEqual([vbit]);
        expect(issues).toEqual([
            "tools[1]: feedNotPositive",
            `tools[2]: id ${vbit.id} repeated`,
            "tools[3]: missing or invalid field"
        ]);
        expect(parseAppDefaults(JSON.stringify({ tools: {} }))).toMatchObject({ defaults: { tools: null }, issues: ["tools: not a list"] });
    });

    it("refuses an invalid machine and keeps the built-in one", () =>
    {
        const { defaults, issues } = parseAppDefaults(JSON.stringify({ machine: { name: "", travelX: -1 } }));
        expect(defaults.machine).toBeNull();
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatch(/^machine: /);
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
        const broken = parseAppDefaults("{ \"tools\": [ {} {} ] }");
        expect(broken.defaults).toEqual(BUILT_IN_DEFAULTS);
        expect(broken.issues).toHaveLength(1);
        expect(broken.issues[0]).toMatch(/^file: not valid JSON, nothing of it is used \(.+\)$/);
        expect(parseAppDefaults("[]").issues).toEqual(["file: not an object"]);
    });
});
