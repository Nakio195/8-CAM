import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { analyzeCopper } from "@cam/analysis/index";
import { DEFAULT_ISOLATION } from "@cam/isolation/index";
import { defaultLibrary } from "@cam/tools/index";
import { packPolygons, strokePolylines, unionPolygons, unpackPolygons, type Polygon } from "@core/geometry/index";
import type { ClearanceSpot } from "@cam/analysis/index";
import type { PackedPolygons } from "@core/geometry/index";
import { importFile } from "@workers/importer";
import { assembleIsolationOutput, isolationParts, runIsolationPart } from "@workers/isolationJob";
import { createDenseBoard } from "./denseBoard";

// Target of specification section 8: isolation, 2 passes, dense 10 x 10 cm board in < 5 s.
// The CAM worker computes its parts (the passes, the non-isolated areas) in parallel sub-workers: the time the user
// waits is the slowest part plus the assembly, measured here part by part in one thread.

const TOOLS = ["vbit-30-0.2", "vbit-20-0.1", "endmill-0.8"];

function measureBoard(copper: PackedPolygons, spots: ClearanceSpot[]): { table: Record<string, Record<string, string>>; worst: Record<string, number> }
{
    const table: Record<string, Record<string, string>> = {};
    const worst: Record<string, number> = {};
    for (const id of TOOLS)
    {
        const tool = defaultLibrary().find((entry) => entry.id === id);
        if (!tool)
        {
            throw new Error("Missing tool");
        }
        const request = { copper, spots, tool, params: DEFAULT_ISOLATION };
        const times: number[] = [];
        const outputs = isolationParts(request).map((part) =>
        {
            const start = performance.now();
            const output = runIsolationPart(request, part, unpackPolygons(request.copper));
            times.push(performance.now() - start);
            return output;
        });
        const start = performance.now();
        const output = assembleIsolationOutput(request, outputs, start);
        const assembly = performance.now() - start;
        worst[id] = Math.max(...times) + assembly;
        table[id] = {
            "parts": times.map((time) => `${time.toFixed(0)} ms`).join(" | "),
            "assembly": `${assembly.toFixed(0)} ms`,
            "one thread": `${(times.reduce((sum, time) => sum + time, 0) + assembly).toFixed(0)} ms`,
            "in parallel": `${(worst[id] ?? 0).toFixed(0)} ms`,
            "result": `${output.loopsPerPass.join(" + ")} loops, ${output.zones.length} areas`
        };
    }
    return { table, worst };
}

it("isolates the dense board of milestone J1 in less than 5 s, non isolated areas included", () =>
{
    const board = createDenseBoard();
    const shapes: Polygon[] = [...board.pads];
    for (const [width, tracks] of board.tracksByWidth)
    {
        shapes.push(...strokePolylines(tracks, width));
    }
    const copper = unionPolygons(shapes);
    const { table, worst } = measureBoard(packPolygons(copper), analyzeCopper(copper, null).spots);
    console.table(table);
    for (const time of Object.values(worst))
    {
        expect(time).toBeLessThan(5000);
    }
});

// Worst case: the same board with a ground pour (written by gerber.perf.ts, run npm run bench once first), whose 140
// detailed clearance holes make every offset expensive. Guard against regressions only (measured 3.3 to 6.8 s).
it("isolates the dense board with its ground pour in less than 10 s", () =>
{
    const file = importFile("dense-board.gbr", readFileSync(join(import.meta.dirname, "..", "..", "test-output", "dense-board.gbr"), "utf8"));
    if (!file.analysis)
    {
        throw new Error("Missing test data");
    }
    const { table, worst } = measureBoard(file.geometry, file.analysis.spots);
    console.table(table);
    for (const time of Object.values(worst))
    {
        expect(time).toBeLessThan(10_000);
    }
});
