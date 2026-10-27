// Drilling (specification 6.5): holes drilled per tool in an optimised order, holes too large for the drills milled
// along a helix, slots milled along their path. Reference: FlatCAM appPlugins/ToolDrilling.py and
// camlib.CNCjob.excellon_tool_gcode_gen (per hole: rapid at travel height, down at the Z feed, back up; peck drilling
// as successive depths with a lift in between).

import { arcSegmentCount, type Path, type Point } from "@core/geometry/index";
import { internalToMm, mmToInternal } from "@core/units/index";
import type { Move } from "../toolpath/index";
import { passDepths, type Tool } from "../tools/index";
import { nearestNeighbourOrder, routeLength, twoOpt } from "./order";

/** Simple: one plunge to the full depth. Peck: plunges by steps, lifting out of the hole in between to clear chips. */
export type DrillCycle = "simple" | "peck";

export interface DrillingParams
{
    cycle: DrillCycle;
    /** Depth drilled at each peck, mm. */
    peckDepth: number;
    /** Pause at the bottom of every hole, s (0 for none). */
    dwell: number;
    /** Depth of every hole, mm: through the board plus a margin into the spoil board. */
    depth: number;
}

/** Extra depth below the board so holes go through (same margin as the built-in drills of the library). */
export const DRILL_EXTRA_DEPTH = 0.2;

export const DEFAULT_DRILLING: Readonly<DrillingParams> = {
    cycle: "simple",
    peckDepth: 0.5,
    dwell: 0,
    depth: 1.6 + DRILL_EXTRA_DEPTH
};

/**
 * Pecks restart this high above the surface (mm): the hole above the previous depth is already drilled, but rapids
 * stay out of the material (specification section 7), so the drill feeds down from here.
 */
export const PECK_RESTART_HEIGHT = 0.5;

/** Every hole of one size of a drill file, with the tool chosen for it (null: not machined). */
export interface HoleSet
{
    /** Hole diameter, internal units. */
    diameter: number;
    holes: Point[];
    slots: Path[];
    tool: Tool | null;
}

export type DrillMethod = "drill" | "mill";

/** Problems found while planning; codes are translated by the user interface. */
export type DrillingIssueCode = "noTool" | "toolTooLarge" | "slotWithDrill" | "drillTooSmall";

export interface DrillingIssue
{
    code: DrillingIssueCode;
    /** Hole diameter concerned, internal units. */
    diameter: number;
    count: number;
}

/** Distances moved between holes for one tool, internal units. */
export interface RouteDistances
{
    /** Holes in the order of the file. */
    file: number;
    nearest: number;
    optimized: number;
}

/** Holes milled with an end mill: the centre and the radius of the circle followed by the tool centre. */
export interface MilledHole
{
    centre: Point;
    /** Internal units; 0 when the tool is exactly as wide as the hole (plunged like a drill). */
    radius: number;
}

/** Everything one tool does, in cutting order. */
export interface ToolRun
{
    tool: Tool;
    method: DrillMethod;
    /** Hole diameters made by this tool, internal units. */
    diameters: number[];
    /** Drilled holes (method drill) in cutting order. */
    hits: Point[];
    /** Milled holes (method mill) in cutting order. */
    milled: MilledHole[];
    /** Slots in cutting order, each oriented in its cutting direction. */
    slots: Path[];
    distances: RouteDistances;
}

export interface DrillingPlan
{
    runs: ToolRun[];
    issues: DrillingIssue[];
    /** Sums over every tool. */
    distances: RouteDistances;
}

/** Drills plunge; end mills follow a helix inside the hole (or plunge when exactly as wide as the hole). */
export function drillMethod(tool: Tool): DrillMethod
{
    return tool.type === "drill" ? "drill" : "mill";
}

interface Stop
{
    point: Point;
    hit?: Point;
    milled?: MilledHole;
}

/** Orders the stops of one tool from start: nearest neighbour then 2-opt, with the distances of each order. */
function orderStops(stops: readonly Stop[], start: Point): { ordered: Stop[]; distances: RouteDistances }
{
    const points = stops.map((stop) => stop.point);
    const nearest = nearestNeighbourOrder(points, start);
    const optimized = twoOpt(points, nearest, start);
    const nearestLength = routeLength(nearest.map((index) => points[index] as Point), start);
    const optimizedPoints = optimized.map((index) => points[index] as Point);
    // 2-opt never lengthens the route; keep nearest neighbour if rounding says otherwise
    const best = routeLength(optimizedPoints, start) <= nearestLength ? optimized : nearest;
    return {
        ordered: best.map((index) => stops[index] as Stop),
        distances: { file: routeLength(points, start), nearest: nearestLength, optimized: routeLength(best.map((index) => points[index] as Point), start) }
    };
}

