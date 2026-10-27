// Isolation computed in the CAM worker (pure function, also usable in tests).

import { computeIsolation } from "@cam/isolation/index";
import { moveStatistics, segmentsToMoves } from "@cam/toolpath/index";
import { packPolygons, unpackPolygons, type Point, type Polygon } from "@core/geometry/index";
import type { IsolationOutput, IsolationRequestData } from "@project/operations";

export function runIsolation(request: IsolationRequestData, onProgress: (fraction: number) => void = () => undefined): IsolationOutput
{
    const start = performance.now();
    const copper = unpackPolygons(request.copper);
    const result = computeIsolation(copper, request.spots, request.tool, request.params, (fraction) => onProgress(fraction * 0.9));

    // Moves between loops, from each loop start (where it is entered and left) to the next one
    const travels: Polygon[] = [];
    let previous: Point | null = null;
    for (const segment of result.segments)
    {
        const first = segment.points[0];
        if (first && previous)
        {
            travels.push({ outer: [previous, first], holes: [] });
        }
        previous = first ?? previous;
    }

    const moves = segmentsToMoves(result.segments, { ...request.tool, toolId: request.tool.id });
    const statistics = moveStatistics(moves, undefined, { x: 0, y: 0, z: request.tool.safeZ });
    onProgress(1);
    return {
        tool: request.tool,
        loops: packPolygons(result.segments.map((segment) => ({ outer: segment.points, holes: [] }))),
        travels: packPolygons(travels),
        zones: result.zones.map((zone) => ({ polygons: zone.polygons, centre: zone.centre, gap: zone.gap })),
        zoneShapes: packPolygons(result.zones.flatMap((zone) => zone.shape)),
        loopsPerPass: result.loopsPerPass,
        width: result.width,
        offsets: result.offsets,
        cutLength: result.cutLength,
        travelLength: result.travelLength,
        duration: statistics.duration,
        computeMs: performance.now() - start
    };
}
