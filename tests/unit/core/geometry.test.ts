import { describe, expect, it } from "vitest";
import {
    arcBetween,
    arcPoints,
    arcSegmentCount,
    arcSweep,
    bboxHeight,
    bboxIntersects,
    bboxOfPaths,
    bboxOfPolygons,
    bboxWidth,
    circlePath,
    DEFAULT_ARC_TOLERANCE,
    distance,
    distanceToRings,
    distanceToSegment,
    emptyBBox,
    inflateBBox,
    isCounterClockwise,
    isEmptyBBox,
    mergeBBoxes,
    MIN_SEGMENTS_PER_CIRCLE,
    normalizePolygon,
    pathLength,
    polygonArea,
    rectanglePath,
    signedArea,
    totalArea,
    translatePath,
    withOrientation,
    type Point
} from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";

const MM = mmToInternal(1);

describe("paths", () =>
{
    const square = rectanglePath(0, 0, 10, 10);

    it("computes signed area and orientation", () =>
    {
        expect(signedArea(square)).toBe(100);
        expect(isCounterClockwise(square)).toBe(true);
        const reversed = [...square].reverse();
        expect(signedArea(reversed)).toBe(-100);
        expect(isCounterClockwise(reversed)).toBe(false);
    });

    it("reorients rings only when needed", () =>
    {
        expect(withOrientation(square, true)).toBe(square);
        expect(isCounterClockwise(withOrientation(square, false))).toBe(false);
    });

    it("normalizes polygons and subtracts hole areas", () =>
    {
        const polygon = normalizePolygon({
            outer: [...square].reverse(),
            holes: [rectanglePath(2, 2, 4, 4)]
        });
        expect(isCounterClockwise(polygon.outer)).toBe(true);
        expect(isCounterClockwise(polygon.holes[0] ?? [])).toBe(false);
        expect(polygonArea(polygon)).toBe(96);
        expect(totalArea([polygon, { outer: square, holes: [] }])).toBe(196);
    });

    it("measures lengths and distances", () =>
    {
        expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
        expect(pathLength(square)).toBe(30);
        expect(pathLength(square, true)).toBe(40);
        expect(pathLength([{ x: 1, y: 1 }], true)).toBe(0);
    });

    it("translates paths without mutating them", () =>
    {
        const moved = translatePath(square, 5, -5);
        expect(moved[0]).toEqual({ x: 5, y: -5 });
        expect(square[0]).toEqual({ x: 0, y: 0 });
    });
});

describe("bounding boxes", () =>
{
    it("starts empty and grows with paths", () =>
    {
        const box = emptyBBox();
        expect(isEmptyBBox(box)).toBe(true);
        expect(bboxWidth(box)).toBe(0);
        expect(bboxHeight(box)).toBe(0);

        const paths = [rectanglePath(-5, 0, 5, 2), [{ x: 1, y: 8 }]];
        expect(bboxOfPaths(paths)).toEqual({ minX: -5, minY: 0, maxX: 5, maxY: 8 });
        expect(bboxOfPolygons([{ outer: rectanglePath(1, 2, 3, 4), holes: [] }]))
            .toEqual({ minX: 1, minY: 2, maxX: 3, maxY: 4 });
    });

    it("merges, inflates and intersects", () =>
    {
        const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
        const b = { minX: 20, minY: -5, maxX: 30, maxY: 5 };
        expect(mergeBBoxes(a, b)).toEqual({ minX: 0, minY: -5, maxX: 30, maxY: 10 });
        expect(inflateBBox(a, 2)).toEqual({ minX: -2, minY: -2, maxX: 12, maxY: 12 });
        expect(bboxWidth(a)).toBe(10);
        expect(bboxHeight(b)).toBe(10);
        expect(bboxIntersects(a, b)).toBe(false);
        expect(bboxIntersects(inflateBBox(a, 10), b)).toBe(true);
    });
});

/** Largest distance from any chord midpoint to the true circle. */
function maxChordError(points: Point[], center: Point, radius: number, closed: boolean): number
{
    let error = 0;
    const count = closed ? points.length : points.length - 1;
    for (let i = 0; i < count; i++)
    {
        const a = points[i] as Point;
        const b = points[(i + 1) % points.length] as Point;
        const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        error = Math.max(error, Math.abs(radius - distance(middle, center)));
    }
    return error;
}

