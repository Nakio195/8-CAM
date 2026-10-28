import { describe, expect, it } from "vitest";
import {
    autoTabs,
    boardEdge,
    cutoutContour,
    cutoutMoves,
    DEFAULT_CUTOUT,
    planCutout,
    pointAt,
    projectOnPath,
    tabMarks
} from "@cam/cutout/index";
import { checkMoves, moveStatistics, type Move } from "@cam/toolpath/index";
import { defaultLibrary, type Tool } from "@cam/tools/index";
import {
    bboxOfPaths,
    circlePath,
    distanceToRings,
    isCounterClockwise,
    pathLength,
    polygonArea,
    rectanglePath,
    strokePolylines,
    type Point,
    type Polygon
} from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";

const MM = mmToInternal(1);
const BOARD: Polygon = { outer: rectanglePath(0, 0, 50 * MM, 30 * MM), holes: [] };
const BOX = { minX: 0, minY: 0, maxX: 50 * MM, maxY: 30 * MM };

function mill(): Tool
{
    const tool = defaultLibrary().find((entry) => entry.id === "cornmill-1.5");
    if (!tool)
    {
        throw new Error("Missing tool");
    }
    return tool;
}

describe("board edge", () =>
{
    it("takes the middle of an outline drawn as a line", () =>
    {
        const corners = rectanglePath(0, 0, 50 * MM, 30 * MM);
        const outline = strokePolylines([[...corners, corners[0] as Point]], 0.15 * MM);
        const edge = boardEdge(outline);
        expect(edge).not.toBeNull();
        const area = polygonArea(edge as Polygon);
        expect(area / (50 * 30 * MM * MM)).toBeCloseTo(1, 3);
        // Every point of the edge is on the drawn centre line (within 1 µm)
        for (const point of (edge as Polygon).outer)
        {
            expect(distanceToRings(point, [corners])).toBeLessThan(0.001 * MM);
        }
    });

    it("keeps a filled outline as it is and ignores an empty layer", () =>
    {
        expect(boardEdge([BOARD])?.outer).toEqual(BOARD.outer);
        expect(boardEdge([])).toBeNull();
    });
});

describe("cutout contour", () =>
{
    it("follows the board at the tool radius plus the margin, around it", () =>
    {
        const contour = cutoutContour(BOARD, BOX, { mode: "shape", margin: 0.5, direction: "conventional" }, 1.5);
        for (const point of contour)
        {
            expect(distanceToRings(point, [BOARD.outer]) / MM).toBeCloseTo(1.25, 3);
        }
        // Conventional milling: clockwise around the board; climb: counter-clockwise
        expect(isCounterClockwise(contour)).toBe(false);
        expect(isCounterClockwise(cutoutContour(BOARD, BOX, { mode: "shape", margin: 0.5, direction: "climb" }, 1.5))).toBe(true);
    });

    it("uses the bounding rectangle, of the outline or of the copper without outline", () =>
    {
        const round: Polygon = { outer: circlePath({ x: 0, y: 0 }, 10 * MM), holes: [] };
        const rectangle = cutoutContour(round, BOX, { mode: "rectangle", margin: 1, direction: "climb" }, 2);
        expect(rectangle).toHaveLength(4);
        expect(bboxOfPaths([rectangle]).maxX / MM).toBeCloseTo(12, 3);
        const fallback = cutoutContour(null, BOX, { mode: "shape", margin: 2, direction: "climb" }, 2);
        expect(bboxOfPaths([fallback])).toEqual({ minX: -3 * MM, minY: -3 * MM, maxX: 53 * MM, maxY: 33 * MM });
    });
});

