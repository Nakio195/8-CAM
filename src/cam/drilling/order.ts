// Order of the holes drilled with one tool (specification 6.5): nearest neighbour, then 2-opt improvement.
// Reference: FlatCAM camlib.CNCjob.optimized_travelling_salesman (nearest neighbour only, O(n²)) and its OR-Tools
// options; here the 2-opt pass removes the crossings nearest neighbour leaves, with candidate lists to stay fast.

import type { Point } from "@core/geometry/index";

function distance(a: Point, b: Point): number
{
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Length of the route from start through every point in order (internal units). */
export function routeLength(points: readonly Point[], start: Point): number
{
    let length = 0;
    let position = start;
    for (const point of points)
    {
        length += distance(position, point);
        position = point;
    }
    return length;
}

/**
 * Point indices in nearest neighbour order from start. A uniform grid keeps it near O(n log n): the search grows ring
 * by ring around the current cell and stops once no closer point can be in a further ring.
 */
export function nearestNeighbourOrder(points: readonly Point[], start: Point): number[]
{
    const count = points.length;
    if (count === 0)
    {
        return [];
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of points)
    {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }
    // About two points per cell
    const side = Math.max(1, Math.ceil(Math.sqrt(count / 2)));
    const cellSize = Math.max(maxX - minX, maxY - minY, 1) / side;
    const cellOf = (value: number, origin: number): number => Math.min(side - 1, Math.max(0, Math.floor((value - origin) / cellSize)));
    const cells: number[][] = Array.from({ length: side * side }, () => []);
    points.forEach((point, index) => cells[cellOf(point.y, minY) * side + cellOf(point.x, minX)]?.push(index));

    const visited = new Uint8Array(count);
    const order: number[] = [];
    let position = start;
    for (let step = 0; step < count; step++)
    {
        const cx = cellOf(position.x, minX);
        const cy = cellOf(position.y, minY);
        let best = -1;
        let bestDistance = Infinity;
        for (let ring = 0; ring < side; ring++)
        {
            // Every point of this ring and beyond is at least (ring - 1) cells away from the position
            if (best >= 0 && (ring - 1) * cellSize > bestDistance)
            {
                break;
            }
            for (let y = cy - ring; y <= cy + ring; y++)
            {
                if (y < 0 || y >= side)
                {
                    continue;
                }
                const onEdge = y === cy - ring || y === cy + ring;
                for (let x = cx - ring; x <= cx + ring; x += onEdge ? 1 : 2 * ring)
                {
                    if (x < 0 || x >= side)
                    {
                        continue;
                    }
                    for (const index of cells[y * side + x] ?? [])
                    {
                        if (visited[index])
                        {
                            continue;
                        }
                        const value = distance(position, points[index] as Point);
                        if (value < bestDistance || (value === bestDistance && index < best))
                        {
                            best = index;
                            bestDistance = value;
                        }
                    }
                    if (ring === 0)
                    {
                        break;
                    }
                }
            }
        }
        visited[best] = 1;
        order.push(best);
        position = points[best] as Point;
    }
    return order;
}

/** Each point's nearest other points, closest first (candidate moves of 2-opt). */
function candidateLists(points: readonly Point[], size: number): number[][]
{
    // Sorting by x and scanning outwards is enough for the hole counts of a board (thousands)
    const byX = points.map((_, index) => index).sort((a, b) => (points[a] as Point).x - (points[b] as Point).x);
    const rank = new Int32Array(points.length);
    byX.forEach((index, position) => (rank[index] = position));
    return points.map((point, index) =>
    {
        const found: { index: number; distance: number }[] = [];
        const consider = (other: number): boolean =>
        {
            const candidate = points[other] as Point;
            const worst = found.length >= size ? (found[found.length - 1]?.distance ?? Infinity) : Infinity;
            if (Math.abs(candidate.x - point.x) > worst)
            {
                return false;
            }
            const value = distance(point, candidate);
            if (value < worst)
            {
                found.push({ index: other, distance: value });
                found.sort((a, b) => a.distance - b.distance);
                if (found.length > size)
                {
                    found.pop();
                }
            }
            return true;
        };
        const position = rank[index] ?? 0;
        for (let left = position - 1; left >= 0 && consider(byX[left] as number); left--)
        {
            // Scans left until the x distance alone exceeds the worst kept candidate
        }
        for (let right = position + 1; right < byX.length && consider(byX[right] as number); right++)
        {
            // Same to the right
        }
        return found.map((entry) => entry.index);
    });
}

/** Nearest points tried by 2-opt for every point: enough to remove the crossings of a nearest neighbour route. */
export const TWO_OPT_CANDIDATES = 12;

/**
 * Improves an open route starting at start (order of point indices) by 2-opt: reverses the part between two edges
 * whenever reconnecting them shortens the route, until no move helps or maxRounds is reached. The route stays open:
 * its last point may change, its start is fixed.
 */
export function twoOpt(points: readonly Point[], order: readonly number[], start: Point, maxRounds = 50): number[]
{
    const route = [...order];
    const count = route.length;
    if (count < 3)
    {
        return route;
    }
    const candidates = candidateLists(points, Math.min(TWO_OPT_CANDIDATES, count - 1));
    const position = new Int32Array(points.length);
    const at = (index: number): Point => (index < 0 ? start : (points[route[index] as number] as Point));
    const reverse = (from: number, to: number): void =>
    {
        for (let i = from, j = to; i < j; i++, j--)
        {
            const swap = route[i] as number;
            route[i] = route[j] as number;
            route[j] = swap;
        }
        for (let i = from; i <= to; i++)
        {
            position[route[i] as number] = i;
        }
    };
    route.forEach((point, index) => (position[point] = index));

    for (let round = 0; round < maxRounds; round++)
    {
        let improved = false;
        // Edge (i - 1, i), with i - 1 = -1 the start, reconnected to edge (j, j + 1), with j + 1 = count the open end
        for (let i = 0; i < count; i++)
        {
            const a = at(i - 1);
            const b = at(i);
            const removedAB = distance(a, b);
            for (const other of candidates[route[i - 1] ?? route[i] as number] ?? [])
            {
                // a gets a new neighbour c = route[j], so b..c is reversed: a c ... b d
                const j = position[other] ?? 0;
                if (j <= i)
                {
                    continue;
                }
                const c = at(j);
                const d = j + 1 < count ? at(j + 1) : null;
                const before = removedAB + (d ? distance(c, d) : 0);
                const after = distance(a, c) + (d ? distance(b, d) : 0);
                if (after < before - 1e-6)
                {
                    reverse(i, j);
                    improved = true;
                    break;
                }
            }
            // Open end: the last part of the route can be reversed (i .. count - 1) when a is closer to the last point
            const last = at(count - 1);
            if (i < count - 1 && distance(a, last) < distance(a, at(i)) - 1e-6)
            {
                reverse(i, count - 1);
                improved = true;
            }
        }
        if (!improved)
        {
            break;
        }
    }
    return route;
}
