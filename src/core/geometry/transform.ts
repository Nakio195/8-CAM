import { normalizePolygon } from "./path";
import type { Path, Point, Polygon } from "./types";

/**
 * 2D affine transform: x' = a x + c y + e, y' = b x + d y + f (same layout as the SVG / Canvas matrix).
 */
export interface Transform
{
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
}

export const IDENTITY: Readonly<Transform> = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Returns the transform applying first then second. */
export function compose(first: Transform, second: Transform): Transform
{
    return {
        a: second.a * first.a + second.c * first.b,
        b: second.b * first.a + second.d * first.b,
        c: second.a * first.c + second.c * first.d,
        d: second.b * first.c + second.d * first.d,
        e: second.a * first.e + second.c * first.f + second.e,
        f: second.b * first.e + second.d * first.f + second.f
    };
}

export function translation(dx: number, dy: number): Transform
{
    return { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy };
}

/** Counter-clockwise rotation around the origin, in degrees (Gerber convention). */
export function rotation(degrees: number): Transform
{
    // Exact values for multiples of 90° avoid rounding noise on rectangular pads
    const quarterTurns = degrees / 90;
    if (Number.isInteger(quarterTurns))
    {
        const COSINES = [1, 0, -1, 0];
        const index = ((quarterTurns % 4) + 4) % 4;
        const cos = COSINES[index] as number;
        const sin = COSINES[(index + 3) % 4] as number;
        return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
    }
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

export function scaling(sx: number, sy = sx): Transform
{
    return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

/** Mirror across the Y axis (flip X), the X axis (flip Y), or both. */
export function mirroring(flipX: boolean, flipY: boolean): Transform
{
    return scaling(flipX ? -1 : 1, flipY ? -1 : 1);
}

export function isIdentity(transform: Transform): boolean
{
    return transform.a === 1 && transform.b === 0 && transform.c === 0 && transform.d === 1
        && transform.e === 0 && transform.f === 0;
}

/** True when the transform reverses orientation (one mirror). */
export function isMirroring(transform: Transform): boolean
{
    return transform.a * transform.d - transform.b * transform.c < 0;
}

export function transformPoint(point: Point, transform: Transform): Point
{
    return {
        x: Math.round(transform.a * point.x + transform.c * point.y + transform.e),
        y: Math.round(transform.b * point.x + transform.d * point.y + transform.f)
    };
}

export function transformPath(path: Path, transform: Transform): Path
{
    return path.map((point) => transformPoint(point, transform));
}

/** Transforms polygons, restoring the normalised orientation when the transform mirrors. */
export function transformPolygons(polygons: readonly Polygon[], transform: Transform): Polygon[]
{
    const mirrored = isMirroring(transform);
    return polygons.map((polygon) =>
    {
        const result = {
            outer: transformPath(polygon.outer, transform),
            holes: polygon.holes.map((hole) => transformPath(hole, transform))
        };
        return mirrored ? normalizePolygon(result) : result;
    });
}

/** Fast path for the most common case: copying a shape to a new position. */
export function translatePolygons(polygons: readonly Polygon[], dx: number, dy: number): Polygon[]
{
    const move = (path: Path): Path => path.map((point) => ({ x: point.x + dx, y: point.y + dy }));
    return polygons.map((polygon) => ({ outer: move(polygon.outer), holes: polygon.holes.map(move) }));
}
