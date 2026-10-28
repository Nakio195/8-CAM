// Board cutout (specification 6.6): the tool goes around the board, outside it, through the whole thickness; tabs
// keep the board held in the last passes. Reference: FlatCAM appPlugins/ToolCutOut.py (freeform: geometry buffered by
// margin + dia / 2; rectangular: bounding box + margin + dia / 2; gaps subtracted at fixed places along the board
// axes). Here tabs are placed by distance along the contour, which also works on round or L-shaped boards.

import {
    bboxOfPaths,
    distance,
    offsetPolygons,
    pathLength,
    polygonArea,
    rectanglePath,
    signedArea,
    withOrientation,
    type BBox,
    type Path,
    type Point,
    type Polygon
} from "@core/geometry/index";
import { internalToMm, mmToInternal } from "@core/units/index";
import type { MillingDirection } from "../isolation/index";
import type { Move } from "../toolpath/index";
import { passDepths, type Tool } from "../tools/index";

/** Shape: the tool follows the board outline. Rectangle: the bounding rectangle of the board (faster, simpler). */
export type CutoutMode = "shape" | "rectangle";

export interface CutoutParams
{
    mode: CutoutMode;
    /** Distance kept between the board edge and the cut, mm. */
    margin: number;
    /** Climb keeps the board on the left of the tool (counter-clockwise around it); conventional the opposite. */
    direction: MillingDirection;
    /** Depth of the cut, mm: the board thickness plus a margin into the spoil board. */
    depth: number;
    /** Board thickness, mm: the tabs are measured from the bottom of the board. */
    thickness: number;
    /** Width of each tab along the board edge, mm. */
    tabWidth: number;
    /** Board material left under each tab, mm (from the bottom of the board). */
    tabHeight: number;
}

/** Extra depth below the board so the cut goes through (same as the cutout recommendation of J5). */
export const CUTOUT_DEPTH_MARGIN = 0.1;

export const DEFAULT_CUTOUT: Readonly<CutoutParams> = {
    mode: "shape",
    margin: 0,
    direction: "conventional",
    depth: 1.6 + CUTOUT_DEPTH_MARGIN,
    thickness: 1.6,
    tabWidth: 2,
    tabHeight: 0.6
};

/** Margin used around the copper when the project has no outline layer, mm. */
export const BOUNDING_BOX_MARGIN = 2;

/** Problems found while planning; codes are translated by the user interface. */
export type CutoutIssueCode = "tabsOverlap" | "tabTooHigh" | "noTabs" | "tabsTooMany";

/**
 * Board edge drawn in an outline layer: the largest outer outline, holes filled. Outlines are usually drawn as lines,
 * so the layer holds a band around the real edge: the edge is the middle of that band, half its width inside its outer
 * ring. The band width is its area divided by the mean length of its two rings. A filled outline is used as is.
 */
export function boardEdge(outline: readonly Polygon[]): Polygon | null
{
    let largest: Polygon | null = null;
    for (const polygon of outline)
    {
        if (!largest || Math.abs(signedArea(polygon.outer)) > Math.abs(signedArea(largest.outer)))
        {
            largest = polygon;
        }
    }
    if (!largest)
    {
        return null;
    }
    const filled: Polygon = { outer: largest.outer, holes: [] };
    const inner = largest.holes.reduce<Path | null>((best, hole) =>
        (!best || Math.abs(signedArea(hole)) > Math.abs(signedArea(best)) ? hole : best), null);
    if (!inner)
    {
        return filled;
    }
    const band = polygonArea({ outer: largest.outer, holes: [inner] });
    const width = (2 * band) / (pathLength(largest.outer, true) + pathLength(inner, true));
    // A band wider than a tenth of the board is not a drawn line: keep the outer outline
    const box = bboxOfPaths([largest.outer]);
    if (width <= 0 || width > Math.min(box.maxX - box.minX, box.maxY - box.minY) / 10)
    {
        return filled;
    }
    return offsetPolygons([filled], -width / 2).reduce<Polygon | null>((best, polygon) =>
        (!best || Math.abs(signedArea(polygon.outer)) > Math.abs(signedArea(best.outer)) ? polygon : best), null) ?? filled;
}

