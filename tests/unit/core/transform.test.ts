import { describe, expect, it } from "vitest";
import {
    compose,
    convexHull,
    IDENTITY,
    isCounterClockwise,
    isIdentity,
    isMirroring,
    mirroring,
    rectanglePath,
    rotation,
    scaling,
    signedArea,
    transformPath,
    transformPoint,
    transformPolygons,
    translatePolygons,
    translation
} from "@core/geometry/index";

describe("transforms", () =>
{
    it("rotates exactly by quarter turns", () =>
    {
        expect(transformPoint({ x: 10, y: 0 }, rotation(90))).toEqual({ x: 0, y: 10 });
        expect(transformPoint({ x: 10, y: 0 }, rotation(180))).toEqual({ x: -10, y: 0 });
        expect(transformPoint({ x: 10, y: 0 }, rotation(-90))).toEqual({ x: 0, y: -10 });
        expect(transformPoint({ x: 10, y: 0 }, rotation(450))).toEqual({ x: 0, y: 10 });
        expect(rotation(90).a).toBe(0);
    });

    it("rotates by any angle", () =>
    {
        expect(transformPoint({ x: 1000, y: 0 }, rotation(45))).toEqual({ x: 707, y: 707 });
    });

    it("composes in application order", () =>
    {
        const moveThenRotate = compose(translation(10, 0), rotation(90));
        expect(transformPoint({ x: 0, y: 0 }, moveThenRotate)).toEqual({ x: 0, y: 10 });
        const rotateThenMove = compose(rotation(90), translation(10, 0));
        expect(transformPoint({ x: 0, y: 0 }, rotateThenMove)).toEqual({ x: 10, y: 0 });
        expect(compose(IDENTITY, scaling(2))).toEqual(scaling(2));
    });

    it("detects identity and mirroring", () =>
    {
        expect(isIdentity(IDENTITY)).toBe(true);
        expect(isIdentity(translation(1, 0))).toBe(false);
        expect(isMirroring(mirroring(true, false))).toBe(true);
        expect(isMirroring(mirroring(true, true))).toBe(false);
        expect(isMirroring(rotation(30))).toBe(false);
    });

    it("keeps the polygon orientation when mirroring", () =>
    {
        const polygon = { outer: rectanglePath(0, 0, 10, 5), holes: [[...rectanglePath(1, 1, 2, 2)].reverse()] };
        const [mirrored] = transformPolygons([polygon], mirroring(true, false));
        expect(isCounterClockwise(mirrored?.outer ?? [])).toBe(true);
        expect(isCounterClockwise(mirrored?.holes[0] ?? [])).toBe(false);
        expect(mirrored?.outer.every((point) => point.x <= 0)).toBe(true);
        const [scaled] = transformPolygons([polygon], scaling(2));
        expect(signedArea(scaled?.outer ?? [])).toBe(200);
    });

    it("translates polygons and paths", () =>
    {
        const [moved] = translatePolygons([{ outer: rectanglePath(0, 0, 1, 1), holes: [[{ x: 0, y: 0 }]] }], 5, 6);
        expect(moved?.outer[0]).toEqual({ x: 5, y: 6 });
        expect(moved?.holes[0]?.[0]).toEqual({ x: 5, y: 6 });
        expect(transformPath([{ x: 1, y: 1 }], scaling(3, 2))).toEqual([{ x: 3, y: 2 }]);
    });
});

describe("convex hull", () =>
{
    it("returns the counter-clockwise hull without inner or collinear points", () =>
    {
        const hull = convexHull([
            { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }
        ]);
        expect(hull).toHaveLength(4);
        expect(signedArea(hull)).toBe(100);
    });

    it("handles tiny inputs", () =>
    {
        expect(convexHull([])).toEqual([]);
        expect(convexHull([{ x: 2, y: 1 }, { x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }]);
    });
});