describe("tabs", () =>
{
    const contour = cutoutContour(BOARD, BOX, DEFAULT_CUTOUT, 1.5);
    const gap = (2 + 1.5) * MM;

    it("fall in the middle of the sides of a rectangular board", () =>
    {
        const four = autoTabs(contour, 4, gap);
        // The contour runs 0.75 mm (tool radius) outside the 50 x 30 mm board
        const middles = four.map((point) => `${Math.round(point.x / MM * 100) / 100},${Math.round(point.y / MM * 100) / 100}`).sort();
        expect(middles).toEqual(["-0.75,15", "25,-0.75", "25,30.75", "50.75,15"]);
        // Two tabs: in the middle of the two long sides
        expect(autoTabs(contour, 2, gap).map((point) => Math.round(point.x / MM))).toEqual([25, 25]);
        expect(autoTabs(contour, 0, gap)).toEqual([]);
    });

    it("are spread evenly around a round board", () =>
    {
        const circle = cutoutContour({ outer: circlePath({ x: 0, y: 0 }, 20 * MM), holes: [] }, BOX, DEFAULT_CUTOUT, 1.5);
        const tabs = autoTabs(circle, 3, gap);
        const total = pathLength(circle, true);
        const positions = tabs.map((point) => projectOnPath(circle, point).s).sort((a, b) => a - b);
        expect(((positions[1] ?? 0) - (positions[0] ?? 0)) / total).toBeCloseTo(1 / 3, 2);
        expect(((positions[2] ?? 0) - (positions[1] ?? 0)) / total).toBeCloseTo(1 / 3, 2);
    });

    it("slide off rounded corners onto a straight edge", () =>
    {
        // With 8 tabs, some targets fall on the rounded corners: every tab still ends on a straight side
        for (const point of autoTabs(contour, 8, gap))
        {
            const onSide = Math.abs(point.x / MM - -0.75) < 0.01 || Math.abs(point.x / MM - 50.75) < 0.01
                || Math.abs(point.y / MM - -0.75) < 0.01 || Math.abs(point.y / MM - 30.75) < 0.01;
            expect(onSide).toBe(true);
        }
    });
});

describe("cutout plan and moves", () =>
{
    const tool = mill();
    const contour = cutoutContour(BOARD, BOX, DEFAULT_CUTOUT, tool.diameter);
    const gap = (DEFAULT_CUTOUT.tabWidth + tool.diameter) * MM;

    it("starts between two tabs and leaves a gap of tab width plus tool diameter at each tab", () =>
    {
        const plan = planCutout(contour, autoTabs(contour, 4, gap), DEFAULT_CUTOUT, tool);
        expect(plan.issues).toEqual([]);
        expect(plan.gaps).toHaveLength(4);
        for (const [low, high] of plan.gaps)
        {
            expect(high - low).toBeCloseTo(gap, 0);
            expect(low).toBeGreaterThan(0);
        }
        expect(plan.depths.map((depth) => Math.round(depth * 1000) / 1000)).toEqual([0.4, 0.8, 1.2, 1.6, 1.7]);
        expect(plan.tabTop).toBeCloseTo(-1.1, 9);
        expect(tabMarks(plan, 2, tool.diameter)).toHaveLength(4);
    });

    it("rises over the tabs in the passes deeper than their top only", () =>
    {
        const plan = planCutout(contour, autoTabs(contour, 4, gap), DEFAULT_CUTOUT, tool);
        const moves = cutoutMoves(plan, tool);
        expect(checkMoves(moves, tool.travelZ, tool.safeZ)).toEqual([]);
        const zMoves = moves.filter((move): move is Extract<Move, { kind: "linear" }> => move.kind === "linear" && move.x === undefined)
            .map((move) => Math.round((move.z ?? 0) * 1000) / 1000);
        // Passes at 1.2, 1.6 and 1.7 mm are below the tab top (1.1 mm): up and down at each of the 4 tabs
        expect(zMoves.filter((z) => z === -1.1)).toHaveLength(3 * 4);
        expect(Math.min(...zMoves)).toBe(-1.7);
        // Five laps of the contour at the XY feed, plus the plunges
        const stats = moveStatistics(moves, 1000, { x: 0, y: 0, z: tool.safeZ });
        const lap = pathLength(contour, true) / MM;
        expect(stats.cutLength).toBeGreaterThan(5 * lap);
        expect(stats.cutLength).toBeLessThan(5 * lap + 20);
    });

    it("reports tabs that cannot be made", () =>
    {
        const codes = (points: Point[], params = DEFAULT_CUTOUT): string[] => planCutout(contour, points, params, tool).issues.map((issue) => issue.code);
        expect(codes([])).toEqual(["noTabs"]);
        expect(codes(autoTabs(contour, 4, gap), { ...DEFAULT_CUTOUT, tabHeight: 2 })).toEqual(["tabTooHigh"]);
        const first = pointAt(contour, 10 * MM);
        const close = pointAt(contour, 11 * MM);
        expect(codes([first, close])).toEqual(["tabsOverlap"]);
        expect(codes(autoTabs(contour, 60, gap))).toEqual(["tabsTooMany"]);
    });
});