/**
 * Closed path followed by the tool centre, internal units: around the board edge (or a rectangle) at margin + tool
 * radius, oriented for the milling direction. Without an edge, around box (the copper) with the margin.
 */
export function cutoutContour(edge: Polygon | null, box: BBox, params: Pick<CutoutParams, "mode" | "margin" | "direction">,
    toolDiameter: number): Path
{
    const reach = mmToInternal(params.margin + toolDiameter / 2);
    let contour: Path;
    if (edge && params.mode === "shape")
    {
        const grown = offsetPolygons([{ outer: edge.outer, holes: [] }], reach);
        contour = grown.reduce<Path>((best, polygon) =>
            (Math.abs(signedArea(polygon.outer)) > Math.abs(signedArea(best)) ? polygon.outer : best), []);
    }
    else
    {
        const bounds = edge ? bboxOfPaths([edge.outer]) : box;
        contour = rectanglePath(bounds.minX - reach, bounds.minY - reach, bounds.maxX + reach, bounds.maxY + reach);
    }
    // Counter-clockwise keeps the board on the left of the tool: climb milling with a clockwise spindle
    return withOrientation(contour, params.direction === "climb");
}

/** Distance from the start of the closed path to each vertex, and the total length. */
function arcLengths(path: Path): { at: number[]; total: number }
{
    const at: number[] = [0];
    for (let i = 1; i < path.length; i++)
    {
        at.push((at[i - 1] ?? 0) + distance(path[i - 1] as Point, path[i] as Point));
    }
    const last = path[path.length - 1];
    const first = path[0];
    return { at, total: (at[at.length - 1] ?? 0) + (last && first ? distance(last, first) : 0) };
}

