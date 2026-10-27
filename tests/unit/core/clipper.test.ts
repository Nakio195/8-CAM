import { describe, expect, it } from "vitest";
import {
    circlePath,
    clipToBox,
    DEFAULT_ARC_TOLERANCE,
    differencePolygons,
    distance,
    intersectPolygons,
    isCounterClockwise,
    offsetPolygons,
    polygonArea,
    polygonRings,
    polygonsFromRings,
    rectanglePath,
    strokePolylines,
    totalArea,
    unionPolygons,
    type Polygon
} from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";

const MM = mmToInternal(1);
/** 1 µm, the precision target of the specification (section 8). */
const MICRON = mmToInternal(0.001);

function square(minX: number, minY: number, size: number): Polygon
{
    return { outer: rectanglePath(minX, minY, minX + size, minY + size), holes: [] };
}

/** Rounded parts are drawn with chords: at most a band of width tolerance along a full circle is missing. */
function expectArcArea(area: number, expected: number, radius: number): void
{
    expect(area).toBeLessThanOrEqual(expected);
    expect(expected - area).toBeLessThanOrEqual(2 * Math.PI * radius * (DEFAULT_ARC_TOLERANCE + 1));
}

function radiusRange(polygon: Polygon, center = { x: 0, y: 0 }): [number, number]
{
    const radii = polygon.outer.map((point) => distance(point, center));
    return [Math.min(...radii), Math.max(...radii)];
}

describe("boolean operations", () =>
{
    it("merges overlapping polygons", () =>
    {
        const result = unionPolygons([square(0, 0, 10 * MM), square(5 * MM, 5 * MM, 10 * MM)]);
        expect(result).toHaveLength(1);
        expect(totalArea(result)).toBe(175 * MM * MM);
        expect(isCounterClockwise(result[0]?.outer ?? [])).toBe(true);
    });

    it("keeps disjoint polygons apart", () =>
    {
        const result = unionPolygons([square(0, 0, MM), square(5 * MM, 0, MM)]);
        expect(result).toHaveLength(2);
    });

    it("accepts polygons of any orientation", () =>
    {
        const clockwise = { outer: [...rectanglePath(0, 0, MM, MM)].reverse(), holes: [] };
        expect(totalArea(unionPolygons([clockwise]))).toBe(MM * MM);
    });

    it("creates holes with the normalised orientation", () =>
    {
        const result = differencePolygons([square(0, 0, 30 * MM)], [square(10 * MM, 10 * MM, 10 * MM)]);
        expect(result).toHaveLength(1);
        const polygon = result[0] as Polygon;
        expect(polygon.holes).toHaveLength(1);
        expect(isCounterClockwise(polygon.outer)).toBe(true);
        expect(isCounterClockwise(polygon.holes[0] ?? [])).toBe(false);
        expect(polygonArea(polygon)).toBe(800 * MM * MM);
    });

    it("returns islands inside holes as separate polygons", () =>
    {
        const frame = differencePolygons([square(0, 0, 30 * MM)], [square(10 * MM, 10 * MM, 10 * MM)]);
        const result = unionPolygons([...frame, square(13 * MM, 13 * MM, 4 * MM)]);
        expect(result).toHaveLength(2);
        expect(totalArea(result)).toBe(816 * MM * MM);
    });

    it("intersects polygons", () =>
    {
        const result = intersectPolygons([square(0, 0, 10 * MM)], [square(5 * MM, 5 * MM, 10 * MM)]);
        expect(totalArea(result)).toBe(25 * MM * MM);
        expect(intersectPolygons([square(0, 0, MM)], [square(5 * MM, 0, MM)])).toEqual([]);
    });

    it("builds polygons from raw rings with the even-odd rule", () =>
    {
        const outer = rectanglePath(0, 0, 10 * MM, 10 * MM);
        const inner = rectanglePath(2 * MM, 2 * MM, 8 * MM, 8 * MM);
        const result = polygonsFromRings([outer, inner]);
        expect(result).toHaveLength(1);
        expect(result[0]?.holes).toHaveLength(1);
        // Same orientation with nonzero: the inner ring is not a hole
        expect(polygonsFromRings([outer, inner], "nonzero")[0]?.holes).toHaveLength(0);
    });
});

