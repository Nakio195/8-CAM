// Isolation computed in the CAM worker (pure functions, also usable in tests).
// The passes and the non-isolated areas are independent parts: the worker computes them in parallel sub-workers
// (cam.worker.ts), runIsolation one after the other; both assemble them the same way.

import {
    assembleIsolation,
    isolationPasses,
    nonIsolatedZones,
    passGroups,
    passOffsets,
    type IsolationResult,
    type NonIsolatedZone
} from "@cam/isolation/index";
import { DEFAULT_RAPID_FEED, estimateDuration, type ToolpathSegment } from "@cam/toolpath/index";
import { toolWidth } from "@cam/tools/index";
import { packPolygons, unpackPolygons, type PackedPolygons, type Point, type Polygon } from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";
import type { IsolationOutput, IsolationRequestData } from "@project/operations";

/** One independent part of an isolation: a group of passes (see passGroups), or the non-isolated areas. */
export type IsolationPart = { kind: "passes"; indices: number[] } | { kind: "zones" };

export type IsolationPartOutput =
    | { kind: "passes"; indices: number[]; loops: PackedPolygons[] }
    | { kind: "zones"; zones: NonIsolatedZone[] };

/** The parts of a request, the outer passes first: their offsets are the longest to compute. */
export function isolationParts(request: IsolationRequestData): IsolationPart[]
{
    const groups = passGroups(passOffsets(toolWidth(request.tool), request.params));
    return [...groups.map((indices): IsolationPart => ({ kind: "passes", indices })).reverse(), { kind: "zones" }];
}

export function runIsolationPart(request: IsolationRequestData, part: IsolationPart, copper = unpackPolygons(request.copper)): IsolationPartOutput
{
    const offsets = passOffsets(toolWidth(request.tool), request.params);
    if (part.kind === "passes")
    {
        const passes = isolationPasses(copper, part.indices.map((index) => offsets[index] ?? 0), request.params.direction);
        const loops = passes.map((pass) => packPolygons(pass.map((loop) => ({ outer: loop.points, holes: [] }))));
        return { kind: "passes", indices: part.indices, loops };
    }
    return { kind: "zones", zones: nonIsolatedZones(copper, request.spots, mmToInternal(offsets[0] ?? 0)) };
}

/** Packed output of the parts of a request, start being when the computation began (performance.now()). */
export function assembleIsolationOutput(request: IsolationRequestData, parts: readonly IsolationPartOutput[], start: number): IsolationOutput
{
    const width = toolWidth(request.tool);
    const offsets = passOffsets(width, request.params);
    const passes: ToolpathSegment[][] = offsets.map(() => []);
    let zones: NonIsolatedZone[] = [];
    for (const part of parts)
    {
        if (part.kind === "passes")
        {
            part.indices.forEach((index, rank) =>
            {
                const loops = part.loops[rank];
                passes[index] = loops ? unpackPolygons(loops).map((polygon) => ({ points: polygon.outer, closed: true })) : [];
            });
        }
        else
        {
            zones = part.zones;
        }
    }
    return toOutput(request, assembleIsolation(passes, zones, width, offsets, request.params), start);
}

function toOutput(request: IsolationRequestData, result: IsolationResult, start: number): IsolationOutput
{
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
        duration: estimateDuration(result.segments, { ...request.tool, toolId: request.tool.id }, request.rapidFeed ?? DEFAULT_RAPID_FEED),
        computeMs: performance.now() - start
    };
}

/** Whole isolation in the calling thread, parts one after the other. */
export function runIsolation(request: IsolationRequestData, onProgress: (fraction: number) => void = () => undefined): IsolationOutput
{
    const start = performance.now();
    const copper = unpackPolygons(request.copper);
    const parts = isolationParts(request);
    const outputs = parts.map((part, index) =>
    {
        onProgress(index / (parts.length + 1));
        return runIsolationPart(request, part, copper);
    });
    const output = assembleIsolationOutput(request, outputs, start);
    onProgress(1);
    return output;
}