/** Travel between slots cut in the order of the file, from start. */
function fileSlotLength(slots: readonly Path[], start: Point): number
{
    let length = 0;
    let position = start;
    for (const slot of slots.filter((entry) => entry.length > 0))
    {
        length += Math.hypot((slot[0] as Point).x - position.x, (slot[0] as Point).y - position.y);
        position = slot[slot.length - 1] as Point;
    }
    return length;
}

/** Slots in nearest neighbour order from start, each entered at its closer end. */
function orderSlots(slots: readonly Path[], start: Point): { ordered: Path[]; length: number }
{
    const remaining = slots.filter((slot) => slot.length > 0);
    const ordered: Path[] = [];
    let position = start;
    let length = 0;
    while (remaining.length > 0)
    {
        let best = 0;
        let reversed = false;
        let bestDistance = Infinity;
        remaining.forEach((slot, index) =>
        {
            const first = Math.hypot((slot[0] as Point).x - position.x, (slot[0] as Point).y - position.y);
            const last = Math.hypot((slot[slot.length - 1] as Point).x - position.x, (slot[slot.length - 1] as Point).y - position.y);
            if (Math.min(first, last) < bestDistance)
            {
                bestDistance = Math.min(first, last);
                best = index;
                reversed = last < first;
            }
        });
        const [slot] = remaining.splice(best, 1);
        const path = reversed ? [...(slot as Path)].reverse() : (slot as Path);
        ordered.push(path);
        length += bestDistance;
        position = path[path.length - 1] as Point;
    }
    return { ordered, length };
}

/**
 * Groups the hole sets by tool (smallest tool first, as usual: small drills are the most fragile and the board is
 * still well held) and orders each tool's work, starting from the machine origin.
 */
export function planDrilling(sets: readonly HoleSet[], start: Point = { x: 0, y: 0 }): DrillingPlan
{
    const issues: DrillingIssue[] = [];
    const byTool = new Map<string, { tool: Tool; method: DrillMethod; diameters: number[]; stops: Stop[]; slots: Path[] }>();
    for (const set of sets)
    {
        const count = set.holes.length + set.slots.length;
        if (count === 0)
        {
            continue;
        }
        if (!set.tool)
        {
            issues.push({ code: "noTool", diameter: set.diameter, count });
            continue;
        }
        const tool = set.tool;
        const toolDiameter = mmToInternal(tool.diameter);
        const method = drillMethod(tool);
        if (method === "mill" && toolDiameter > set.diameter + 1)
        {
            issues.push({ code: "toolTooLarge", diameter: set.diameter, count });
            continue;
        }
        if (method === "drill" && set.slots.length > 0)
        {
            issues.push({ code: "slotWithDrill", diameter: set.diameter, count: set.slots.length });
        }
        if (method === "drill" && toolDiameter < set.diameter * 0.9)
        {
            issues.push({ code: "drillTooSmall", diameter: set.diameter, count: set.holes.length });
        }
        const key = `${tool.id}:${method}`;
        const entry = byTool.get(key) ?? { tool, method, diameters: [], stops: [], slots: [] };
        entry.diameters.push(set.diameter);
        const radius = Math.max(0, (set.diameter - toolDiameter) / 2);
        for (const hole of set.holes)
        {
            entry.stops.push(method === "drill" ? { point: hole, hit: hole } : { point: hole, milled: { centre: hole, radius } });
        }
        entry.slots.push(...set.slots);
        byTool.set(key, entry);
    }

    const runs: ToolRun[] = [];
    let position = start;
    const total: RouteDistances = { file: 0, nearest: 0, optimized: 0 };
    const entries = [...byTool.values()].sort((a, b) => a.tool.diameter - b.tool.diameter || a.method.localeCompare(b.method));
    for (const entry of entries)
    {
        const { ordered, distances } = orderStops(entry.stops, position);
        const after = ordered[ordered.length - 1]?.point ?? position;
        const slots = orderSlots(entry.slots, after);
        const fileAfter = entry.stops[entry.stops.length - 1]?.point ?? position;
        const run: ToolRun = {
            tool: entry.tool,
            method: entry.method,
            diameters: entry.diameters.sort((a, b) => a - b),
            hits: ordered.flatMap((stop) => (stop.hit ? [stop.hit] : [])),
            milled: ordered.flatMap((stop) => (stop.milled ? [stop.milled] : [])),
            slots: slots.ordered,
            distances: {
                file: distances.file + fileSlotLength(entry.slots, fileAfter),
                nearest: distances.nearest + slots.length,
                optimized: distances.optimized + slots.length
            }
        };
        runs.push(run);
        total.file += run.distances.file;
        total.nearest += run.distances.nearest;
        total.optimized += run.distances.optimized;
        const lastSlot = slots.ordered[slots.ordered.length - 1];
        position = lastSlot ? (lastSlot[lastSlot.length - 1] as Point) : after;
    }
    return { runs, issues, distances: total };
}

