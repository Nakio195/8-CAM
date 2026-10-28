import { describe, expect, it } from "vitest";
import {
    defaultLibrary,
    duplicateTool,
    effectiveWidth,
    exportLibrary,
    importLibrary,
    mergeLibraries,
    passCount,
    passDepths,
    toolWidth,
    validateTool,
    type Tool
} from "@cam/tools/index";

function tool(id: string): Tool
{
    const found = defaultLibrary().find((entry) => entry.id === id);
    if (!found)
    {
        throw new Error(`No built-in tool ${id}`);
    }
    return found;
}

describe("tool width", () =>
{
    it("follows the V-bit formula of the specification", () =>
    {
        const vbit = tool("vbit-30-0.2");
        // 0.2 + 2 · 0.1 · tan(15°) = 0.2536 mm
        expect(effectiveWidth(vbit, 0.1)).toBeCloseTo(0.2 + 0.2 * Math.tan(Math.PI / 12), 10);
        expect(effectiveWidth(vbit, 0)).toBe(0.2);
        expect(effectiveWidth(vbit, -1)).toBe(0.2);
        // Never wider than the body
        expect(effectiveWidth(vbit, 100)).toBe(3.175);
        expect(toolWidth(tool("vbit-20-0.1"))).toBeCloseTo(0.1 + 0.15 * Math.tan(Math.PI / 18), 10);
    });

    it("matches FlatCAM on the reference job (V-bit 30°, tip 0.1, depth 0.2)", () =>
    {
        // The FTDI_Max G-code header says TOOL DIAMETER: 0.2072 mm
        const vbit = { ...tool("vbit-30-0.2"), tipDiameter: 0.1 };
        expect(effectiveWidth(vbit, 0.2)).toBeCloseTo(0.2072, 4);
    });

    it("uses the diameter for end mills and drills", () =>
    {
        expect(toolWidth(tool("endmill-0.8"))).toBe(0.8);
        expect(effectiveWidth(tool("drill-1.0"), 5)).toBe(1);
    });
});

describe("depth passes", () =>
{
    it("splits a depth into passes, the last one reaching it exactly", () =>
    {
        expect(passCount(1.7, 0.4)).toBe(5);
        expect(passCount(1.2, 0.4)).toBe(3);
        expect(passCount(0.1, 0.4)).toBe(1);
        expect(passCount(0, 0.4)).toBe(1);
        expect(passDepths(1.7, 0.4)).toEqual([0.4, 0.8, 1.2000000000000002, 1.6, 1.7]);
        expect(passDepths(0.1, 0.1)).toEqual([0.1]);
    });
});

describe("built-in library", () =>
{
    it("holds the tools of the specification, all valid and marked as built in", () =>
    {
        const library = defaultLibrary();
        expect(library.map((entry) => entry.id)).toEqual([
            "vbit-20-0.1", "vbit-30-0.2", "endmill-0.8", "cornmill-1.5", "drill-0.6", "drill-0.8", "drill-1.0", "drill-1.2"
        ]);
        for (const entry of library)
        {
            expect(validateTool(entry), entry.id).toEqual([]);
            expect(entry.builtIn).toBe(true);
        }
        expect(tool("cornmill-1.5")).toMatchObject({ depthPerPass: 0.4, spindleSpeed: 12_000 });
        expect(tool("drill-0.6")).toMatchObject({ feedZ: 60, cutDepth: 1.8 });
    });
});

