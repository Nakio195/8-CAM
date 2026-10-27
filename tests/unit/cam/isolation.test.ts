import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeCopper, findClearances, CLEARANCE_SEARCH_RADIUS } from "@cam/analysis/index";
import { computeIsolation, DEFAULT_ISOLATION, nonIsolatedZones, passOffsets, type IsolationParams } from "@cam/isolation/index";
import { checkMoves, segmentsToMoves } from "@cam/toolpath/index";
import { defaultLibrary, type Tool } from "@cam/tools/index";
import { distance, distanceToRings, distanceToSegment, isCounterClockwise, rectanglePath, totalArea, type Path, type Point, type Polygon } from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";
import { buildGerberGeometry, parseGerber } from "@parsers/gerber/index";
import { flatcamCutPaths } from "../../helpers/flatcam";

const MM = mmToInternal(1);
const FIXTURES = join(import.meta.dirname, "..", "..", "fixtures");

function tool(id: string, changes: Partial<Tool> = {}): Tool
{
    const found = defaultLibrary().find((entry) => entry.id === id);
    if (!found)
    {
        throw new Error(`No built-in tool ${id}`);
    }
    return { ...found, ...changes };
}

function pad(x: number, y: number, width = 1, height = 1): Polygon
{
    return { outer: rectanglePath(x * MM, y * MM, (x + width) * MM, (y + height) * MM), holes: [] };
}

const ENDMILL = tool("endmill-0.8");

describe("pass offsets", () =>
{
    it("follow FlatCAM: each pass moves by the width minus the overlap", () =>
    {
        const close = (values: number[]): number[] => values.map((value) => Math.round(value * 1e9) / 1e9);
        expect(close(passOffsets(0.8, { passes: 3, overlap: 0.25, extraOffset: 0 }))).toEqual([0.4, 1, 1.6]);
        expect(close(passOffsets(0.2, { passes: 1, overlap: 0, extraOffset: 0.05 }))).toEqual([0.15]);
        expect(passOffsets(1, { passes: 0, overlap: 0, extraOffset: 0 })).toEqual([0.5]);
    });
});

describe("isolation toolpaths", () =>
{
    const params: IsolationParams = { ...DEFAULT_ISOLATION, passes: 2, overlap: 0.25 };

    it("draws one loop per pass around a lone pad, at the pass offsets", () =>
    {
        const result = computeIsolation([pad(0, 0)], [], ENDMILL, params);
        expect(result.loopsPerPass).toEqual([1, 1]);
        expect(result.offsets.map((value) => Math.round(value * 1e9) / 1e9)).toEqual([0.4, 1]);
        const ring = [pad(0, 0).outer];
        const offsetsFound = result.segments.map((segment) => Math.min(...segment.points.map((point) => distanceToRings(point, ring))));
        expect(offsetsFound.map((value) => Math.round(value / 1000))).toEqual([40, 100]);
        expect(result.zones).toEqual([]);
    });

    it("turns the loops for the milling direction", () =>
    {
        // Conventional milling keeps the copper on the right of the path: clockwise around a pad
        const conventional = computeIsolation([pad(0, 0)], [], ENDMILL, { ...params, passes: 1, direction: "conventional" });
        const climb = computeIsolation([pad(0, 0)], [], ENDMILL, { ...params, passes: 1, direction: "climb" });
        expect(isCounterClockwise(conventional.segments[0]?.points ?? [])).toBe(false);
        expect(isCounterClockwise(climb.segments[0]?.points ?? [])).toBe(true);
    });

    it("cuts pass after pass or feature by feature", () =>
    {
        const copper = [pad(0, 0), pad(20, 0)];
        const separate = computeIsolation(copper, [], ENDMILL, { ...params, combinePasses: false });
        const combined = computeIsolation(copper, [], ENDMILL, { ...params, combinePasses: true });
        expect(separate.segments).toHaveLength(4);
        // Pass after pass: the first two loops are the inner ones of both pads
        const firstLoopX = (segments: typeof separate.segments): number[] => segments.map((segment) => Math.round((segment.points[0]?.x ?? 0) / MM));
        expect(firstLoopX(separate.segments).slice(0, 2).sort((a, b) => a - b)).toEqual([-0, 20].map((value) => Math.round(value)));
        expect(combined.travelLength).toBeLessThanOrEqual(separate.travelLength);
        expect(combined.cutLength).toBeCloseTo(separate.cutLength, 6);
    });

    it("measures the cut and travel lengths", () =>
    {
        const result = computeIsolation([pad(0, 0)], [], ENDMILL, { ...params, passes: 1 });
        // Rounded square around a 1 mm pad at 0.4 mm: 4 sides plus a circle of radius 0.4
        expect(result.cutLength).toBeCloseTo(4 + 2 * Math.PI * 0.4, 2);
        expect(result.width).toBe(0.8);
    });

    it("produces safe moves", () =>
    {
        const result = computeIsolation([pad(0, 0), pad(5, 0)], [], ENDMILL, params);
        const moves = segmentsToMoves(result.segments, { ...ENDMILL, toolId: ENDMILL.id });
        expect(checkMoves(moves, ENDMILL.travelZ, ENDMILL.safeZ)).toEqual([]);
    });
});

