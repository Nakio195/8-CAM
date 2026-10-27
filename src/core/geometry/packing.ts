// Compact transfer format for polygons between a Web Worker and the main thread.
// A typed array is transferred without copying and draws without creating one object per point.
//
// Layout (Int32): polygonCount, then for each polygon: ringCount, then for each ring (outer first):
// pointCount, x0, y0, x1, y1...
// Internal coordinates are limited to MAX_INTERNAL_COORDINATE (10 m = 1e9 units), within the Int32 range.

import type { Path, Polygon } from "./types";

export type PackedPolygons = Int32Array;

export function packPolygons(polygons: readonly Polygon[]): PackedPolygons
{
    let size = 1;
    for (const polygon of polygons)
    {
        size += 1;
        for (const ring of [polygon.outer, ...polygon.holes])
        {
            size += 1 + 2 * ring.length;
        }
    }
    const data = new Int32Array(size);
    let index = 0;
    data[index++] = polygons.length;
    for (const polygon of polygons)
    {
        data[index++] = 1 + polygon.holes.length;
        for (const ring of [polygon.outer, ...polygon.holes])
        {
            data[index++] = ring.length;
            for (const point of ring)
            {
                data[index++] = point.x;
                data[index++] = point.y;
            }
        }
    }
    return data;
}

export function unpackPolygons(data: PackedPolygons): Polygon[]
{
    const polygons: Polygon[] = [];
    let index = 0;
    const polygonCount = data[index++] ?? 0;
    for (let p = 0; p < polygonCount; p++)
    {
        const ringCount = data[index++] ?? 0;
        const rings: Path[] = [];
        for (let r = 0; r < ringCount; r++)
        {
            const pointCount = data[index++] ?? 0;
            const ring: Path = new Array<{ x: number; y: number }>(pointCount);
            for (let i = 0; i < pointCount; i++)
            {
                ring[i] = { x: data[index] ?? 0, y: data[index + 1] ?? 0 };
                index += 2;
            }
            rings.push(ring);
        }
        polygons.push({ outer: rings[0] ?? [], holes: rings.slice(1) });
    }
    return polygons;
}

/**
 * Visits every ring of packed polygons without allocating points (used by renderers).
 * The callback receives the start index of the first x coordinate and the number of points.
 */
export function forEachPackedRing(data: PackedPolygons, visit: (start: number, pointCount: number) => void): void
{
    let index = 0;
    const polygonCount = data[index++] ?? 0;
    for (let p = 0; p < polygonCount; p++)
    {
        const ringCount = data[index++] ?? 0;
        for (let r = 0; r < ringCount; r++)
        {
            const pointCount = data[index++] ?? 0;
            visit(index, pointCount);
            index += 2 * pointCount;
        }
    }
}

/** Total number of points of packed polygons. */
export function packedPointCount(data: PackedPolygons): number
{
    let count = 0;
    forEachPackedRing(data, (_start, pointCount) =>
    {
        count += pointCount;
    });
    return count;
}

/**
 * Simplified copy for display at low zoom: along each ring, points closer than tolerance to the last kept point
 * are dropped (radial distance decimation, error below tolerance). Rings smaller than tolerance become a square of
 * that size so tiny pads stay visible; tiny holes are dropped.
 */
export function simplifyPacked(data: PackedPolygons, tolerance: number): PackedPolygons
{
    const output: number[] = [];
    let index = 0;
    const polygonCount = data[index++] ?? 0;
    output.push(polygonCount);
    const toleranceSquared = tolerance * tolerance;
    for (let p = 0; p < polygonCount; p++)
    {
        const ringCount = data[index++] ?? 0;
        const ringCountIndex = output.length;
        output.push(0);
        let keptRings = 0;
        for (let r = 0; r < ringCount; r++)
        {
            const pointCount = data[index++] ?? 0;
            const start = index;
            index += 2 * pointCount;
            const ring: number[] = [];
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            let lastX = Number.NaN;
            let lastY = Number.NaN;
            for (let i = 0; i < pointCount; i++)
            {
                const x = data[start + 2 * i] ?? 0;
                const y = data[start + 2 * i + 1] ?? 0;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                const dx = x - lastX;
                const dy = y - lastY;
                if (ring.length === 0 || dx * dx + dy * dy >= toleranceSquared)
                {
                    ring.push(x, y);
                    lastX = x;
                    lastY = y;
                }
            }
            if (ring.length >= 6)
            {
                // No spread: a ground pour ring can hold more points than the call stack accepts as arguments
                output.push(ring.length / 2);
                for (const value of ring)
                {
                    output.push(value);
                }
                keptRings++;
            }
            else if (r === 0 && pointCount > 0)
            {
                // Outer ring smaller than the tolerance: a square of the tolerance size centred on it
                const cx = Math.round((minX + maxX) / 2);
                const cy = Math.round((minY + maxY) / 2);
                const half = Math.max(1, Math.round(tolerance / 2));
                output.push(4, cx - half, cy - half, cx + half, cy - half, cx + half, cy + half, cx - half, cy + half);
                keptRings++;
            }
        }
        output[ringCountIndex] = keptRings;
    }
    return Int32Array.from(output);
}