describe("tool validation", () =>
{
    it("reports impossible values", () =>
    {
        const vbit = tool("vbit-30-0.2");
        const codes = (changes: Partial<Tool>): string[] => validateTool({ ...vbit, ...changes }).map((issue) => issue.code);
        expect(codes({ diameter: 0 })).toContain("diameterNotPositive");
        expect(codes({ tipDiameter: 5 })).toEqual(["tipLargerThanDiameter"]);
        expect(codes({ tipAngle: 180 })).toEqual(["tipAngleOutOfRange"]);
        expect(codes({ cutDepth: 0 })).toContain("depthNotPositive");
        expect(codes({ depthPerPass: 0 })).toEqual(["depthPerPassNotPositive"]);
        expect(codes({ depthPerPass: 0.5 })).toEqual(["depthPerPassAboveDepth"]);
        expect(codes({ feedXY: 0 })).toEqual(["feedNotPositive"]);
        expect(codes({ feedZ: 0 })).toEqual(["feedNotPositive"]);
        expect(codes({ spindleSpeed: 0 })).toEqual(["spindleNotPositive"]);
        expect(codes({ travelZ: 0 })).toEqual(["travelNotPositive"]);
        expect(codes({ safeZ: 1 })).toEqual(["safeBelowTravel"]);
        // Drills do not move in XY while cutting
        expect(validateTool({ ...tool("drill-0.8"), feedXY: 0 })).toEqual([]);
    });
});

describe("library files", () =>
{
    it("round trips through JSON as the user's own tools", () =>
    {
        const library = defaultLibrary();
        const result = importLibrary(exportLibrary(library));
        expect(result).toHaveProperty("tools");
        if ("tools" in result)
        {
            expect(result.skipped).toBe(0);
            expect(result.tools).toEqual(library.map((entry) => ({ ...entry, builtIn: false })));
        }
    });

    it("rejects files that are not tool libraries", () =>
    {
        expect(importLibrary("{oops")).toEqual({ error: "notJson" });
        expect(importLibrary("{\"tools\": []}")).toEqual({ error: "wrongFormat" });
        expect(importLibrary("{\"format\": \"8cam-tools\", \"version\": 99, \"tools\": []}")).toEqual({ error: "newerVersion" });
        expect(importLibrary("{\"format\": \"8cam-tools\", \"version\": 1, \"tools\": [{\"id\": 3}]}")).toEqual({ error: "invalidTool" });
    });

    it("skips invalid tools and ignores unknown usages", () =>
    {
        const valid = { ...tool("endmill-0.8"), usages: ["isolation", "laser"] };
        const text = JSON.stringify({ format: "8cam-tools", version: 1, tools: [valid, { id: "x", type: "endmill" }, null] });
        const result = importLibrary(text);
        expect(result).toMatchObject({ skipped: 2 });
        if ("tools" in result)
        {
            expect(result.tools[0]?.usages).toEqual(["isolation"]);
        }
    });

    it("merges imported tools by id and duplicates tools", () =>
    {
        const library = defaultLibrary();
        const changed = { ...tool("endmill-0.8"), feedXY: 99, builtIn: false };
        const merged = mergeLibraries(library, [changed, { ...changed, id: "new" }]);
        expect(merged).toHaveLength(library.length + 1);
        expect(merged.find((entry) => entry.id === "endmill-0.8")?.feedXY).toBe(99);
        const copy = duplicateTool(tool("vbit-20-0.1"), "copy");
        expect(copy).toMatchObject({ id: "copy", builtIn: false, tipAngle: 20 });
    });
});

describe("tool values", () =>
{
    it("are free of floating point leftovers, built in or stored by an earlier version", async () =>
    {
        const { cleanToolNumbers } = await import("@cam/tools/index");
        const library = defaultLibrary();
        // 1.6 + 0.1 and 1.6 + 0.2 are not 1.7 and 1.8 in floating point
        expect(library.find((tool) => tool.id === "cornmill-1.5")?.cutDepth).toBe(1.7);
        expect(library.find((tool) => tool.id === "drill-0.8")?.cutDepth).toBe(1.8);
        const stored = { ...(library[0] as Tool), cutDepth: 1.6 + 0.1, diameter: 0.1 + 0.2 };
        expect(cleanToolNumbers(stored)).toMatchObject({ cutDepth: 1.7, diameter: 0.3 });
    });
});
