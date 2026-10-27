import type { Path, Polygon } from "./types";

/** Axis-aligned bounding box. An empty box has min greater than max. */
export interface BBox
{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export function emptyBBox(): BBox
{
    return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function isEmptyBBox(box: BBox): boolean
{
    return box.minX > box.maxX || box.minY > box.maxY;
}

/** Grows the box in place to include the path and returns it. */
export function extendBBox(box: BBox, path: Path): BBox
{
    for (const point of path)
    {
        if (point.x < box.minX)
        {
            box.minX = point.x;
        }
        if (point.x > box.maxX)
        {
            box.maxX = point.x;
        }
        if (point.y < box.minY)
        {
            box.minY = point.y;
        }
        if (point.y > box.maxY)
        {
            box.maxY = point.y;
        }
    }
    return box;
}

export function bboxOfPaths(paths: readonly Path[]): BBox
{
    const box = emptyBBox();
    for (const path of paths)
    {
        extendBBox(box, path);
    }
    return box;
}

/** Only outer rings are needed: holes always lie inside them. */
export function bboxOfPolygons(polygons: readonly Polygon[]): BBox
{
    return bboxOfPaths(polygons.map((polygon) => polygon.outer));
}

export function mergeBBoxes(a: BBox, b: BBox): BBox
{
    return {
        minX: Math.min(a.minX, b.minX),
        minY: Math.min(a.minY, b.minY),
        maxX: Math.max(a.maxX, b.maxX),
        maxY: Math.max(a.maxY, b.maxY)
    };
}

/** Box enlarged by margin on every side (a negative margin shrinks it). */
export function inflateBBox(box: BBox, margin: number): BBox
{
    return {
        minX: box.minX - margin,
        minY: box.minY - margin,
        maxX: box.maxX + margin,
        maxY: box.maxY + margin
    };
}

export function bboxWidth(box: BBox): number
{
    return isEmptyBBox(box) ? 0 : box.maxX - box.minX;
}

export function bboxHeight(box: BBox): number
{
    return isEmptyBBox(box) ? 0 : box.maxY - box.minY;
}

export function bboxIntersects(a: BBox, b: BBox): boolean
{
    return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}
