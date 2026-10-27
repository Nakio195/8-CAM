// Clearances between distinct copper features (specification 6.10: minimum spacing, tightest spot, number of
// areas a tool cannot isolate). Exact edge-to-edge distances, accelerated by a uniform grid of segments.

import type { Point, Polygon } from "@core/geometry/index";

/** Closest approach between two distinct copper polygons. */
export interface ClearanceSpot
{
    /** Indices of the two polygons in the analysed list, first < second. */
    polygons: [number, number];
    /** Closest points, one on each polygon (internal units). */
    a: Point;
    b: Point;
    distance: number;
}

interface Segment
{
    polygon: number;
    ax: number;
    ay: number;
    bx: number;
    by: number;
}

function closestOnSegment(px: number, py: number, segment: Segment): Point
{
    const dx = segment.bx - segment.ax;
    const dy = segment.by - segment.ay;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - segment.ax) * dx + (py - segment.ay) * dy) / lengthSquared));
    return { x: segment.ax + ratio * dx, y: segment.ay + ratio * dy };
}

/**
 * Closest points of two segments that do not cross (copper polygons are merged, so edges of different polygons never
 * cross): the minimum is reached at one of the four end points.
 */
function segmentDistance(first: Segment, second: Segment): { a: Point; b: Point; distance: number }
{
    let best = { a: { x: first.ax, y: first.ay }, b: { x: first.ax, y: first.ay }, distance: Infinity };
    const candidates: [Point, Segment, boolean][] = [
        [{ x: first.ax, y: first.ay }, second, true],
        [{ x: first.bx, y: first.by }, second, true],
        [{ x: second.ax, y: second.ay }, first, false],
        [{ x: second.bx, y: second.by }, first, false]
    ];
    for (const [point, segment, pointOnFirst] of candidates)
    {
        const other = closestOnSegment(point.x, point.y, segment);
        const distance = Math.hypot(point.x - other.x, point.y - other.y);
        if (distance < best.distance)
        {
            best = pointOnFirst ? { a: point, b: other, distance } : { a: other, b: point, distance };
        }
    }
    return best;
}

/**
 * Finds, for every pair of distinct polygons closer than searchRadius, their closest points.
 * Spots are sorted from the tightest. Only gaps between different polygons count: a narrow notch inside one copper
 * area is not a clearance between features.
 */
export function findClearances(polygons: readonly Polygon[], searchRadius: number): ClearanceSpot[]
{
    const segments: Segment[] = [];
    polygons.forEach((polygon, index) =>
    {
        for (const ring of [polygon.outer, ...polygon.holes])
        {
            for (let i = 0; i < ring.length; i++)
            {
                const a = ring[i] as Point;
                const b = ring[(i + 1) % ring.length] as Point;
                segments.push({ polygon: index, ax: a.x, ay: a.y, bx: b.x, by: b.y });
            }
        }
    });
    if (segments.length === 0 || searchRadius <= 0)
    {
        return [];
    }

    // Uniform grid: each segment is registered in every cell its bounding box covers
    const cellSize = searchRadius;
    const cells = new Map<number, number[]>();
    const cellKey = (column: number, row: number): number => column * 1_000_003 + row;
    const cellOf = (value: number): number => Math.floor(value / cellSize);
    segments.forEach((segment, index) =>
    {
        const minColumn = cellOf(Math.min(segment.ax, segment.bx));
        const maxColumn = cellOf(Math.max(segment.ax, segment.bx));
        const minRow = cellOf(Math.min(segment.ay, segment.by));
        const maxRow = cellOf(Math.max(segment.ay, segment.by));
        for (let column = minColumn; column <= maxColumn; column++)
        {
            for (let row = minRow; row <= maxRow; row++)
            {
                const key = cellKey(column, row);
                const list = cells.get(key);
                if (list)
                {
                    list.push(index);
                }
                else
                {
                    cells.set(key, [index]);
                }
            }
        }
    });

    const best = new Map<number, ClearanceSpot>();
    // Stamp per candidate segment, so a pair met in several cells is measured once
    const seen = new Int32Array(segments.length).fill(-1);
    segments.forEach((segment, index) =>
    {
        const minColumn = cellOf(Math.min(segment.ax, segment.bx) - searchRadius);
        const maxColumn = cellOf(Math.max(segment.ax, segment.bx) + searchRadius);
        const minRow = cellOf(Math.min(segment.ay, segment.by) - searchRadius);
        const maxRow = cellOf(Math.max(segment.ay, segment.by) + searchRadius);
        for (let column = minColumn; column <= maxColumn; column++)
        {
            for (let row = minRow; row <= maxRow; row++)
            {
                for (const otherIndex of cells.get(cellKey(column, row)) ?? [])
                {
                    const other = segments[otherIndex] as Segment;
                    // Each unordered pair of polygons is handled from its lower index only
                    if (other.polygon <= segment.polygon || seen[otherIndex] === index)
                    {
                        continue;
                    }
                    seen[otherIndex] = index;
                    const result = segmentDistance(segment, other);
                    if (result.distance > searchRadius)
                    {
                        continue;
                    }
                    const key = segment.polygon * polygons.length + other.polygon;
                    const current = best.get(key);
                    if (!current || result.distance < current.distance)
                    {
                        best.set(key, {
                            polygons: [segment.polygon, other.polygon],
                            a: { x: Math.round(result.a.x), y: Math.round(result.a.y) },
                            b: { x: Math.round(result.b.x), y: Math.round(result.b.y) },
                            distance: result.distance
                        });
                    }
                }
            }
        }
    });
    return [...best.values()].sort((first, second) => first.distance - second.distance);
}
