import { describe, expect, it } from "vitest";
import { DEFAULT_ISOLATION } from "@cam/isolation/index";
import { addProjectTools, defaultLibrary } from "@cam/tools/index";
import { DEFAULT_MACHINE, DEFAULT_SETUP } from "@post/index";
import { looksLikeProject, parseProject, serializeProject, type ProjectFile } from "@project/index";

const PROJECT: ProjectFile = {
    format: "8cam-project",
    version: 1,
    savedAt: "2026-10-28T10:00:00.000Z",
    appVersion: "0.0.1",
    thickness: 1.6,
    layers: [{ id: "layer-1", fileName: "Bottom Copper.GBR", source: "%FSLAX45Y45*%\nM02*\n", color: "#7d64d2", visible: true, opacity: 0.85 }],
    tools: defaultLibrary(),
    machine: DEFAULT_MACHINE,
    postProfile: null,
    isolations: [{ id: "isolation-1", kind: "isolation", layerId: "layer-1", toolId: "vbit-30-0.2", params: DEFAULT_ISOLATION, visible: true }],
    drillings: [],
    cutouts: [],
    setup: { ...DEFAULT_SETUP, mirror: true },
    exportOptions: { split: true, name: "FTDI" }
};

/** As read back: tools of a project are never built-in ones. */
const READ = { ...PROJECT, tools: PROJECT.tools.map((tool) => ({ ...tool, builtIn: false })) };

describe("project file", () =>
{
    it("survives a save and an open", () =>
    {
        const text = serializeProject(PROJECT);
        expect(looksLikeProject(text)).toBe(true);
        expect(parseProject(text)).toEqual({ project: READ });
    });

    it("fills settings missing from older files and refuses what is not a project", () =>
    {
        const older = Object.fromEntries(Object.entries(PROJECT).filter(([key]) => key !== "setup" && key !== "exportOptions"));
        expect(parseProject(JSON.stringify(older))).toEqual({ project: { ...READ, setup: DEFAULT_SETUP, exportOptions: { split: false, name: "" } } });
        expect(parseProject("{")).toEqual({ error: "invalidJson" });
        expect(parseProject("{\"format\":\"8cam-tools\"}")).toEqual({ error: "wrongFormat" });
        expect(parseProject(JSON.stringify({ ...PROJECT, version: 2 }))).toEqual({ error: "unsupportedVersion" });
        expect(parseProject(JSON.stringify({ ...PROJECT, layers: [{ fileName: "a" }] }))).toEqual({ error: "invalidSettings" });
        expect(parseProject(JSON.stringify({ ...PROJECT, tools: undefined }))).toEqual({ error: "missingData" });
        expect(looksLikeProject("{\"format\":\"8cam-machine\"}")).toBe(false);
    });

    it("refuses a project with an impossible value anywhere, a project may come from anyone", () =>
    {
        const [first, ...others] = PROJECT.tools;
        const isolation = PROJECT.isolations[0] as ProjectFile["isolations"][number];
        const cases: [Partial<ProjectFile> | Record<string, unknown>, string][] = [
            [{ thickness: -1 }, "invalidSettings"],
            [{ setup: { origin: "elsewhere", mirror: false } }, "invalidSettings"],
            [{ tools: [{ ...first, feedXY: -100 }, ...others] }, "invalidTools"],
            [{ tools: [{ ...first, cutDepth: "deep" }, ...others] }, "invalidTools"],
            [{ machine: { ...DEFAULT_MACHINE, travelX: 0 } }, "invalidMachine"],
            [{ postProfile: { format: "8cam-post", name: "x" } }, "invalidPostProfile"],
            [{ isolations: [{ ...isolation, params: { ...isolation.params, passes: 1000 } }] }, "invalidOperations"],
            [{ cutouts: [{ id: "c", kind: "cutout", outlineLayerId: null, toolId: "t", params: {}, tabCount: 4, tabs: [], visible: true }] }, "invalidOperations"]
        ];
        for (const [change, error] of cases)
        {
            expect(parseProject(JSON.stringify({ ...PROJECT, ...change }))).toEqual({ error });
        }
    });

    it("adds the tools of a project without replacing those of the user", () =>
    {
        const library = defaultLibrary();
        const [same, changed] = library as [typeof library[number], typeof library[number]];
        let next = 0;
        const result = addProjectTools(library, [
            { ...same, builtIn: false },
            { ...changed, builtIn: false, feedXY: changed.feedXY * 3 },
            { ...same, id: "their-own" }
        ], () => `new-${++next}`);
        expect(result.ids).toEqual({ [same.id]: same.id, [changed.id]: "new-1", "their-own": "their-own" });
        expect(result.added).toBe(2);
        // The user's tools are unchanged, the project's different one is a copy beside them
        expect(result.tools.slice(0, library.length)).toEqual(library);
        expect(result.tools.find((tool) => tool.id === "new-1")).toMatchObject({ feedXY: changed.feedXY * 3, builtIn: false });
    });
});
