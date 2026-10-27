import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    analyzeCopper,
    CLEARANCE_SEARCH_RADIUS,
    DEFAULT_BOARD_THICKNESS,
    findClearances,
    minimumTrackWidth,
    recommendCutout,
    recommendDrilling,
    recommendIsolation,
    summarizeBoard,
    type BoardSummary
} from "@cam/analysis/index";
import { defaultLibrary, type Tool } from "@cam/tools/index";
import { circlePath, rectanglePath, type Polygon } from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";
import { drillFromGerber, drillSummary } from "@parsers/excellon/index";
import { buildGerberGeometry, parseGerber } from "@parsers/gerber/index";

const MM = mmToInternal(1);
const FIXTURES = join(import.meta.dirname, "..", "..", "fixtures");

function box(minX: number, minY: number, maxX: number, maxY: number): Polygon
{
    return { outer: rectanglePath(minX * MM, minY * MM, maxX * MM, maxY * MM), holes: [] };
}

function board(spotsMm: number[], holes: [number, number][] = [], thickness = DEFAULT_BOARD_THICKNESS): BoardSummary
{
    const spots = spotsMm.map((distance, index) => ({
        polygons: [index, index + 1] as [number, number],
        a: { x: 0, y: 0 },
        b: { x: 0, y: 0 },
        distance: distance * MM,
        layer: "copper"
    }));
    const summary = summarizeBoard([], [{ summary: holes.map(([diameter, hits]) => ({ diameter: diameter * MM, hits, slots: 0 })) }],
        thickness);
    return { ...summary, spots, minClearance: spots[0] ?? null };
}

describe("clearances", () =>
{
    it("measures the gap between distinct features with its closest points", () =>
    {
        const spots = findClearances([box(0, 0, 1, 1), box(1.3, 0.2, 2, 0.8), box(10, 0, 11, 1)], CLEARANCE_SEARCH_RADIUS);
        // Only the first two are within 2 mm of each other
        expect(spots).toHaveLength(1);
        expect(spots[0]?.polygons).toEqual([0, 1]);
        expect(spots[0]?.distance).toBeCloseTo(0.3 * MM, 6);
        expect(spots[0]?.a.x).toBe(MM);
        expect(spots[0]?.b.x).toBe(1.3 * MM);
    });

    it("finds diagonal gaps between corners and round pads", () =>
    {
        const spots = findClearances([box(0, 0, 1, 1), box(1.3, 1.4, 2, 2)], CLEARANCE_SEARCH_RADIUS);
        expect(spots[0]?.distance).toBeCloseTo(0.5 * MM, 6);
        const discs = findClearances([
            { outer: circlePath({ x: 0, y: 0 }, 0.5 * MM), holes: [] },
            { outer: circlePath({ x: 1.4 * MM, y: 0 }, 0.5 * MM), holes: [] }
        ], CLEARANCE_SEARCH_RADIUS);
        expect(discs[0]?.distance).toBeCloseTo(0.4 * MM, -2);
    });

    it("measures islands inside the holes of a ground pour", () =>
    {
        const pour = { outer: rectanglePath(0, 0, 10 * MM, 10 * MM), holes: [[...rectanglePath(4 * MM, 4 * MM, 6 * MM, 6 * MM)].reverse()] };
        const spots = findClearances([pour, box(4.5, 4.5, 5.5, 5.5)], CLEARANCE_SEARCH_RADIUS);
        expect(spots[0]?.distance).toBeCloseTo(0.5 * MM, 6);
    });

    it("sorts spots from the tightest and handles empty input", () =>
    {
        const spots = findClearances([box(0, 0, 1, 1), box(1.5, 0, 2, 1), box(2.2, 0, 3, 1)], CLEARANCE_SEARCH_RADIUS);
        expect(spots.map((spot) => Math.round(spot.distance / 1000))).toEqual([20, 50, 120]);
        expect(findClearances([], CLEARANCE_SEARCH_RADIUS)).toEqual([]);
        expect(findClearances([box(0, 0, 1, 1), box(1.5, 0, 2, 1)], 0)).toEqual([]);
    });
});

describe("track width", () =>
{
    it("finds the thinnest track and ignores outlines and pads", () =>
    {
        const document = parseGerber(`%FSLAX26Y26*%%MOMM*%%ADD10C,0.3*%%ADD11C,0*%%ADD12R,0.2X0.5*%%ADD13C,0.1*%
D10*X0Y0D02*X1000000Y0D01*D11*X0Y0D02*X0Y1000000D01*D13*X5000000Y5000000D03*D12*X0Y2000000D02*X1000000Y2000000D01*M02*`);
        expect(minimumTrackWidth(document)).toEqual({ width: 0.2 * MM, at: { x: 0, y: 2 * MM }, aperture: 12 });
        expect(minimumTrackWidth(parseGerber("%FSLAX26Y26*%%MOMM*%M02*"))).toBeNull();
    });
});

describe("board summary", () =>
{
    it("combines layers and counts holes of the same size together", () =>
    {
        const summary = summarizeBoard(
            [
                { id: "top", analysis: { spots: [{ polygons: [0, 1], a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, distance: 50_000 }], minTrack: { width: 30_000, at: { x: 0, y: 0 }, aperture: 10 } } },
                { id: "bottom", analysis: { spots: [{ polygons: [0, 1], a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, distance: 30_000 }], minTrack: null } }
            ],
            [{ summary: [{ diameter: 80_000, hits: 3, slots: 0 }] }, { summary: [{ diameter: 80_000, hits: 2, slots: 1 }, { diameter: 300_000, hits: 2, slots: 0 }, { diameter: 50_000, hits: 0, slots: 0 }] }]
        );
        expect(summary.minClearance?.layer).toBe("bottom");
        expect(summary.minTrack?.layer).toBe("top");
        expect(summary.holes).toEqual([{ diameter: 80_000, count: 6 }, { diameter: 300_000, count: 2 }]);
        expect([summary.smallestHole, summary.largestHole, summary.thickness]).toEqual([80_000, 300_000, 1.6]);
        expect(summarizeBoard([], []).minClearance).toBeNull();
    });
});