/** Point of the closed path at distance s from its start. */
export function pointAt(path: Path, s: number): Point
{
    const { at, total } = arcLengths(path);
    const position = total > 0 ? ((s % total) + total) % total : 0;
    for (let i = 0; i < path.length; i++)
    {
        const start = at[i] ?? 0;
        const a = path[i] as Point;
        const b = path[(i + 1) % path.length] as Point;
        const length = distance(a, b);
        if (position <= start + length || i === path.length - 1)
        {
            const t = length > 0 ? (position - start) / length : 0;
            return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
    }
    return path[0] ?? { x: 0, y: 0 };
}

/** Distance along the closed path of the point of the path nearest to point. */
export function projectOnPath(path: Path, point: Point): { s: number; distance: number }
{
    const { at } = arcLengths(path);
    let best = { s: 0, distance: Infinity };
    for (let i = 0; i < path.length; i++)
    {
        const a = path[i] as Point;
        const b = path[(i + 1) % path.length] as Point;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
        const value = Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
        if (value < best.distance)
        {
            best = { s: (at[i] ?? 0) + t * Math.sqrt(lengthSquared), distance: value };
        }
    }
    return best;
}

/**
 * Tabs spread evenly along the contour, the first in the middle of its longest straight edge: on a rectangle, 2 tabs
 * fall in the middle of the two long sides and 4 in the middle of every side. Each tab is then slid onto a straight
 * edge long enough to hold it (gap = tab width + tool diameter, internal units), so it never sits on a rounded corner.
 * Returns the tab centres as points of the contour.
 */
export function autoTabs(contour: Path, count: number, gap: number): Point[]
{
    const { at, total } = arcLengths(contour);
    const tabs = Math.max(0, Math.round(count));
    if (contour.length < 2 || tabs === 0 || total <= 0)
    {
        return [];
    }
    const edges = contour.map((point, index) => ({ start: at[index] ?? 0, length: distance(point, contour[(index + 1) % contour.length] as Point) }));
    const longest = edges.reduce((best, edge) => (edge.length > best.length ? edge : best));
    const first = longest.start + longest.length / 2;
    const fitting = edges.filter((edge) => edge.length >= gap);
    return Array.from({ length: tabs }, (_, index) =>
    {
        const target = (first + (index * total) / tabs) % total;
        // Nearest place on an edge able to hold the whole gap (distances measured around the loop)
        let best = target;
        let bestDistance = Infinity;
        for (const edge of fitting)
        {
            const low = edge.start + gap / 2;
            const high = edge.start + edge.length - gap / 2;
            const clamped = Math.max(low, Math.min(high, target));
            const around = Math.min(Math.abs(clamped - target), total - Math.abs(clamped - target));
            if (around < bestDistance)
            {
                bestDistance = around;
                best = clamped;
            }
        }
        return pointAt(contour, best);
    });
}

export interface CutoutIssue
{
    code: CutoutIssueCode;
}

export interface CutoutPlan
{
    /** Closed path of the tool centre, starting between two tabs, internal units. */
    contour: Path;
    /** Tab centres projected on the contour, in cutting order. */
    tabs: Point[];
    /** Parts of the contour cut at tab height in the deep passes: [start, end] distances from the contour start. */
    gaps: [number, number][];
    /** Depth of each pass, mm (positive). */
    depths: number[];
    /** Z of the top of the tabs, mm (negative: below the surface). */
    tabTop: number;
    issues: CutoutIssue[];
}

/**
 * Cutout plan: tabs placed on the contour (the given points, projected), the contour restarted in the middle of the
 * longest stretch without tab so the tool never plunges on a tab, and the depth of each pass.
 */
export function planCutout(contour: Path, tabPoints: readonly Point[], params: CutoutParams, tool: Tool): CutoutPlan
{
    const issues: CutoutIssue[] = [];
    const depths = passDepths(params.depth, tool.depthPerPass);
    const tabTop = -Math.max(0, params.thickness - params.tabHeight);
    if (params.tabHeight >= params.thickness)
    {
        issues.push({ code: "tabTooHigh" });
    }
    const { total } = arcLengths(contour);
    const gap = mmToInternal(params.tabWidth + tool.diameter);
    const positions = tabPoints.map((point) => projectOnPath(contour, point).s).sort((a, b) => a - b);
    if (positions.length === 0)
    {
        issues.push({ code: "noTabs" });
    }
    if (positions.length * gap >= total)
    {
        issues.push({ code: "tabsTooMany" });
    }
    else if (positions.some((s, index) => index > 0 && s - (positions[index - 1] ?? 0) < gap)
        || (positions.length > 1 && total - (positions[positions.length - 1] ?? 0) + (positions[0] ?? 0) < gap))
    {
        issues.push({ code: "tabsOverlap" });
    }

    // Restart the loop in the middle of the longest stretch between two tabs
    let start = 0;
    if (positions.length > 0)
    {
        let longest = -1;
        positions.forEach((s, index) =>
        {
            const next = index + 1 < positions.length ? (positions[index + 1] ?? 0) : (positions[0] ?? 0) + total;
            if (next - s > longest)
            {
                longest = next - s;
                start = (s + (next - s) / 2) % total;
            }
        });
    }
    const rotated = restartAt(contour, start);
    const shifted = positions.map((s) => (((s - start) % total) + total) % total).sort((a, b) => a - b);
    return {
        contour: rotated,
        tabs: shifted.map((s) => pointAt(rotated, s)),
        gaps: shifted.map((s): [number, number] => [Math.max(0, s - gap / 2), Math.min(total, s + gap / 2)]),
        depths,
        tabTop,
        issues
    };
}

/** The same closed path starting at distance s along it (a vertex is inserted there). */
function restartAt(path: Path, s: number): Path
{
    if (s <= 0 || path.length < 2)
    {
        return [...path];
    }
    const { at } = arcLengths(path);
    let index = path.length - 1;
    for (let i = 0; i < path.length; i++)
    {
        const next = i + 1 < path.length ? (at[i + 1] ?? 0) : Infinity;
        if (s < next)
        {
            index = i;
            break;
        }
    }
    const point = pointAt(path, s);
    const rounded = { x: Math.round(point.x), y: Math.round(point.y) };
    return [rounded, ...path.slice(index + 1), ...path.slice(0, index + 1)];
}

/**
 * Machine moves of a cutout plan: tool change at safe height, spindle on, rapid above the start at travel height,
 * then for each pass a plunge at the Z feed and one lap at the XY feed. In passes deeper than the top of the tabs, the
 * tool rises to the top of the tab over each gap and goes back down after it. Safe height and spindle stop at the end.
 */
export function cutoutMoves(plan: CutoutPlan, tool: Tool): Move[]
{
    const mm = internalToMm;
    const contour = plan.contour;
    const first = contour[0];
    if (!first)
    {
        return [];
    }
    const moves: Move[] = [
        { kind: "comment", text: `Cutout ${tool.id} ${tool.diameter} mm` },
        { kind: "rapid", z: tool.safeZ },
        { kind: "toolChange", toolId: tool.id },
        { kind: "spindle", on: true, rpm: tool.spindleSpeed },
        { kind: "rapid", z: tool.travelZ },
        { kind: "rapid", x: mm(first.x), y: mm(first.y) }
    ];
    const { at, total } = arcLengths(contour);
    // The lap as the places where something happens: vertices (back to the first one) and gap boundaries
    const stops = [
        ...contour.slice(1).map((point, index) => ({ s: at[index + 1] ?? 0, point })),
        { s: total, point: first },
        ...plan.gaps.flat().filter((s) => s > 0 && s < total).map((s) => ({ s, point: pointAt(contour, s) }))
    ].sort((a, b) => a.s - b.s);
    const inGap = (s: number): boolean => plan.gaps.some(([low, high]) => s > low && s < high);
    for (const level of plan.depths)
    {
        const deep = -level < plan.tabTop;
        moves.push({ kind: "linear", z: -level, feed: tool.feedZ });
        let currentZ = -level;
        let previous = 0;
        for (const { s, point } of stops)
        {
            if (s - previous < 1)
            {
                continue;
            }
            const middle = (previous + s) / 2;
            const z = deep && inGap(middle) ? plan.tabTop : -level;
            if (z !== currentZ)
            {
                // Up onto the tab (or down after it) before moving on
                moves.push({ kind: "linear", z, feed: tool.feedZ });
                currentZ = z;
            }
            moves.push({ kind: "linear", x: mm(point.x), y: mm(point.y), feed: tool.feedXY });
            previous = s;
        }
    }
    moves.push({ kind: "rapid", z: tool.travelZ });
    moves.push({ kind: "rapid", z: tool.safeZ });
    moves.push({ kind: "spindle", on: false });
    return moves;
}

/** Small rectangles across the contour at each tab, for display: as long as the tab, as wide as the tool. */
export function tabMarks(plan: CutoutPlan, tabWidth: number, toolDiameter: number): Polygon[]
{
    const half = mmToInternal(tabWidth) / 2;
    const across = mmToInternal(toolDiameter) / 2;
    return plan.tabs.map((centre) =>
    {
        const { s } = projectOnPath(plan.contour, centre);
        const before = pointAt(plan.contour, s - half);
        const after = pointAt(plan.contour, s + half);
        const length = Math.max(1, distance(before, after));
        const nx = (-(after.y - before.y) / length) * across;
        const ny = ((after.x - before.x) / length) * across;
        return {
            outer: [
                { x: Math.round(before.x + nx), y: Math.round(before.y + ny) },
                { x: Math.round(after.x + nx), y: Math.round(after.y + ny) },
                { x: Math.round(after.x - nx), y: Math.round(after.y - ny) },
                { x: Math.round(before.x - nx), y: Math.round(before.y - ny) }
            ],
            holes: []
        };
    });
}
