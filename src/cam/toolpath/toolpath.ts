// 2D toolpaths (internal units) and their conversion into machine moves.

import { bboxOfPaths, type BBox, type Path, type Point } from "@core/geometry/index";
import { internalToMm } from "@core/units/index";
import { passDepths } from "../tools/index";
import type { Move } from "./moves";

export interface ToolpathSegment
{
    points: Path;
    /** Closed loops end where they start; open paths (slots, cutout with tabs) do not. */
    closed: boolean;
}

function distanceSquared(a: Point, b: Point): number
{
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

function bboxDistanceSquared(point: Point, box: BBox): number
{
    const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX);
    const dy = Math.max(box.minY - point.y, 0, point.y - box.maxY);
    return dx * dx + dy * dy;
}

/**
 * Orders paths to shorten the travel between them (nearest neighbour): each closed loop is entered at its vertex
 * closest to the current position, open paths at their closer end. Bounding boxes prune most candidates.
 */
export function orderSegments(segments: readonly ToolpathSegment[], start: Point = { x: 0, y: 0 }): ToolpathSegment[]
{
    const remaining = segments.filter((segment) => segment.points.length > 0)
        .map((segment) => ({ segment, box: bboxOfPaths([segment.points]) }));
    const ordered: ToolpathSegment[] = [];
    let position = start;
    while (remaining.length > 0)
    {
        let bestIndex = 0;
        let bestVertex = 0;
        let bestReversed = false;
        let best = Infinity;
        remaining.forEach((candidate, index) =>
        {
            if (bboxDistanceSquared(position, candidate.box) >= best)
            {
                return;
            }
            const points = candidate.segment.points;
            if (candidate.segment.closed)
            {
                points.forEach((point, vertex) =>
                {
                    const value = distanceSquared(position, point);
                    if (value < best)
                    {
                        best = value;
                        bestIndex = index;
                        bestVertex = vertex;
                        bestReversed = false;
                    }
                });
            }
            else
            {
                const first = distanceSquared(position, points[0] as Point);
                const last = distanceSquared(position, points[points.length - 1] as Point);
                if (Math.min(first, last) < best)
                {
                    best = Math.min(first, last);
                    bestIndex = index;
                    bestVertex = 0;
                    bestReversed = last < first;
                }
            }
        });
        const [chosen] = remaining.splice(bestIndex, 1);
        if (!chosen)
        {
            break;
        }
        const points = chosen.segment.points;
        const arranged = chosen.segment.closed
            ? [...points.slice(bestVertex), ...points.slice(0, bestVertex)]
            : bestReversed ? [...points].reverse() : points;
        ordered.push({ points: arranged, closed: chosen.segment.closed });
        position = chosen.segment.closed ? arranged[0] as Point : arranged[arranged.length - 1] as Point;
    }
    return ordered;
}

/** Length of the rapid moves between consecutive segments, starting from start (internal units). */
export function travelLength(segments: readonly ToolpathSegment[], start: Point = { x: 0, y: 0 }): number
{
    let position = start;
    let length = 0;
    for (const segment of segments)
    {
        const first = segment.points[0];
        if (!first)
        {
            continue;
        }
        length += Math.sqrt(distanceSquared(position, first));
        position = segment.closed ? first : segment.points[segment.points.length - 1] as Point;
    }
    return length;
}

export interface CutParameters
{
    toolId: string;
    /** mm, positive. */
    cutDepth: number;
    depthPerPass: number;
    feedXY: number;
    feedZ: number;
    spindleSpeed: number;
    travelZ: number;
    safeZ: number;
}

/**
 * Moves cutting the segments in order: start at safe height with the spindle running, for each segment a rapid at
 * travel height above its start, plunges at the Z feed down to each depth in turn, cuts at the XY feed, then back to
 * travel height; safe height and spindle stop at the end (specification section 7).
 */
export function segmentsToMoves(segments: readonly ToolpathSegment[], cut: CutParameters, label = ""): Move[]
{
    const mm = internalToMm;
    const moves: Move[] = [];
    if (label)
    {
        moves.push({ kind: "comment", text: label });
    }
    moves.push({ kind: "toolChange", toolId: cut.toolId });
    moves.push({ kind: "rapid", z: cut.safeZ });
    moves.push({ kind: "spindle", on: true, rpm: cut.spindleSpeed });
    const depths = passDepths(cut.cutDepth, cut.depthPerPass);
    for (const segment of segments)
    {
        const first = segment.points[0];
        if (!first)
        {
            continue;
        }
        moves.push({ kind: "rapid", z: cut.travelZ });
        moves.push({ kind: "rapid", x: mm(first.x), y: mm(first.y) });
        depths.forEach((depth, index) =>
        {
            // Open paths are cut back and forth so each depth starts where the previous one ended
            const forward = segment.closed || index % 2 === 0;
            const points = forward ? segment.points : [...segment.points].reverse();
            moves.push({ kind: "linear", z: -depth, feed: cut.feedZ });
            for (const point of points.slice(1))
            {
                moves.push({ kind: "linear", x: mm(point.x), y: mm(point.y), feed: cut.feedXY });
            }
            if (segment.closed)
            {
                moves.push({ kind: "linear", x: mm(first.x), y: mm(first.y), feed: cut.feedXY });
            }
        });
        moves.push({ kind: "rapid", z: cut.travelZ });
    }
    moves.push({ kind: "rapid", z: cut.safeZ });
    moves.push({ kind: "spindle", on: false });
    return moves;
}

/**
 * Duration of segmentsToMoves(segments, cut) without building the moves (seconds): the same cut, plunge and rapid
 * lengths, starting at safe height above (0, 0). Large boards produce hundreds of thousands of moves.
 */
export function estimateDuration(segments: readonly ToolpathSegment[], cut: CutParameters, rapidFeed: number): number
{
    const depths = passDepths(cut.cutDepth, cut.depthPerPass);
    const deepest = depths[depths.length - 1] ?? 0;
    let cutMinutes = 0;
    let plungeMinutes = 0;
    let rapidLength = 0;
    let position: Point = { x: 0, y: 0 };
    let atSafe = true;
    for (const segment of segments)
    {
        const first = segment.points[0];
        if (!first)
        {
            continue;
        }
        let planeLength = 0;
        for (let i = 1; i < segment.points.length; i++)
        {
            planeLength += Math.sqrt(distanceSquared(segment.points[i - 1] as Point, segment.points[i] as Point));
        }
        if (segment.closed && segment.points.length > 1)
        {
            planeLength += Math.sqrt(distanceSquared(segment.points[segment.points.length - 1] as Point, first));
        }
        // Down from travel height, then from depth to depth; up to travel height at the end
        rapidLength += (atSafe ? cut.safeZ - cut.travelZ : 0) + internalToMm(Math.sqrt(distanceSquared(position, first)));
        plungeMinutes += (cut.travelZ + deepest) / cut.feedZ;
        cutMinutes += (internalToMm(planeLength) * depths.length) / cut.feedXY;
        rapidLength += deepest + cut.travelZ;
        const last = segment.closed || depths.length % 2 === 0 ? first : segment.points[segment.points.length - 1] as Point;
        position = last;
        atSafe = false;
    }
    rapidLength += atSafe ? 0 : cut.safeZ - cut.travelZ;
    return (cutMinutes + plungeMinutes + rapidLength / rapidFeed) * 60;
}
