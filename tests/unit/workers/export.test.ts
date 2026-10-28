import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recommendDrilling, summarizeBoard } from "@cam/analysis/index";
import { DEFAULT_CUTOUT } from "@cam/cutout/index";
import { DEFAULT_DRILLING } from "@cam/drilling/index";
import { DEFAULT_ISOLATION } from "@cam/isolation/index";
import { isCounterClockwise } from "@core/geometry/index";
import { defaultLibrary, type Tool } from "@cam/tools/index";
import { mmToInternal } from "@core/units/index";
import { BUILT_IN_PROFILES, DEFAULT_MACHINE, readGcode, setupTransform, transformMoves, transformPoint, type JobSetup, type PostProfile } from "@post/index";
import type { ExportRequestData } from "@project/export";
import { automaticTabs, runCutout } from "@workers/cutoutJob";
import { runDrilling } from "@workers/drillingJob";
import { runExport } from "@workers/exportJob";
import { importFile } from "@workers/importer";
import { runIsolation } from "@workers/isolationJob";

const MM = mmToInternal(1);
const FRAME = { minX: -10, minY: -20, maxX: 30, maxY: 10 };

function tool(id: string): Tool
{
    const found = defaultLibrary().find((entry) => entry.id === id);
    if (!found)
    {
        throw new Error(`Missing tool ${id}`);
    }
    return found;
}

