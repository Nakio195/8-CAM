import { expect, it } from "vitest";
import { offsetPolygons, polygonRings, strokePolylines, unionPolygons, type Polygon } from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";
import { createDenseBoard } from "./denseBoard";

// Target of specification section 8: isolation, 2 passes, dense 10 x 10 cm board in < 5 s
const MM = mmToInternal(1);
const TOOL_DIAMETER = 0.2 * MM;
const OVERLAP = 0.1;
const RUNS = 3;

/** Pass offset as in FlatCAM ToolIsolation._pass_offset. */
function passOffset(pass: number): number
{
    return TOOL_DIAMETER * ((2 * pass + 1) / 2) - pass * OVERLAP * TOOL_DIAMETER;
}

function median(values: number[]): number
{
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function measure<T>(run: () => T): { result: T; milliseconds: number }
{
    const times: number[] = [];
    let result = run();
    for (let i = 0; i < RUNS; i++)
    {
        const start = performance.now();
        result = run();
        times.push(performance.now() - start);
    }
    return { result, milliseconds: median(times) };
}

it("isolates a dense 10 x 10 cm board in less than 5 s", () =>
{
    const board = createDenseBoard();

    const copper = measure(() =>
    {
        const shapes: Polygon[] = [...board.pads];
        for (const [width, tracks] of board.tracksByWidth)
        {
            shapes.push(...strokePolylines(tracks, width));
        }
        return unionPolygons(shapes);
    });

    const isolation = measure(() => [
        offsetPolygons(copper.result, passOffset(0)),
        offsetPolygons(copper.result, passOffset(1))
    ]);

    const vertexCount = polygonRings(copper.result).reduce((sum, ring) => sum + ring.length, 0);
    const total = copper.milliseconds + isolation.milliseconds;
    console.table({
        "board": `${board.pads.length} pads, ${board.trackSegmentCount} track segments`,
        "copper polygons": `${copper.result.length} (${vertexCount} vertices)`,
        "copper union (ms)": copper.milliseconds.toFixed(0),
        "2 isolation passes (ms)": isolation.milliseconds.toFixed(0),
        "total (ms)": total.toFixed(0)
    });

    expect(total).toBeLessThan(5000);
});
