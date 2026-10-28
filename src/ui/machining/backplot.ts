// Simulation of the written G-code over the board (specification 6.9: backplot, step by step): the path read back from
// the files, split into what is done and what is left at the play head, as overlays of the board view.

import { type PackedPolygons } from "@core/geometry/index";
import { INTERNAL_UNITS_PER_MM } from "@core/units/index";
import type { Backplot } from "@project/export";
import type { RenderLayer } from "@render/index";

/** Index of the last point reached at time t (seconds), -1 before the first one. */
export function pointAt(backplot: Backplot, time: number): number
{
    let low = 0;
    let high = backplot.times.length - 1;
    let found = -1;
    while (low <= high)
    {
        const middle = (low + high) >> 1;
        if ((backplot.times[middle] ?? 0) <= time)
        {
            found = middle;
            low = middle + 1;
        }
        else
        {
            high = middle - 1;
        }
    }
    return found;
}

/**
 * Moves of one kind (0 rapid, 1 cut) from point `from` to point `to` (included) as open lines, packed: consecutive
 * moves of the kind are joined into one line, each starting where the previous move ended.
 */
export function backplotLines(backplot: Backplot, kind: number, from: number, to: number): PackedPolygons
{
    const { points, kinds } = backplot;
    const scale = INTERNAL_UNITS_PER_MM;
    const lines: number[][] = [];
    let current: number[] | null = null;
    const last = Math.min(to, kinds.length - 1);
    for (let i = Math.max(0, from); i <= last; i++)
    {
        if (kinds[i] !== kind || i === 0)
        {
            current = null;
            continue;
        }
        if (!current)
        {
            current = [Math.round((points[3 * (i - 1)] ?? 0) * scale), Math.round((points[3 * (i - 1) + 1] ?? 0) * scale)];
            lines.push(current);
        }
        current.push(Math.round((points[3 * i] ?? 0) * scale), Math.round((points[3 * i + 1] ?? 0) * scale));
    }
    // Packed layout: polygon count, then for each polygon one ring: ring count 1, point count, coordinates
    const size = 1 + lines.reduce((sum, line) => sum + 2 + line.length, 0);
    const data = new Int32Array(size);
    let index = 0;
    data[index++] = lines.length;
    for (const line of lines)
    {
        data[index++] = 1;
        data[index++] = line.length / 2;
        data.set(line, index);
        index += line.length;
    }
    return data;
}

/** Small cross marking a point (mm), as two open lines. */
function cross(x: number, y: number, size: number): PackedPolygons
{
    const s = INTERNAL_UNITS_PER_MM;
    const h = size / 2;
    return Int32Array.from([
        2,
        1, 2, Math.round((x - h) * s), Math.round(y * s), Math.round((x + h) * s), Math.round(y * s),
        1, 2, Math.round(x * s), Math.round((y - h) * s), Math.round(x * s), Math.round((y + h) * s)
    ]);
}

/** Disc around the tool position (mm), for the play head. */
function disc(x: number, y: number, radius: number): PackedPolygons
{
    const s = INTERNAL_UNITS_PER_MM;
    const steps = 24;
    const data = new Int32Array(3 + 2 * steps);
    data[0] = 1;
    data[1] = 1;
    data[2] = steps;
    for (let i = 0; i < steps; i++)
    {
        const angle = (2 * Math.PI * i) / steps;
        data[3 + 2 * i] = Math.round((x + radius * Math.cos(angle)) * s);
        data[4 + 2 * i] = Math.round((y + radius * Math.sin(angle)) * s);
    }
    return data;
}

const CUT_COLOR = "#1ebe96";
const RAPID_COLOR = "#faa0cd";
const HEAD_COLOR = "#ffe600";
const ORIGIN_COLOR = "#eb0a4b";

/** Whole path faint, the part done at the play head in full colour, the tool and the machine zero. */
export function backplotOverlays(backplot: Backplot, faint: { cuts: PackedPolygons; rapids: PackedPolygons }, head: number,
    origin: { x: number; y: number }, toolDiameter: number): RenderLayer[]
{
    const layers: RenderLayer[] = [
        { id: "backplot-cuts-all", geometry: faint.cuts, color: CUT_COLOR, opacity: 0.25, visible: true, style: "line", strokeWidth: 0 },
        { id: "backplot-rapids-all", geometry: faint.rapids, color: RAPID_COLOR, opacity: 0.25, visible: true, style: "line", strokeWidth: 0, dashed: true },
        { id: "backplot-cuts-done", geometry: backplotLines(backplot, 1, 0, head), color: CUT_COLOR, opacity: 1, visible: true, style: "line", strokeWidth: 0 },
        { id: "backplot-rapids-done", geometry: backplotLines(backplot, 0, 0, head), color: RAPID_COLOR, opacity: 1, visible: true, style: "line", strokeWidth: 0, dashed: true },
        { id: "backplot-origin", geometry: cross(origin.x, origin.y, 4), color: ORIGIN_COLOR, opacity: 1, visible: true, style: "line", strokeWidth: 0 }
    ];
    if (head >= 0)
    {
        const x = backplot.points[3 * head] ?? 0;
        const y = backplot.points[3 * head + 1] ?? 0;
        layers.push({ id: "backplot-head", geometry: disc(x, y, Math.max(0.2, toolDiameter / 2)), color: HEAD_COLOR, opacity: 0.85, visible: true });
    }
    return layers;
}
