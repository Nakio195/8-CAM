import type { Path, Point, Polygon } from "./types";

/** Signed area of a closed ring (shoelace formula): positive when counter-clockwise. */
export function signedArea(path: Path): number
{
    let twiceArea = 0;
    const count = path.length;
    for (let i = 0; i < count; i++)
    {
        const current = path[i] as Point;
        const next = path[(i + 1) % count] as Point;
        twiceArea += current.x * next.y - next.x * current.y;
    }
    return twiceArea / 2;
}

export function isCounterClockwise(path: Path): boolean
{
    return signedArea(path) > 0;
}

/** Returns the ring with the requested orientation, reversing a copy when needed. */
export function withOrientation(path: Path, counterClockwise: boolean): Path
{
    return isCounterClockwise(path) === counterClockwise ? path : [...path].reverse();
}

/** Outer ring counter-clockwise, holes clockwise. */
export function normalizePolygon(polygon: Polygon): Polygon
{
    return {
        outer: withOrientation(polygon.outer, true),
        holes: polygon.holes.map((hole) => withOrientation(hole, false))
    };
}

/** Filled area of a polygon (outer area minus holes), always positive. */
export function polygonArea(polygon: Polygon): number
{
    let area = Math.abs(signedArea(polygon.outer));
    for (const hole of polygon.holes)
    {
        area -= Math.abs(signedArea(hole));
    }
    return area;
}

export function totalArea(polygons: readonly Polygon[]): number
{
    return polygons.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
}

export function distance(a: Point, b: Point): number
{
    return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Length of an open path, or of a closed ring when closed is true. */
export function pathLength(path: Path, closed = false): number
{
    let length = 0;
    for (let i = 1; i < path.length; i++)
    {
        length += distance(path[i - 1] as Point, path[i] as Point);
    }
    if (closed && path.length > 2)
    {
        length += distance(path[path.length - 1] as Point, path[0] as Point);
    }
    return length;
}

/** Axis-aligned rectangle as a counter-clockwise ring. */
export function rectanglePath(minX: number, minY: number, maxX: number, maxY: number): Path
{
    return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
    ];
}

/** Translates a path by (dx, dy), returning a new path. */
export function translatePath(path: Path, dx: number, dy: number): Path
{
    return path.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}
