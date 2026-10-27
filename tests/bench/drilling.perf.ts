import { expect, it } from "vitest";
import { nearestNeighbourOrder, routeLength, twoOpt } from "@cam/drilling/index";
import type { Point } from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";

// Hole order of a very dense drill file: 5 000 holes on a 10 x 10 cm board, in random file order.
it("orders 5 000 holes in less than 1 s", () =>
{
    let state = 8;
    const next = (): number =>
    {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
    const points: Point[] = Array.from({ length: 5000 }, () => ({ x: Math.round(next() * mmToInternal(100)), y: Math.round(next() * mmToInternal(100)) }));
    const start = { x: 0, y: 0 };
    const t0 = performance.now();
    const nearest = nearestNeighbourOrder(points, start);
    const t1 = performance.now();
    const optimized = twoOpt(points, nearest, start);
    const t2 = performance.now();
    const length = (order: number[]): string => `${(routeLength(order.map((index) => points[index] as Point), start) / mmToInternal(1000)).toFixed(2)} m`;
    console.table({
        "file order": length(points.map((_, index) => index)),
        "nearest neighbour": `${length(nearest)} in ${(t1 - t0).toFixed(0)} ms`,
        "2-opt": `${length(optimized)} in ${(t2 - t1).toFixed(0)} ms`
    });
    expect(t2 - t0).toBeLessThan(1000);
});
