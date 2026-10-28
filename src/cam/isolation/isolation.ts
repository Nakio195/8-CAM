// Isolation routing (specification 6.4). Reference: FlatCAM appPlugins/ToolIsolation.py (isolate, _pass_offset,
// generate_envelope) and camlib.Geometry.isolation_geometry: successive outward offsets of the copper with round
// joins, each offset outline becoming a closed toolpath.

import {
    bboxOfPolygons,
    clipToBox,
    inflateBBox,
    intersectPolygons,
    offsetPolygons,
    polygonRings,
    totalArea,
    withOrientation,
    type BBox,
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
    // Climb like FlatCAM: cleaner copper edges with the small engraving machines of a fab lab
    direction: "climb",
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
    const boxes = new Map<number, BBox>();
    const boxOf = (index: number, polygon: Polygon): BBox =>
    {
        let box = boxes.get(index);
        if (!box)
        {
            box = bboxOfPolygons([polygon]);
            boxes.set(index, box);
        }
        return box;
    };
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
        // A point of the area is within the offset of a point of each feature, those two points within twice the
        // offset of each other: each feature is cut down to the part near the other one, a few times in turn, so a
        // ground pour taking part in hundreds of spots is never offset as a whole. The cut parts are subsets of the
        // features that keep every such point: the intersection of their offsets is exact.
        const reach = 2 * firstOffset + 1;
        let nearA = clipToBox([a], inflateBBox(boxOf(second, b), reach));
        let nearB = clipToBox([b], inflateBBox(bboxOfPolygons(nearA), reach));
        nearA = clipToBox(nearA, inflateBBox(bboxOfPolygons(nearB), reach));
        nearB = clipToBox(nearB, inflateBBox(bboxOfPolygons(nearA), reach));
        const envelopeA = offsetPolygons(nearA, firstOffset);
        const envelopeB = offsetPolygons(nearB, firstOffset);
        const shape = intersectPolygons(envelopeA, envelopeB);
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

/** Closed loops along the outline of an envelope, oriented for the milling direction. */
function envelopeLoops(envelope: readonly Polygon[], direction: MillingDirection): ToolpathSegment[]
{
    return polygonRings(envelope.map((polygon) => ({
        outer: withOrientation(polygon.outer, true),
        holes: polygon.holes.map((hole) => withOrientation(hole, false))
    }))).map((ring) => ({
        // Normalised rings keep the copper on their left: climb as is, conventional reversed
        points: direction === "climb" ? ring : [...ring].reverse(),
        closed: true
    }));
}

/**
 * Offsets (mm) beyond which a pass is grown from the previous pass envelope instead of from the copper. Growing by a
 * then by b is growing by a + b (Minkowski sums of discs), and the previous envelope has already merged most features:
 * on the dense benchmark board with a ground pour, 1.1 mm takes 33 s from the copper but 0.3 s from the 0.4 mm
 * envelope. For small offsets the envelope, rounded with many arc points, is slower to grow than the copper itself.
 */
export const CHAIN_OFFSET = 0.5;

/**
 * Passes computed together, as indices into offsets (increasing): a group starts from the copper, later passes of the
 * group are grown from the previous one. Groups are independent, computed in parallel by the CAM worker.
 */
export function passGroups(offsets: readonly number[]): number[][]
{
    const groups: number[][] = [];
    offsets.forEach((offset, index) =>
    {
        const last = groups[groups.length - 1];
        if (last && offset > CHAIN_OFFSET)
        {
            last.push(index);
        }
        else
        {
            groups.push([index]);
        }
    });
    return groups;
}

/** Closed loops of passes at the given offsets (mm, increasing), the first from the copper, each next one from the previous. */
export function isolationPasses(copper: readonly Polygon[], offsets: readonly number[], direction: MillingDirection): ToolpathSegment[][]
{
    let envelope: readonly Polygon[] = copper;
    let reached = 0;
    return offsets.map((offset) =>
    {
        // Arc errors add up along a chain: at most one arc tolerance per pass of the group
        envelope = offsetPolygons(envelope, mmToInternal(offset) - mmToInternal(reached));
        reached = offset;
        return envelopeLoops(envelope, direction);
    });
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
 * Isolation result from its parts, computed separately (in parallel workers): the loops of every pass (passes[i] at
 * offsets[i]) and the non-isolated areas. Orders the loops for cutting.
 */
export function assembleIsolation(passes: readonly ToolpathSegment[][], zones: NonIsolatedZone[], width: number,
    offsets: number[], params: Pick<IsolationParams, "combinePasses">): IsolationResult
{
    const segments = params.combinePasses
        ? orderSegments(passes.flat())
        : passes.reduce<ToolpathSegment[]>((ordered, loops) =>
        {
            const last = ordered[ordered.length - 1]?.points[0];
            return ordered.concat(orderSegments(loops, last));
        }, []);
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

/**
 * Isolation toolpaths of a copper layer with one tool.
 * spots are the clearance spots of the same copper (layer analysis), used to locate non-isolated areas.
 */
export function computeIsolation(copper: readonly Polygon[], spots: readonly ClearanceSpot[], tool: Tool,
    params: IsolationParams, onProgress: (fraction: number) => void = () => undefined): IsolationResult
{
    const width = toolWidth(tool);
    const offsets = passOffsets(width, params);
    const passes: ToolpathSegment[][] = [];
    passGroups(offsets).forEach((group, index, groups) =>
    {
        onProgress(index / (groups.length + 1));
        const loops = isolationPasses(copper, group.map((pass) => offsets[pass] ?? 0), params.direction);
        group.forEach((pass, rank) => (passes[pass] = loops[rank] ?? []));
    });
    onProgress(1 - 1 / (offsets.length + 1));
    const zones = nonIsolatedZones(copper, spots, mmToInternal(offsets[0] ?? width / 2));
    onProgress(1);
    return assembleIsolation(passes, zones, width, offsets, params);
}