describe("isolation recommendation", () =>
{
    const library = defaultLibrary();

    it("rates tools against the minimum clearance with the 10 % margin rule", () =>
    {
        const advice = recommendIsolation(library, board([0.27, 0.5, 0.6]));
        const byId = Object.fromEntries(advice.map((entry) => [entry.tool.id, entry]));
        // V-bit 30°: 0.2536 mm in a 0.27 mm gap leaves 6 % → borderline
        expect(byId["vbit-30-0.2"]).toMatchObject({ status: "limit", nonIsolated: 0 });
        expect(byId["vbit-20-0.1"]).toMatchObject({ status: "suitable", nonIsolated: 0 });
        expect(byId["endmill-0.8"]).toMatchObject({ status: "tooWide", nonIsolated: 3 });
        // Drills and the cutout mill are not isolation tools
        expect(advice.map((entry) => entry.tool.id)).toEqual(["vbit-20-0.1", "vbit-30-0.2", "endmill-0.8"]);
    });

    it("lists suitable tools from the most robust to the finest", () =>
    {
        const advice = recommendIsolation(library, board([1.5]));
        expect(advice.map((entry) => entry.tool.id)).toEqual(["endmill-0.8", "vbit-30-0.2", "vbit-20-0.1"]);
        expect(recommendIsolation(library, board([])).every((entry) => entry.status === "suitable" && entry.margin === null)).toBe(true);
    });
});

describe("drilling recommendation", () =>
{
    it("matches the nearest drill, mills large holes and counts saved tool changes", () =>
    {
        const advice = recommendDrilling(defaultLibrary(), board([], [[0.762, 12], [0.8, 4], [1.016, 27], [3, 2], [2.0, 1]]));
        const summary = advice.holes.map((hole) => [hole.hole.diameter / MM, hole.method, hole.tool?.id, Number(hole.deviation.toFixed(3))]);
        expect(summary).toEqual([
            [0.762, "drill", "drill-0.8", 0.038],
            [0.8, "drill", "drill-0.8", 0],
            [1.016, "drill", "drill-1.0", -0.016],
            [2, "mill", "cornmill-1.5", 0],
            [3, "mill", "cornmill-1.5", 0]
        ]);
        expect(advice.holes[0]?.deviationRatio).toBeCloseTo(0.0499, 3);
        // 0.762 and 0.8 share the 0.8 mm drill: one tool change saved
        expect(advice.changesSaved).toBe(1);
        expect(advice.groups.map((group) => [group.tool.id, group.holes.length])).toEqual([["drill-0.8", 2], ["drill-1.0", 1]]);
    });

    it("flags drills beyond tolerance and holes without any tool", () =>
    {
        const onlyBigDrill: Tool[] = defaultLibrary().filter((tool) => tool.id === "drill-1.2");
        const advice = recommendDrilling(onlyBigDrill, board([], [[0.6, 1], [5, 1]]));
        expect(advice.holes[0]).toMatchObject({ method: "drill", outOfTolerance: true });
        expect(advice.holes[1]).toMatchObject({ method: "none", tool: null });
        expect(recommendDrilling([], board([], [[1, 1]])).holes[0]?.method).toBe("none");
    });
});

describe("cutout recommendation", () =>
{
    it("prefers the cutout mill and counts passes from the board thickness", () =>
    {
        const advice = recommendCutout(defaultLibrary(), board([]));
        expect(advice.map((entry) => [entry.tool.id, entry.passes, entry.recommended])).toEqual([
            ["cornmill-1.5", 5, true],
            ["endmill-0.8", 17, false]
        ]);
        expect(recommendCutout(defaultLibrary(), board([], [], 0.8))[0]?.passes).toBe(3);
        expect(recommendCutout([], board([]))).toEqual([]);
    });
});

describe("FTDI_Max board", () =>
{
    it("finds the 0.4 mm design clearance and the 0.254 mm tracks, and rates the built-in tools", () =>
    {
        const document = parseGerber(readFileSync(join(FIXTURES, "proteus/ftdi-max-bottom-copper.gbr"), "utf8"));
        const analysis = analyzeCopper(buildGerberGeometry(document).copper, document);
        expect(analysis.spots[0]?.distance).toBeGreaterThan(0.395 * MM);
        expect(analysis.spots[0]?.distance).toBeLessThan(0.405 * MM);
        expect(analysis.minTrack?.width).toBe(0.254 * MM);

        const drills = drillFromGerber(parseGerber(readFileSync(join(FIXTURES, "proteus/ftdi-max-drill-plated.gbr"), "utf8")));
        const summary = summarizeBoard([{ id: "bottom", analysis }], [{ summary: drillSummary(drills) }]);
        expect(summary.holes.map((hole) => [hole.diameter / MM, hole.count])).toEqual([[0.762, 12], [1.016, 27], [3, 2]]);
        const isolation = recommendIsolation(defaultLibrary(), summary);
        expect(isolation.map((entry) => [entry.tool.id, entry.status])).toEqual([
            ["vbit-30-0.2", "suitable"], ["vbit-20-0.1", "suitable"], ["endmill-0.8", "tooWide"]
        ]);
    });
});
