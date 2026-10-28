import { describe, expect, it } from "vitest";
import { unpackPolygons } from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";
import type { Backplot } from "@project/export";
import { backplotLines, backplotOverlays, pointAt } from "@ui/machining/backplot";

// Rapid to (0, 0, 2), plunge, cut a square of 10 mm, rapid up and away
const BACKPLOT: Backplot = {
    points: Float64Array.from([0, 0, 2, 0, 0, -0.1, 10, 0, -0.1, 10, 10, -0.1, 0, 10, -0.1, 0, 10, 2, 20, 20, 2]),
    kinds: Uint8Array.from([0, 1, 1, 1, 1, 0, 0]),
    times: Float64Array.from([1, 2, 6, 10, 14, 15, 17]),
    fileStarts: [0]
};

describe("simulation", () =>
{
    it("finds the point reached at a given time", () =>
    {
        expect(pointAt(BACKPLOT, 0)).toBe(-1);
        expect(pointAt(BACKPLOT, 6)).toBe(2);
        expect(pointAt(BACKPLOT, 9.9)).toBe(2);
        expect(pointAt(BACKPLOT, 100)).toBe(6);
    });

    it("joins consecutive moves of a kind into lines up to the play head", () =>
    {
        const cuts = unpackPolygons(backplotLines(BACKPLOT, 1, 0, Infinity));
        expect(cuts).toHaveLength(1);
        expect(cuts[0]?.outer.map((point) => [point.x / mmToInternal(1), point.y / mmToInternal(1)]))
            .toEqual([[0, 0], [0, 0], [10, 0], [10, 10], [0, 10]]);
        const rapids = unpackPolygons(backplotLines(BACKPLOT, 0, 0, Infinity));
        expect(rapids).toHaveLength(1);
        expect(rapids[0]?.outer).toHaveLength(3);
        // At the third point only the plunge and the first side are done
        expect(unpackPolygons(backplotLines(BACKPLOT, 1, 0, 2))[0]?.outer).toHaveLength(3);
        expect(unpackPolygons(backplotLines(BACKPLOT, 1, 0, 0))).toEqual([]);
    });

    it("draws the tool and the machine zero over the path", () =>
    {
        const faint = { cuts: backplotLines(BACKPLOT, 1, 0, Infinity), rapids: backplotLines(BACKPLOT, 0, 0, Infinity) };
        const layers = backplotOverlays(BACKPLOT, faint, 3, { x: 0, y: 0 }, 1);
        expect(layers.map((layer) => layer.id)).toEqual([
            "backplot-cuts-all", "backplot-rapids-all", "backplot-cuts-done", "backplot-rapids-done", "backplot-origin", "backplot-head"
        ]);
        expect(backplotOverlays(BACKPLOT, faint, -1, { x: 0, y: 0 }, 1).some((layer) => layer.id === "backplot-head")).toBe(false);
    });
});
