import type { Path, Point } from "./types";

function cross(origin: Point, a: Point, b: Point): number
{
    return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/**
 * Convex hull (Andrew's monotone chain), counter-clockwise, without collinear points.
 * Used to sweep a convex aperture along a segment: hull(shape at start ∪ shape at end) is their exact Minkowski sum.
 */
export function convexHull(points: readonly Point[]): Path
{
    const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
    if (sorted.length < 3)
    {
        return sorted;
    }
    const lower: Point[] = [];
    for (const point of sorted)
    {
        while (lower.length >= 2 && cross(lower[lower.length - 2] as Point, lower[lower.length - 1] as Point, point) <= 0)
        {
            lower.pop();
        }
        lower.push(point);
    }
    const upper: Point[] = [];
    for (let i = sorted.length - 1; i >= 0; i--)
    {
        const point = sorted[i] as Point;
        while (upper.length >= 2 && cross(upper[upper.length - 2] as Point, upper[upper.length - 1] as Point, point) <= 0)
        {
            upper.pop();
        }
        upper.push(point);
    }
    // The last point of each half is the first point of the other one
    lower.pop();
    upper.pop();
    return lower.concat(upper);
}
