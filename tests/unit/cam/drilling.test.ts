import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    DEFAULT_DRILLING,
    drillingMoves,
    nearestNeighbourOrder,
    planDrilling,
    routeLength,
    twoOpt,
    type HoleSet
} from "@cam/drilling/index";
import { checkMoves, moveStatistics, type Move } from "@cam/toolpath/index";
import { defaultLibrary, type Tool } from "@cam/tools/index";
import type { Point } from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";
import { importFile } from "@workers/importer";

const MM = mmToInternal(1);

function tool(id: string): Tool
{
    const found = defaultLibrary().find((entry) => entry.id === id);
    if (!found)
    {
        throw new Error(`Missing tool ${id}`);
    }
    return found;
}

/** Small deterministic generator so every run uses the same points. */
function random(seed: number): () => number
{
    let state = seed;
    return () =>
    {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
}

function randomPoints(count: number, seed: number): Point[]
{
    const next = random(seed);
    return Array.from({ length: count }, () => ({ x: Math.round(next() * 100 * MM), y: Math.round(next() * 100 * MM) }));
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean
{
    const side = (p: Point, q: Point, r: Point): number => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

function crossings(route: readonly Point[], start: Point): number
{
    const points = [start, ...route];
    let count = 0;
    for (let i = 0; i + 1 < points.length; i++)
    {
        for (let j = i + 2; j + 1 < points.length; j++)
        {
            if (segmentsCross(points[i] as Point, points[i + 1] as Point, points[j] as Point, points[j + 1] as Point))
            {
                count++;
            }
        }
    }
    return count;
}

const ORIGIN = { x: 0, y: 0 };

describe("hole order", () =>
{
    it("visits the nearest hole first", () =>
    {
        const points = [{ x: 30, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 5, y: 1 }];
        expect(nearestNeighbourOrder(points, ORIGIN)).toEqual([3, 1, 2, 0]);
        expect(nearestNeighbourOrder([], ORIGIN)).toEqual([]);
    });

    it("finds the same order as a brute force nearest neighbour search", () =>
    {
        const points = randomPoints(400, 3);
        const order = nearestNeighbourOrder(points, ORIGIN);
        const expected: number[] = [];
        const left = new Set(points.map((_, index) => index));
        let position = ORIGIN;
        while (left.size > 0)
        {
            let best = -1;
            let bestDistance = Infinity;
            for (const index of left)
            {
                const value = Math.hypot((points[index] as Point).x - position.x, (points[index] as Point).y - position.y);
                if (value < bestDistance)
                {
                    best = index;
                    bestDistance = value;
                }
            }
            left.delete(best);
            expected.push(best);
            position = points[best] as Point;
        }
        expect(order).toEqual(expected);
    });

    it("removes the crossings left by nearest neighbour and shortens the route", () =>
    {
        const points = randomPoints(300, 11);
        const nearest = nearestNeighbourOrder(points, ORIGIN);
        const improved = twoOpt(points, nearest, ORIGIN);
        const route = (order: number[]): Point[] => order.map((index) => points[index] as Point);
        expect([...improved].sort((a, b) => a - b)).toEqual(points.map((_, index) => index));
        expect(crossings(route(nearest), ORIGIN)).toBeGreaterThan(0);
        expect(crossings(route(improved), ORIGIN)).toBe(0);
        expect(routeLength(route(improved), ORIGIN)).toBeLessThan(0.95 * routeLength(route(nearest), ORIGIN));
    });

    it("comes close to the shortest route on small sets", () =>
    {
        const permutations = (items: number[]): number[][] => items.length <= 1
            ? [items]
            : items.flatMap((item, index) => permutations(items.filter((_, other) => other !== index)).map((rest) => [item, ...rest]));
        for (const seed of [1, 2, 3, 4, 5])
        {
            const points = randomPoints(7, seed);
            const length = (order: number[]): number => routeLength(order.map((index) => points[index] as Point), ORIGIN);
            const best = Math.min(...permutations(points.map((_, index) => index)).map(length));
            const found = length(twoOpt(points, nearestNeighbourOrder(points, ORIGIN), ORIGIN));
            expect(found).toBeGreaterThanOrEqual(best - 1e-6);
            expect(found).toBeLessThanOrEqual(1.1 * best);
        }
    });

    it("keeps two points or fewer as they are", () =>
    {
        expect(twoOpt([{ x: 1, y: 1 }, { x: 2, y: 2 }], [1, 0], ORIGIN)).toEqual([1, 0]);
    });
});

describe("drilling plan", () =>
{
    const holes = (count: number, y: number): Point[] => Array.from({ length: count }, (_, i) => ({ x: (i % 2 === 0 ? i : count - i) * MM, y: y * MM }));

    it("drills each hole size with its tool, smallest tool first, and measures the distance saved", () =>
    {
        const sets: HoleSet[] = [
            { diameter: 1.0 * MM, holes: holes(10, 10), slots: [], tool: tool("drill-1.0") },
            { diameter: 0.8 * MM, holes: holes(10, 5), slots: [], tool: tool("drill-0.8") },
            { diameter: 0.75 * MM, holes: [{ x: 5 * MM, y: 6 * MM }], slots: [], tool: tool("drill-0.8") }
        ];
        const plan = planDrilling(sets);
        expect(plan.runs.map((run) => run.tool.id)).toEqual(["drill-0.8", "drill-1.0"]);
        expect(plan.runs[0]?.hits).toHaveLength(11);
        expect(plan.runs[0]?.diameters).toEqual([0.75 * MM, 0.8 * MM]);
        expect(plan.issues).toEqual([]);
        expect(plan.distances.optimized).toBeLessThanOrEqual(plan.distances.nearest);
        // The file order zigzags along each row: the optimised order is much shorter
        expect(plan.distances.optimized).toBeLessThan(0.5 * plan.distances.file);
    });

    it("mills holes larger than the tool along a circle and reports what cannot be machined", () =>
    {
        const mill = tool("cornmill-1.5");
        const plan = planDrilling([
            { diameter: 3 * MM, holes: [{ x: 0, y: 0 }], slots: [], tool: mill },
            { diameter: 1 * MM, holes: [{ x: 5 * MM, y: 0 }], slots: [], tool: mill },
            { diameter: 2 * MM, holes: [{ x: 9 * MM, y: 0 }], slots: [], tool: null },
            { diameter: 1.2 * MM, holes: [{ x: 2 * MM, y: 2 * MM }], slots: [[{ x: 0, y: 0 }, { x: 3 * MM, y: 0 }]], tool: tool("drill-1.2") },
            { diameter: 1.2 * MM, holes: [], slots: [], tool: null }
        ]);
        expect(plan.runs.find((run) => run.method === "mill")?.milled).toEqual([{ centre: { x: 0, y: 0 }, radius: 0.75 * MM }]);
        expect(plan.issues.map((issue) => issue.code).sort()).toEqual(["noTool", "slotWithDrill", "toolTooLarge"]);
    });
});

describe("drilling moves", () =>
{
    const drill = tool("drill-0.8");
    const plan = planDrilling([{ diameter: 0.8 * MM, holes: [{ x: 0, y: 0 }, { x: 10 * MM, y: 0 }], slots: [], tool: drill }]);
    const plunges = (moves: Move[]): number[] => moves.flatMap((move) => (move.kind === "linear" && move.z !== undefined && move.x === undefined ? [move.z] : []));

    it("plunges once per hole in a simple cycle, safely", () =>
    {
        const moves = drillingMoves(plan, { ...DEFAULT_DRILLING, dwell: 0.5 });
        expect(plunges(moves)).toEqual([-1.8, -1.8]);
        expect(moves.filter((move) => move.kind === "dwell")).toHaveLength(2);
        expect(moves.filter((move) => move.kind === "toolChange")).toHaveLength(1);
        expect(checkMoves(moves, drill.travelZ, drill.safeZ)).toEqual([]);
        const stats = moveStatistics(moves, 1000, { x: 0, y: 0, z: drill.safeZ });
        expect(stats.duration).toBeGreaterThan((2 * (1.8 + drill.travelZ) / drill.feedZ) * 60);
    });

    it("pecks down step by step, lifting out of the hole in between", () =>
    {
        const moves = drillingMoves(plan, { ...DEFAULT_DRILLING, cycle: "peck", peckDepth: 0.6 });
        expect(plunges(moves).map((z) => Math.round(z * 1000) / 1000)).toEqual([-0.6, -1.2, -1.8, -0.6, -1.2, -1.8]);
        expect(checkMoves(moves, drill.travelZ, drill.safeZ)).toEqual([]);
    });

    it("follows a helix down to the depth inside milled holes", () =>
    {
        const mill = tool("cornmill-1.5");
        const milled = planDrilling([{ diameter: 3 * MM, holes: [{ x: 0, y: 0 }], slots: [[{ x: 10 * MM, y: 0 }, { x: 14 * MM, y: 0 }]], tool: mill }]);
        const moves = drillingMoves(milled, DEFAULT_DRILLING);
        expect(checkMoves(moves, mill.travelZ, mill.safeZ)).toEqual([]);
        const cuts = moves.filter((move): move is Extract<Move, { kind: "linear" }> => move.kind === "linear");
        // Every point of the helix is on the circle of radius (3 - 1.5) / 2 around the hole centre
        const onCircle = cuts.filter((move) => move.x !== undefined && move.z !== undefined && move.x < 5);
        expect(onCircle.length).toBeGreaterThan(8);
        for (const move of onCircle)
        {
            expect(Math.hypot(move.x ?? 0, move.y ?? 0)).toBeCloseTo(0.75, 5);
        }
        // It goes down steadily and ends at the full depth
        const depths = onCircle.map((move) => move.z ?? 0);
        expect(depths.every((z, index) => index === 0 || z <= (depths[index - 1] ?? 0) + 1e-9)).toBe(true);
        expect(Math.min(...depths)).toBeCloseTo(-DEFAULT_DRILLING.depth, 9);
        // The slot is cut back and forth along its path
        expect(cuts.some((move) => move.x === 14)).toBe(true);
    });
});

describe("FTDI_Max drill file", () =>
{
    it("orders the plated holes and saves travel compared with the file order", () =>
    {
        const text = readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "proteus", "ftdi-max-drill-plated.gbr"), "utf8");
        const drill = importFile("Drill.GBR", text).drill;
        if (!drill)
        {
            throw new Error("Missing drill data");
        }
        const library = defaultLibrary();
        const nearest = (diameter: number): Tool | null => library.filter((entry) => entry.type === "drill")
            .reduce<Tool | null>((best, entry) => (!best || Math.abs(entry.diameter * MM - diameter) < Math.abs(best.diameter * MM - diameter) ? entry : best), null);
        const sets: HoleSet[] = drill.tools.map((entry) => ({
            diameter: entry.diameter,
            holes: drill.hits.filter((hit) => hit.tool === entry.number).map((hit) => ({ x: hit.x, y: hit.y })),
            slots: [],
            tool: entry.diameter > 2 * MM ? tool("cornmill-1.5") : nearest(entry.diameter)
        }));
        const plan = planDrilling(sets);
        const holeCount = plan.runs.reduce((sum, run) => sum + run.hits.length + run.milled.length, 0);
        expect(holeCount).toBe(drill.hits.length);
        expect(plan.distances.optimized).toBeLessThan(plan.distances.file);
        expect(plan.distances.optimized).toBeLessThanOrEqual(plan.distances.nearest);
        expect(checkMoves(drillingMoves(plan, DEFAULT_DRILLING), 2, 15)).toEqual([]);
    });
});