describe("origin and mirror", () =>
{
    it("moves the chosen point of the board to the machine zero", () =>
    {
        const at = (setup: JobSetup, point: { x: number; y: number }): { x: number; y: number } => transformPoint(point, setupTransform(FRAME, setup));
        expect(at({ origin: "lowerLeft", mirror: false }, { x: -10, y: -20 })).toEqual({ x: 0, y: 0 });
        expect(at({ origin: "center", mirror: false }, { x: 10, y: -5 })).toEqual({ x: 0, y: 0 });
        expect(at({ origin: "gerber", mirror: false }, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
        // Mirrored, the board keeps its place: its right edge comes to x = 0
        expect(at({ origin: "lowerLeft", mirror: true }, { x: 30, y: -20 })).toEqual({ x: 0, y: 0 });
        expect(at({ origin: "lowerLeft", mirror: true }, { x: -10, y: 10 })).toEqual({ x: 40, y: 30 });
        // Mirrored about the Gerber Y axis when the Gerber origin is kept
        expect(at({ origin: "gerber", mirror: true }, { x: 3, y: 4 })).toEqual({ x: -3, y: 4 });
    });

    it("reverses arcs when mirroring", () =>
    {
        const moves = transformMoves([{ kind: "arc", cw: true, x: 5, y: 0, i: 2, j: 1, feed: 100 }], setupTransform(FRAME, { origin: "gerber", mirror: true }));
        expect(moves).toEqual([{ kind: "arc", cw: false, x: -5, y: 0, i: -2, j: 1, feed: 100 }]);
    });
});

describe("export of the FTDI_Max board", () =>
{
    const fixture = (name: string): string => readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "proteus", name), "utf8");
    const copper = importFile("Bottom Copper.GBR", fixture("ftdi-max-bottom-copper.gbr"));
    const drillFile = importFile("Drill.GBR", fixture("ftdi-max-drill-plated.gbr"));
    const vbit = tool("vbit-30-0.2");
    const mill = tool("cornmill-1.5");

    function request(setup: JobSetup, split: boolean, profile: PostProfile = BUILT_IN_PROFILES[0] as PostProfile): ExportRequestData
    {
        if (!copper.analysis || !drillFile.drill)
        {
            throw new Error("Missing test data");
        }
        const isolation = runIsolation({ copper: copper.geometry, spots: copper.analysis.spots, tool: vbit, params: DEFAULT_ISOLATION });
        const board = summarizeBoard([{ id: "copper", analysis: copper.analysis }], [{ summary: drillFile.drill.summary }]);
        const advice = recommendDrilling(defaultLibrary(), board);
        const drill = drillFile.drill;
        const sets = drill.tools.map((entry) => ({
            diameter: entry.diameter,
            holes: drill.hits.filter((hit) => hit.tool === entry.number).map((hit) => ({ x: hit.x, y: hit.y })),
            slots: [],
            tool: advice.holes.find((hole) => hole.hole.diameter === entry.diameter)?.tool ?? null
        }));
        const drilling = runDrilling({ sets, params: DEFAULT_DRILLING });
        const box = { minX: copper.bbox.minX, minY: copper.bbox.minY, maxX: copper.bbox.maxX, maxY: copper.bbox.maxY };
        const params = { ...DEFAULT_CUTOUT, margin: 2, direction: setup.mirror ? "climb" as const : "conventional" as const };
        const cutout = runCutout({ outline: null, box, tool: mill, params, tabs: automaticTabs({ outline: null, box, tool: mill, params }, 4) });
        const frame = { minX: box.minX / MM, minY: box.minY / MM, maxX: box.maxX / MM, maxY: box.maxY / MM };
        return {
            name: "FTDI_Max",
            date: new Date(2026, 9, 28, 10, 0).getTime(),
            version: "0.0.1",
            operations: [
                { label: "Isolation", toolLabel: "V-bit 30° 0,2 mm", tool: vbit, loops: isolation.loops },
                ...drilling.runs.map((run, index) => ({ label: `Drilling ${index + 1}`, toolLabel: run.tool.id, tool: run.tool, moves: drilling.runMoves[index] ?? [] })),
                { label: "Cutout", toolLabel: "Fraise maïs 1,5 mm", tool: mill, moves: cutout.moves }
            ].filter((operation) => !("moves" in operation) || (operation.moves?.length ?? 0) > 0),
            profile,
            machine: DEFAULT_MACHINE,
            setup,
            frame,
            split
        };
    }

    it("writes one safe file placed at the lower left corner of the board", () =>
    {
        const output = runExport(request({ origin: "lowerLeft", mirror: false }, false));
        expect(output.files).toHaveLength(1);
        expect(output.issues).toEqual([]);
        expect(output.textIssues).toEqual([]);
        expect(output.forbidden).toEqual([]);
        // Everything but the cutout (2 mm margin + tool radius around the copper) is in the positive quadrant
        expect(output.extent?.xMin).toBeCloseTo(-2.75, 3);
        expect(output.extent?.yMin).toBeCloseTo(-2.75, 3);
        const text = output.files[0]?.text ?? "";
        expect(text).toMatch(/^\(Operation 1: Isolation\)$/m);
        expect(text).toMatch(/^\(Operation 5: Cutout\)$/m);
        // Each drill has its own tool change, named after it
        expect(text).toMatch(/^\(MSG, Change to tool T2: drill-0.8\)$/m);
        expect(text).toMatch(/^\(MSG, Change to tool T3: drill-1.0\)$/m);
        expect(output.files[0]?.duration).toBeGreaterThan(10 * 60);
    });

    it("splits the job into one file per operation and simulates them in order", () =>
    {
        const output = runExport(request({ origin: "center", mirror: false }, true));
        expect(output.files.map((file) => file.name)).toEqual([
            "FTDI_Max-1-Isolation.nc", "FTDI_Max-2-Drilling_1.nc", "FTDI_Max-3-Drilling_2.nc", "FTDI_Max-4-Drilling_3.nc", "FTDI_Max-5-Cutout.nc"
        ]);
        const { backplot } = output;
        expect(backplot.fileStarts).toHaveLength(5);
        expect(backplot.points.length).toBe(backplot.kinds.length * 3);
        for (let i = 1; i < backplot.times.length; i++)
        {
            expect(backplot.times[i]).toBeGreaterThanOrEqual(backplot.times[i - 1] ?? 0);
        }
        // The simulation is drawn over the board: its points are back in Gerber coordinates, inside the cutout
        const xs = Array.from({ length: backplot.kinds.length }, (_, i) => backplot.points[3 * i] ?? 0);
        expect(Math.min(...xs)).toBeCloseTo(copper.bbox.minX / MM - 2.75, 2);
        expect(output.files.reduce((sum, file) => sum + file.duration, 0)).toBeCloseTo(backplot.times[backplot.times.length - 1] ?? 0, 3);
    });

    it("keeps the milling direction when mirroring", () =>
    {
        const plain = runExport(request({ origin: "lowerLeft", mirror: false }, true));
        const mirrored = runExport(request({ origin: "lowerLeft", mirror: true }, true));
        // Same size on the machine
        const width = (extent: typeof plain.extent): number => (extent ? extent.xMax - extent.xMin : 0);
        expect(width(mirrored.extent)).toBeCloseTo(width(plain.extent), 6);
        // The first isolation loop turns the same way: conventional (clockwise around the copper) in both files
        const firstLoop = (text: string): { x: number; y: number }[] =>
        {
            const points: { x: number; y: number }[] = [];
            let current = { x: 0, y: 0 };
            let cutting = false;
            for (const move of readGcode(text).moves)
            {
                if (move.kind === "linear" && move.z !== undefined && move.x === undefined)
                {
                    if (cutting)
                    {
                        break;
                    }
                    cutting = true;
                    points.push(current);
                }
                else if (move.kind === "linear" && cutting)
                {
                    current = { x: move.x ?? current.x, y: move.y ?? current.y };
                    points.push(current);
                }
                else if (move.kind === "rapid")
                {
                    if (cutting && move.z !== undefined)
                    {
                        break;
                    }
                    current = { x: move.x ?? current.x, y: move.y ?? current.y };
                }
            }
            return points;
        };
        const plainLoop = firstLoop(plain.files[0]?.text ?? "");
        const mirroredLoop = firstLoop(mirrored.files[0]?.text ?? "");
        expect(plainLoop.length).toBeGreaterThan(3);
        expect(isCounterClockwise(mirroredLoop)).toBe(isCounterClockwise(plainLoop));
    });

    it("writes one file per tool for a machine setting the Z zero again with each tool", async () =>
    {
        const { SNAPMAKER_ARTISAN } = await import("@post/index");
        const snapmaker = BUILT_IN_PROFILES.find((entry) => entry.id === "snapmaker-artisan") as PostProfile;
        const output = runExport({ ...request({ origin: "lowerLeft", mirror: false }, false, snapmaker), machine: SNAPMAKER_ARTISAN });
        // V-bit, 0.8 and 1.0 mm drills, then the corn cob mill milling the 3 mm holes and cutting the board out
        // Names in plain ASCII: "V-bit 30° 0,2 mm" gives "V-bit_30_deg_0-2_mm"
        expect(output.files.map((file) => file.name)).toEqual([
            "FTDI_Max-1-Isolation-V-bit_30_deg_0-2_mm.cnc",
            "FTDI_Max-2-Drilling-drill-0.8.cnc",
            "FTDI_Max-3-Drilling-drill-1.0.cnc",
            "FTDI_Max-4-Drilling_Cutout-cornmill-1.5.cnc"
        ]);
        for (const [index, file] of output.files.entries())
        {
            // One tool per file: never a pause, the zero is set before each file
            expect(file.text).not.toMatch(/^M600$/m);
            expect(file.text).toMatch(new RegExp(`^; File ${index + 1} of ${output.files.length}: `, "m"));
            expect(file.text).toMatch(index === 0 ? /^; Set the work origin X, Y and Z with this tool before starting$/m
                : /^; Keep the X and Y origin, set the Z zero again on the board surface with this tool$/m);
        }
        // The mill files hold both of its operations: milled holes then cutout
        expect(output.files[3]?.text).toMatch(/^; File 4 of 4: Drilling 3, Cutout$/m);
        expect(output.textIssues).toEqual([]);
    });

    it("writes with every profile without breaking a safety rule", () =>
    {
        for (const profile of BUILT_IN_PROFILES)
        {
            const output = runExport(request({ origin: "lowerLeft", mirror: false }, false, profile));
            expect(output.textIssues).toEqual([]);
            expect(output.forbidden).toEqual([]);
        }
    });
});