describe("offsets", () =>
{
    it("grows a circle by the exact offset within 1 µm", () =>
    {
        const disc = { outer: circlePath({ x: 0, y: 0 }, 0.8 * MM), holes: [] };
        const result = offsetPolygons([disc], 0.1 * MM);
        expect(result).toHaveLength(1);
        const [minRadius, maxRadius] = radiusRange(result[0] as Polygon);
        expect(Math.abs(minRadius - 0.9 * MM)).toBeLessThan(MICRON);
        expect(Math.abs(maxRadius - 0.9 * MM)).toBeLessThan(MICRON);
    });

    it("rounds the corners of a grown square", () =>
    {
        const size = 2 * MM;
        const delta = 0.5 * MM;
        const result = offsetPolygons([square(0, 0, size)], delta);
        const expected = size * size + 4 * size * delta + Math.PI * delta * delta;
        expectArcArea(totalArea(result), expected, delta);
    });

    it("keeps square corners with the miter join", () =>
    {
        const result = offsetPolygons([square(0, 0, 2 * MM)], 0.5 * MM, { join: "miter" });
        expect(totalArea(result)).toBe(9 * MM * MM);
    });

    it("bevels corners with the square join", () =>
    {
        const area = totalArea(offsetPolygons([square(0, 0, 2 * MM)], 0.5 * MM, { join: "square" }));
        expect(area).toBeGreaterThan(2 * 2 * MM * MM + 4 * MM * MM);
        expect(area).toBeLessThan(9 * MM * MM);
    });

    it("merges shapes that touch after growing", () =>
    {
        const pads = [square(0, 0, MM), square(1.3 * MM, 0, MM)];
        expect(offsetPolygons(pads, 0.1 * MM)).toHaveLength(2);
        expect(offsetPolygons(pads, 0.2 * MM)).toHaveLength(1);
    });

    it("shrinks holes when the polygon grows", () =>
    {
        const frame = differencePolygons([square(0, 0, 10 * MM)], [square(4 * MM, 4 * MM, 2 * MM)]);
        const grown = offsetPolygons(frame, 0.5 * MM, { join: "miter" });
        expect(grown[0]?.holes).toHaveLength(1);
        expect(polygonArea(grown[0] as Polygon)).toBe((11 * 11 - 1) * MM * MM);
        // A hole narrower than twice the offset closes completely
        expect(offsetPolygons(frame, 1.1 * MM)[0]?.holes).toHaveLength(0);
    });

    it("removes features thinner than twice a negative offset", () =>
    {
        const track = { outer: rectanglePath(0, 0, 10 * MM, 0.2 * MM), holes: [] };
        expect(offsetPolygons([track], -0.15 * MM)).toEqual([]);
        expect(offsetPolygons([track], -0.05 * MM)).toHaveLength(1);
    });

    it("returns the merged input for a zero offset", () =>
    {
        expect(totalArea(offsetPolygons([square(0, 0, MM), square(0, 0, MM)], 0))).toBe(MM * MM);
    });

    it("handles 1 m boards without overflow", () =>
    {
        const result = offsetPolygons([square(-500 * MM, -500 * MM, 1000 * MM)], 10 * MM, { join: "miter" });
        expect(totalArea(result)).toBe(1020 * 1020 * MM * MM);
    });
});

describe("strokes", () =>
{
    it("draws a track with round ends", () =>
    {
        const width = 0.254 * MM;
        const length = 10 * MM;
        const result = strokePolylines([[{ x: 0, y: 0 }, { x: length, y: 0 }]], width);
        expect(result).toHaveLength(1);
        const expected = length * width + Math.PI * (width / 2) ** 2;
        expectArcArea(totalArea(result), expected, width / 2);
    });

    it("supports butt and square ends", () =>
    {
        const line = [[{ x: 0, y: 0 }, { x: 10 * MM, y: 0 }]];
        expect(totalArea(strokePolylines(line, MM, { end: "butt" }))).toBe(10 * MM * MM);
        expect(totalArea(strokePolylines(line, MM, { end: "square", join: "miter" }))).toBe(11 * MM * MM);
    });

    it("turns a single point into a disc", () =>
    {
        const result = strokePolylines([[{ x: 0, y: 0 }]], 2 * MM);
        expect(result).toHaveLength(1);
        const [minRadius, maxRadius] = radiusRange(result[0] as Polygon);
        expect(minRadius).toBeGreaterThan(MM - MICRON);
        expect(maxRadius).toBeLessThan(MM + MICRON);
    });

    it("ignores empty input and zero widths", () =>
    {
        expect(strokePolylines([], MM)).toEqual([]);
        expect(strokePolylines([[{ x: 0, y: 0 }, { x: MM, y: 0 }]], 0)).toEqual([]);
    });

    it("lists every ring of the polygons", () =>
    {
        const frame = differencePolygons([square(0, 0, 10 * MM)], [square(4 * MM, 4 * MM, 2 * MM)]);
        expect(polygonRings([...frame, square(20 * MM, 0, MM)])).toHaveLength(3);
    });
});

describe("clipping to a box", () =>
{
    it("keeps the part inside the box, holes included", () =>
    {
        const frame = differencePolygons([square(0, 0, 10 * MM)], [square(4 * MM, 4 * MM, 2 * MM)]);
        const clipped = clipToBox(frame, { minX: 3 * MM, minY: 3 * MM, maxX: 7 * MM, maxY: 7 * MM });
        expect(clipped).toHaveLength(1);
        expect(clipped[0]?.holes).toHaveLength(1);
        expect(totalArea(clipped)).toBe(12 * MM * MM);
        expect(clipToBox(frame, { minX: 20 * MM, minY: 0, maxX: 30 * MM, maxY: 10 * MM })).toEqual([]);
        expect(clipToBox(frame, { minX: 5, minY: 5, maxX: 5, maxY: 9 })).toEqual([]);
    });
});
