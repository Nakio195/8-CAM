// Reading FlatCAM Plus G-code in tests, to compare our results with the reference implementation.

import { mmToInternal } from "@core/units/index";
import type { Path } from "@core/geometry/index";

/** Cutting moves (Z below the surface, down to maxDepth) of a FlatCAM G-code file, as polylines in internal units. */
export function flatcamCutPaths(gcode: string, maxDepth: number): Path[]
{
    const paths: Path[] = [];
    let z = Infinity;
    let current: Path = [];
    let position = { x: 0, y: 0 };
    for (const line of gcode.split(/\r?\n/))
    {
        const zMatch = /\bZ(-?[\d.]+)/.exec(line);
        const xy = /^G0[01] X(-?[\d.]+) Y(-?[\d.]+)/.exec(line);
        if (zMatch)
        {
            z = Number(zMatch[1]);
            if (current.length > 1)
            {
                paths.push(current);
            }
            current = z < 0 && z >= maxDepth ? [position] : [];
        }
        if (xy)
        {
            position = { x: mmToInternal(Number(xy[1])), y: mmToInternal(Number(xy[2])) };
            if (z < 0 && z >= maxDepth && line.startsWith("G01"))
            {
                current.push(position);
            }
        }
    }
    if (current.length > 1)
    {
        paths.push(current);
    }
    return paths;
}