describe("arcs", () =>
{
    const center = { x: 0, y: 0 };

    it("adapts the segment count to the radius", () =>
    {
        const small = arcSegmentCount(0.1 * MM, 2 * Math.PI);
        const large = arcSegmentCount(10 * MM, 2 * Math.PI);
        expect(small).toBeGreaterThanOrEqual(MIN_SEGMENTS_PER_CIRCLE);
        expect(large).toBeGreaterThan(small);
        expect(arcSegmentCount(0, Math.PI)).toBe(1);
        expect(arcSegmentCount(MM, 0)).toBe(1);
        // A radius below the tolerance still gets the minimum count
        expect(arcSegmentCount(10, 2 * Math.PI)).toBe(MIN_SEGMENTS_PER_CIRCLE);
    });

    it("keeps circles within the chord tolerance", () =>
    {
        for (const radiusMm of [0.127, 0.8, 3.175, 25])
        {
            const radius = radiusMm * MM;
            const circle = circlePath(center, radius);
            expect(isCounterClockwise(circle)).toBe(true);
            // Rounding to integers adds at most one unit to the chord error
            expect(maxChordError(circle, center, radius, true)).toBeLessThanOrEqual(DEFAULT_ARC_TOLERANCE + 1);
            const area = Math.abs(signedArea(circle));
            // Inscribed polygon: the missing area is at most a band of width tolerance along the perimeter
            const missing = Math.PI * radius * radius - area;
            expect(missing).toBeGreaterThanOrEqual(0);
            expect(missing).toBeLessThanOrEqual(2 * Math.PI * radius * (DEFAULT_ARC_TOLERANCE + 1));
        }
    });

    it("generates arc points from an angle and a sweep", () =>
    {
        const points = arcPoints(center, MM, 0, Math.PI / 2);
        expect(points[0]).toEqual({ x: MM, y: 0 });
        expect(points[points.length - 1]).toEqual({ x: 0, y: MM });
    });

    it("computes the sweep of G02 / G03 arcs", () =>
    {
        const start = { x: MM, y: 0 };
        const end = { x: 0, y: MM };
        expect(arcSweep(start, end, center, false)).toBeCloseTo(Math.PI / 2);
        expect(arcSweep(start, end, center, true)).toBeCloseTo(-3 * Math.PI / 2);
        expect(arcSweep(end, start, center, true)).toBeCloseTo(-Math.PI / 2);
        expect(arcSweep(end, start, center, false)).toBeCloseTo(3 * Math.PI / 2);
        expect(arcSweep(start, start, center, false)).toBeCloseTo(2 * Math.PI);
        expect(arcSweep(start, start, center, true)).toBeCloseTo(-2 * Math.PI);
        expect(arcSweep(start, start, center, true, false)).toBe(0);
    });

    it("keeps exact end points between two points", () =>
    {
        const start = { x: 3 * MM, y: 0 };
        const end = { x: -3 * MM, y: 1 };
        const path = arcBetween(start, end, center, false);
        expect(path[0]).toEqual(start);
        expect(path[path.length - 1]).toEqual(end);
        // Counter-clockwise from (3, 0) to (-3, 0) passes through the top
        expect(path.every((point) => point.y >= 0)).toBe(true);
        expect(maxChordError(path, center, 3 * MM, false)).toBeLessThanOrEqual(DEFAULT_ARC_TOLERANCE + 1);

        const clockwise = arcBetween(start, end, center, true);
        expect(clockwise.slice(1, -1).every((point) => point.y < 0)).toBe(true);
    });

    it("draws full circles when start and end coincide", () =>
    {
        const start = { x: 2 * MM, y: 0 };
        const full = arcBetween(start, start, center, true);
        expect(full.length).toBeGreaterThan(MIN_SEGMENTS_PER_CIRCLE);
        expect(isCounterClockwise(full)).toBe(false);
        expect(arcBetween(start, start, center, true, DEFAULT_ARC_TOLERANCE, false)).toEqual([start, start]);
    });

    it("interpolates slightly different start and end radii", () =>
    {
        const start = { x: 2 * MM, y: 0 };
        const end = { x: 0, y: 2 * MM + 200 };
        const path = arcBetween(start, end, center, false);
        const middle = path[Math.floor(path.length / 2)] as Point;
        const radius = distance(middle, center);
        expect(radius).toBeGreaterThan(2 * MM);
        expect(radius).toBeLessThan(2 * MM + 200);
    });
});

describe("distances to edges", () =>
{
    it("measures the distance to segments and rings", () =>
    {
        expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
        expect(distanceToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
        expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
        expect(distanceToRings({ x: 5, y: 5 }, [rectanglePath(0, 0, 10, 10)])).toBe(5);
        expect(distanceToRings({ x: 5, y: 5 }, [])).toBe(Infinity);
    });
});
