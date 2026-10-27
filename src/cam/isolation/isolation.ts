// Isolation routing (specification 6.4). Reference: FlatCAM appPlugins/ToolIsolation.py (isolate, _pass_offset,
// generate_envelope) and camlib.Geometry.isolation_geometry: successive outward offsets of the copper with round
// joins, each offset outline becoming a closed toolpath.

import {
    intersectPolygons,
    offsetPolygons,
    polygonRings,
    totalArea,
    withOrientation,
    type Point,
    type Polygon
} from "@core/geometry/index";
import { internalToMm, mmToInternal } from "@core/units/index";
import type { ClearanceSpot } from "../analysis/index";
import { orderSegments, travelLength, type ToolpathSegment } from "../toolpath/index";
import { toolWidth, type Tool } from "../tools/index";

/**
 * Climb: the copper kept is on the left of the tool path, the cutting edge moves with the feed (CW spindle seen from
 * above); conventional: the opposite, more tolerant of backlash (FlatCAM generate_envelope).
 */
export type MillingDirection = "climb" | "conventional";

export interface IsolationParams
{
    passes: number;
    /** Share of the cutting width common to two neighbouring passes, 0 to 0.9. */
    overlap: number;
    direction: MillingDirection;
    /** True: neighbouring passes of every feature are cut together (less travel); false: pass after pass over the board. */
    combinePasses: boolean;
    /** Extra distance between the copper and every pass, mm (FlatCAM "custom offset"). */
    extraOffset: number;
}

export const DEFAULT_ISOLATION: Readonly<IsolationParams> = {
    passes: 2,
    overlap: 0.15,
    direction: "conventional",
    combinePasses: true,
    extraOffset: 0
};

/** Distance from the copper to the centre line of every pass, mm (FlatCAM ToolIsolation._pass_offset). */
export function passOffsets(width: number, params: Pick<IsolationParams, "passes" | "overlap" | "extraOffset">): number[]
{
    const offsets: number[] = [];
    for (let pass = 0; pass < Math.max(1, Math.round(params.passes)); pass++)
    {
        offsets.push(width * ((2 * pass + 1) / 2) - pass * params.overlap * width + params.extraOffset);
    }
    return offsets;
}

/** Place where the tool cannot pass between two copper features: a short circuit is likely. */
export interface NonIsolatedZone
{
    polygons: [number, number];
    /** Area both features' first pass envelopes cover: the copper the tool cannot remove between them. */
    shape: Polygon[];
    centre: Point;
    /** Gap between the two features, internal units. */
    gap: number;
}

export interface IsolationResult
{
    /** Closed toolpaths in cutting order, internal units. */
    segments: ToolpathSegment[];
    /** Number of loops of each pass. */
    loopsPerPass: number[];
    zones: NonIsolatedZone[];
    /** Cutting width of the tool, mm. */
    width: number;
    /** Offset of each pass, mm. */
    offsets: number[];
    /** Length cut in the plane (one depth), mm. */
    cutLength: number;
    /** Length of the moves between toolpaths, mm. */
    travelLength: number;
}

/**
 * Areas the first pass cannot isolate: for every pair of features closer than the pass diameter, the overlap of their
 * two first-pass envelopes (FlatCAM only reports a global ratio; here each area is located and drawn).
 */
export function nonIsolatedZones(copper: readonly Polygon[], spots: readonly ClearanceSpot[], firstOffset: number): NonIsolatedZone[]
{
    const zones: NonIsolatedZone[] = [];
    for (const spot of spots)
    {
        // One internal unit of tolerance, as in the recommendations: a tool exactly as wide as the gap passes
        if (spot.distance + 1 >= 2 * firstOffset)
        {
            continue;
        }
        const [first, second] = spot.polygons;
        const a = copper[first];
        const b = copper[second];
        if (!a || !b)
        {
            continue;
        }
        const shape = intersectPolygons(offsetPolygons([a], firstOffset), offsetPolygons([b], firstOffset));
        if (totalArea(shape) > 0)
        {
            zones.push({
                polygons: [first, second],
                shape,
                centre: { x: Math.round((spot.a.x + spot.b.x) / 2), y: Math.round((spot.a.y + spot.b.y) / 2) },
                gap: spot.distance
            });
        }
    }
    return zones;
}

/** Closed loops of one pass, oriented for the milling direction. */
function passLoops(copper: readonly Polygon[], offset: number, direction: MillingDirection): ToolpathSegment[]
{
    const envelope = offsetPolygons(copper, offset);
    return polygonRings(envelope.map((polygon) => ({
        outer: withOrientation(polygon.outer, true),
        holes: polygon.holes.map((hole) => withOrientation(hole, false))
    }))).map((ring) => ({
        // Normalised rings keep the copper on their left: climb as is, conventional reversed
        points: direction === "climb" ? ring : [...ring].reverse(),
        closed: true
    }));
}

function loopLength(segment: ToolpathSegment): number
{
    let length = 0;
    const points = segment.points;
    for (let i = 0; i < points.length; i++)
    {
        const a = points[i] as Point;
        const b = points[(i + 1) % points.length] as Point;
        length += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return length;
}

/**
 * Isolation toolpaths of a copper layer with one tool.
 * spots are the clearance spots of the same copper (layer analysis), used to locate non-isolated areas.
 */
export function computeIsolation(copper: readonly Polygon[], spots: readonly ClearanceSpot[], tool: Tool,
    params: IsolationParams, onProgress: (fraction: number) => void = () => undefined): IsolationResult
{
    const width = toolWidth(tool);
    const offsets = passOffsets(width, params);
    const passes = offsets.map((offset, index) =>
    {
        onProgress(index / (offsets.length + 1));
        return passLoops(copper, mmToInternal(offset), params.direction);
    });
    onProgress(offsets.length / (offsets.length + 1));
    const segments = params.combinePasses
        ? orderSegments(passes.flat())
        : passes.reduce<ToolpathSegment[]>((ordered, loops) =>
        {
            const last = ordered[ordered.length - 1]?.points[0];
            return ordered.concat(orderSegments(loops, last));
        }, []);
    const zones = nonIsolatedZones(copper, spots, mmToInternal(offsets[0] ?? width / 2));
    onProgress(1);
    return {
        segments,
        loopsPerPass: passes.map((loops) => loops.length),
        zones,
        width,
        offsets,
        cutLength: internalToMm(segments.reduce((sum, segment) => sum + loopLength(segment), 0)),
        travelLength: internalToMm(travelLength(segments))
    };
}
