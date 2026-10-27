import { describe, expect, it } from "vitest";
import {
    checkMoves,
    moveStatistics,
    orderSegments,
    segmentsToMoves,
    travelLength,
    type CutParameters,
    type Move,
    type ToolpathSegment
} from "@cam/toolpath/index";
import { rectanglePath } from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";

const MM = mmToInternal(1);

function square(x: number, y: number, size = 1): ToolpathSegment
{
    return { points: rectanglePath(x * MM, y * MM, (x + size) * MM, (y + size) * MM), closed: true };
}

const CUT: CutParameters = {
    toolId: "vbit", cutDepth: 0.2, depthPerPass: 0.1, feedXY: 150, feedZ: 50, spindleSpeed: 10_000, travelZ: 2, safeZ: 15
};

describe("segment ordering", () =>
{
    it("visits the nearest segment first and enters loops at their closest vertex", () =>
    {
        const far = square(50, 0);
        const near = square(10, 0);
        const middle = square(30, 0);
        const ordered = orderSegments([far, near, middle]);
        expect(ordered.map((segment) => segment.points[0]?.x)).toEqual([10 * MM, 30 * MM, 50 * MM]);
        // Entered at the vertex nearest to the previous position, the loop keeps its direction
        const second = orderSegments([square(0, 0), { points: rectanglePath(0, 3 * MM, 2 * MM, 5 * MM), closed: true }]);
        expect(second[1]?.points[0]).toEqual({ x: 0, y: 3 * MM });
        expect(second[1]?.points).toHaveLength(4);
    });

    it("reverses open paths when their far end is closer", () =>
    {
        const ordered = orderSegments([{ points: [{ x: 10 * MM, y: 0 }, { x: MM, y: 0 }], closed: false }]);
        expect(ordered[0]?.points[0]).toEqual({ x: MM, y: 0 });
    });

    it("shortens the travel compared with the input order", () =>
    {
        const segments = [0, 40, 10, 30, 20].map((x) => square(x, 0));
        expect(travelLength(orderSegments(segments))).toBeLessThan(travelLength(segments));
        expect(orderSegments([])).toEqual([]);
    });
});

describe("moves", () =>
{
    it("cuts each loop at every depth between travel heights, safely", () =>
    {
        const moves = segmentsToMoves([square(0, 0)], CUT, "Isolation");
        expect(moves[0]).toEqual({ kind: "comment", text: "Isolation" });
        expect(moves.filter((move) => move.kind === "linear" && move.z !== undefined).map((move) => move.kind === "linear" && move.z))
            .toEqual([-0.1, -0.2]);
        expect(moves[moves.length - 1]).toEqual({ kind: "spindle", on: false });
        expect(checkMoves(moves, CUT.travelZ, CUT.safeZ)).toEqual([]);
    });

    it("cuts open paths back and forth", () =>
    {
        const moves = segmentsToMoves([{ points: [{ x: 0, y: 0 }, { x: MM, y: 0 }], closed: false }], CUT);
        const xs = moves.filter((move): move is Extract<Move, { kind: "linear" }> => move.kind === "linear" && move.x !== undefined)
            .map((move) => move.x);
        expect(xs).toEqual([1, 0]);
    });

    it("measures lengths and estimates the duration", () =>
    {
        const moves = segmentsToMoves([square(0, 0, 10)], CUT);
        const stats = moveStatistics(moves, 1000, { x: 0, y: 0, z: 15 });
        // Two laps of 40 mm plus two plunges of 0.1 mm and 2 mm from travel height
        expect(stats.cutLength).toBeCloseTo(80 + 2.2, 6);
        expect(stats.plunges).toBe(2);
        expect(stats.duration).toBeCloseTo((80 / 150 + 2.2 / 50 + stats.rapidLength / 1000) * 60, 6);
    });

    it("measures arcs and dwells", () =>
    {
        const stats = moveStatistics([
            { kind: "arc", cw: false, x: -1, y: 0, i: -1, j: 0, feed: 60 },
            { kind: "dwell", seconds: 2 }
        ], 1000, { x: 1, y: 0, z: 0 });
        expect(stats.cutLength).toBeCloseTo(Math.PI, 6);
        expect(stats.duration).toBeCloseTo(Math.PI + 2, 6);
    });

    it("reports unsafe moves", () =>
    {
        const reasons = (moves: Move[]): string[] => checkMoves(moves, 2, 15).map((issue) => issue.reason);
        expect(reasons([{ kind: "rapid", z: 1 }, { kind: "rapid", x: 5 }, { kind: "rapid", z: 15 }])).toEqual(["rapidBelowTravel"]);
        expect(reasons([{ kind: "rapid", z: -0.1 }, { kind: "rapid", z: 15 }])).toEqual(["rapidIntoMaterial"]);
        expect(reasons([{ kind: "rapid", z: 2 }, { kind: "toolChange", toolId: "x" }, { kind: "rapid", z: 15 }])).toEqual(["toolChangeBelowSafe"]);
        expect(reasons([{ kind: "linear", z: -0.1, feed: 50 }])).toEqual(["endBelowSafe"]);
        expect(reasons([{ kind: "arc", cw: true, x: 1, y: 1, i: 1, j: 0, feed: 10 }])).toEqual([]);
    });
});

describe("direct duration estimate", () =>
{
    it("matches the statistics of the generated moves", async () =>
    {
        const { estimateDuration } = await import("@cam/toolpath/index");
        const segments: ToolpathSegment[] = [
            square(3, 4, 2),
            { points: [{ x: 10 * MM, y: 0 }, { x: 14 * MM, y: 3 * MM }, { x: 20 * MM, y: 3 * MM }], closed: false },
            square(-5, 2, 1)
        ];
        for (const depthPerPass of [0.2, 0.1, 0.07])
        {
            const cut = { ...CUT, depthPerPass };
            const expected = moveStatistics(segmentsToMoves(segments, cut), 1000, { x: 0, y: 0, z: cut.safeZ }).duration;
            expect(estimateDuration(segments, cut, 1000)).toBeCloseTo(expected, 6);
        }
        expect(estimateDuration([], CUT, 1000)).toBe(0);
    });
});