/** Points of a full circle around centre starting at its rightmost point, counter-clockwise, internal units. */
function circlePoints(centre: Point, radius: number): Point[]
{
    const steps = Math.max(8, arcSegmentCount(radius, 2 * Math.PI));
    const points: Point[] = [];
    for (let i = 0; i <= steps; i++)
    {
        const angle = (2 * Math.PI * i) / steps;
        points.push({ x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) });
    }
    return points;
}

/**
 * Machine moves of a drilling plan: per tool a tool change at safe height and the spindle at the tool speed, then
 * - drilled holes: rapid above the hole at travel height, plunge at the Z feed (by pecks if asked), optional dwell,
 *   rapid back to travel height;
 * - milled holes: helix down along the circle (one turn per depth pass of the tool), a last full turn at depth,
 *   back to the centre and up (counter-clockwise: conventional milling with a clockwise spindle);
 * - slots: back and forth along the path, one depth pass of the tool each way.
 * Safe height and spindle stop at the end (specification section 7).
 */
export function drillingMoves(plan: DrillingPlan, params: DrillingParams): Move[]
{
    const mm = internalToMm;
    const moves: Move[] = [];
    for (const run of plan.runs)
    {
        const tool = run.tool;
        moves.push({ kind: "comment", text: `${tool.id} ${tool.diameter} mm` });
        moves.push({ kind: "rapid", z: tool.safeZ });
        moves.push({ kind: "toolChange", toolId: tool.id });
        moves.push({ kind: "spindle", on: true, rpm: tool.spindleSpeed });
        moves.push({ kind: "rapid", z: tool.travelZ });
        const depth = params.depth;

        for (const hole of run.hits)
        {
            moves.push({ kind: "rapid", x: mm(hole.x), y: mm(hole.y) });
            const depths = params.cycle === "peck" ? passDepths(depth, Math.max(0.05, params.peckDepth)) : [depth];
            depths.forEach((level, index) =>
            {
                if (index > 0)
                {
                    moves.push({ kind: "rapid", z: Math.min(tool.travelZ, PECK_RESTART_HEIGHT) });
                }
                moves.push({ kind: "linear", z: -level, feed: tool.feedZ });
                if (index === depths.length - 1 && params.dwell > 0)
                {
                    moves.push({ kind: "dwell", seconds: params.dwell });
                }
                moves.push({ kind: "rapid", z: tool.travelZ });
            });
        }

        const feed = tool.feedXY > 0 ? tool.feedXY : tool.feedZ;
        const levels = passDepths(depth, Math.max(0.05, tool.depthPerPass));
        for (const hole of run.milled)
        {
            if (hole.radius <= 0)
            {
                moves.push({ kind: "rapid", x: mm(hole.centre.x), y: mm(hole.centre.y) });
                moves.push({ kind: "linear", z: -depth, feed: tool.feedZ });
                moves.push({ kind: "rapid", z: tool.travelZ });
                continue;
            }
            const circle = circlePoints(hole.centre, hole.radius);
            const first = circle[0] as Point;
            moves.push({ kind: "rapid", x: mm(first.x), y: mm(first.y) });
            moves.push({ kind: "linear", z: 0, feed: tool.feedZ });
            let reached = 0;
            for (const level of levels)
            {
                // One turn going down from the previous level to this one
                circle.slice(1).forEach((point, index) =>
                {
                    const z = -(reached + ((level - reached) * (index + 1)) / (circle.length - 1));
                    moves.push({ kind: "linear", x: mm(point.x), y: mm(point.y), z, feed });
                });
                reached = level;
            }
            for (const point of circle.slice(1))
            {
                moves.push({ kind: "linear", x: mm(point.x), y: mm(point.y), feed });
            }
            moves.push({ kind: "linear", x: mm(hole.centre.x), y: mm(hole.centre.y), feed });
            moves.push({ kind: "rapid", z: tool.travelZ });
        }

        for (const slot of run.slots)
        {
            const first = slot[0] as Point;
            moves.push({ kind: "rapid", x: mm(first.x), y: mm(first.y) });
            levels.forEach((level, index) =>
            {
                const points = index % 2 === 0 ? slot : [...slot].reverse();
                moves.push({ kind: "linear", z: -level, feed: tool.feedZ });
                for (const point of points.slice(1))
                {
                    moves.push({ kind: "linear", x: mm(point.x), y: mm(point.y), feed });
                }
            });
            moves.push({ kind: "rapid", z: tool.travelZ });
        }
        moves.push({ kind: "rapid", z: tool.safeZ });
        moves.push({ kind: "spindle", on: false });
    }
    return moves;
}