describe("non isolated areas", () =>
{
    it("are found between features closer than the tool and located between them", () =>
    {
        // 0.5 mm gap: an 0.8 mm end mill cannot pass, a 0.254 mm V-bit can
        const copper = [pad(0, 0), pad(1.5, 0), pad(10, 0)];
        const spots = findClearances(copper, CLEARANCE_SEARCH_RADIUS);
        const zones = nonIsolatedZones(copper, spots, 0.4 * MM);
        expect(zones).toHaveLength(1);
        expect(zones[0]?.polygons).toEqual([0, 1]);
        expect(zones[0]?.gap).toBeCloseTo(0.5 * MM, 6);
        // Midway between the facing edges, somewhere along them (any point of two parallel edges is closest)
        expect(zones[0]?.centre.x).toBe(1.25 * MM);
        expect(zones[0]?.centre.y).toBeGreaterThanOrEqual(0);
        expect(zones[0]?.centre.y).toBeLessThanOrEqual(MM);
        // Both envelopes reach 0.4 mm into the 0.5 mm gap: a 0.3 mm band along the 1 mm edges, plus rounded ends
        const area = totalArea(zones[0]?.shape ?? []) / (MM * MM);
        expect(area).toBeGreaterThan(0.3);
        expect(area).toBeLessThan(0.5);
        expect(nonIsolatedZones(copper, spots, 0.127 * MM)).toEqual([]);
    });

    it("agree with the isolation recommendation on FTDI_Max", () =>
    {
        const document = parseGerber(readFileSync(join(FIXTURES, "proteus/ftdi-max-bottom-copper.gbr"), "utf8"));
        const copper = buildGerberGeometry(document).copper;
        const analysis = analyzeCopper(copper, document);
        expect(computeIsolation(copper, analysis.spots, ENDMILL, { ...DEFAULT_ISOLATION, passes: 1 }).zones).toHaveLength(62);
        expect(computeIsolation(copper, analysis.spots, tool("vbit-30-0.2"), { ...DEFAULT_ISOLATION, passes: 1 }).zones).toEqual([]);
    });
});

describe("comparison with FlatCAM Plus on FTDI_Max", () =>
{
    // Reference job: V-bit 30°, tip 0.1 mm, depth 0.2 mm (width 0.2072 mm), one pass, 0.05 mm custom offset
    const document = parseGerber(readFileSync(join(FIXTURES, "proteus/ftdi-max-bottom-copper.gbr"), "utf8"));
    const copper = buildGerberGeometry(document).copper;
    const vbit = tool("vbit-30-0.2", { tipDiameter: 0.1, cutDepth: 0.2 });
    const ours = computeIsolation(copper, [], vbit, { ...DEFAULT_ISOLATION, passes: 1, extraOffset: 0.05 });
    const flatcam = flatcamCutPaths(readFileSync(join(FIXTURES, "proteus/ftdi-max-bottom-copper.flatcam-iso.cnc"), "utf8"), -0.15);

    function distanceToPolylines(point: Point, polylines: readonly Path[]): number
    {
        let best = Infinity;
        for (const line of polylines)
        {
            for (let i = 1; i < line.length; i++)
            {
                best = Math.min(best, distanceToSegment(point, line[i - 1] as Point, line[i] as Point));
            }
        }
        return best;
    }

    it("produces the same number of loops", () =>
    {
        expect(ours.segments).toHaveLength(flatcam.length);
    });

    it("passes through every FlatCAM point (within 2 µm)", () =>
    {
        const rings = ours.segments.map((segment) => segment.points);
        const worst = Math.max(...flatcam.flat().map((point) => distanceToRings(point, rings)));
        expect(worst).toBeLessThan(mmToInternal(0.002));
    });

    it("stays within FlatCAM's arc approximation of its paths", () =>
    {
        // FlatCAM draws circles with 16 segments: on the 6.35 mm pads its chords stray up to ~0.065 mm from the arc
        const worst = Math.max(...ours.segments.flatMap((segment) => segment.points).map((point) => distanceToPolylines(point, flatcam)));
        expect(worst).toBeLessThan(mmToInternal(0.07));
        const flatcamLength = flatcam.reduce((sum, line) => sum + line.slice(1).reduce((length, point, index) =>
            length + distance(line[index] as Point, point), 0), 0) / MM;
        expect(Math.abs(ours.cutLength - flatcamLength) / flatcamLength).toBeLessThan(0.01);
    });
});
