// Assisted tool choice (specification 6.10): isolation, drilling and cutout recommendations from the board summary.
// Lengths of the board summary are internal units; tool parameters are millimetres.

import { mmToInternal } from "@core/units/index";
import { passCount, toolWidth, type Tool } from "../tools/index";
import type { BoardSummary, HoleSize } from "./board";

export type IsolationStatus = "suitable" | "limit" | "tooWide";

/** A tool is "limit" when it leaves less than this share of the minimum clearance (specification 6.10). */
export const LIMIT_MARGIN = 0.1;

export interface IsolationAdvice
{
    tool: Tool;
    /** Width cut at the tool's depth, mm. */
    width: number;
    status: IsolationStatus;
    /** Places where the tool is wider than the gap between two copper features. */
    nonIsolated: number;
    /** (clearance - width) / clearance; null when the board has no measured clearance. */
    margin: number | null;
}

function canIsolate(tool: Tool): boolean
{
    return tool.type !== "drill" && (tool.usages.includes("isolation") || tool.type === "vbit");
}

/**
 * Isolation tools rated against the board: suitable ones first from the most robust (widest) to the finest,
 * then the borderline ones, then those too wide, with the fewest non-isolated areas first.
 */
export function recommendIsolation(tools: readonly Tool[], board: BoardSummary): IsolationAdvice[]
{
    const clearance = board.minClearance?.distance ?? null;
    const advice = tools.filter(canIsolate).map((tool): IsolationAdvice =>
    {
        const width = toolWidth(tool);
        const widthInternal = mmToInternal(width);
        // One internal unit of tolerance: a tool exactly as wide as the gap still passes
        const nonIsolated = board.spots.filter((spot) => spot.distance + 1 < widthInternal).length;
        const margin = clearance === null || clearance === 0 ? null : (clearance - widthInternal) / clearance;
        let status: IsolationStatus = "suitable";
        if (nonIsolated > 0)
        {
            status = "tooWide";
        }
        else if (margin !== null && margin < LIMIT_MARGIN)
        {
            status = "limit";
        }
        return { tool, width, status, nonIsolated, margin };
    });
    const order: Record<IsolationStatus, number> = { suitable: 0, limit: 1, tooWide: 2 };
    return advice.sort((first, second) =>
        order[first.status] - order[second.status]
        || (first.status === "tooWide" ? first.nonIsolated - second.nonIsolated : second.width - first.width));
}

export type HoleMethod = "drill" | "mill" | "none";

export interface HoleAdvice
{
    hole: HoleSize;
    method: HoleMethod;
    /** Drill or end mill chosen for the hole. */
    tool: Tool | null;
    /** Drill diameter minus hole diameter, mm (positive: the hole comes out larger). */
    deviation: number;
    /** Deviation relative to the hole diameter. */
    deviationRatio: number;
    /** Deviation beyond the tolerance: the nearest drill is still proposed but should be checked. */
    outOfTolerance: boolean;
}

export interface DrillingAdvice
{
    holes: HoleAdvice[];
    /** Drills actually used, with the hole sizes each one makes. */
    groups: { tool: Tool; holes: HoleSize[] }[];
    /** Tool changes avoided by drilling close hole sizes with the same drill. */
    changesSaved: number;
}

/** A drill may differ from the hole by this much (mm) or this share of the hole, whichever is larger. */
export const DRILL_TOLERANCE_MM = 0.1;
export const DRILL_TOLERANCE_RATIO = 0.1;

/**
 * Nearest drill for every hole size (specification 6.5); holes larger than the biggest drill (beyond tolerance) are
 * milled with the largest end mill smaller than the hole.
 */
export function recommendDrilling(tools: readonly Tool[], board: BoardSummary): DrillingAdvice
{
    const drills = tools.filter((tool) => tool.type === "drill").sort((first, second) => first.diameter - second.diameter);
    const mills = tools.filter((tool) => tool.type === "endmill" && tool.usages.includes("holeMilling"))
        .sort((first, second) => second.diameter - first.diameter);
    const largestDrill = drills[drills.length - 1]?.diameter ?? 0;

    const holes = board.holes.map((hole): HoleAdvice =>
    {
        const diameter = hole.diameter / mmToInternal(1);
        const tolerance = Math.max(DRILL_TOLERANCE_MM, DRILL_TOLERANCE_RATIO * diameter);
        if (diameter > largestDrill + tolerance)
        {
            const mill = mills.find((tool) => tool.diameter < diameter) ?? null;
            return {
                hole,
                method: mill ? "mill" : "none",
                tool: mill,
                deviation: 0,
                deviationRatio: 0,
                outOfTolerance: false
            };
        }
        let nearest: Tool | null = null;
        for (const drill of drills)
        {
            if (!nearest || Math.abs(drill.diameter - diameter) < Math.abs(nearest.diameter - diameter))
            {
                nearest = drill;
            }
        }
        if (!nearest)
        {
            return { hole, method: "none", tool: null, deviation: 0, deviationRatio: 0, outOfTolerance: false };
        }
        const deviation = nearest.diameter - diameter;
        return {
            hole,
            method: "drill",
            tool: nearest,
            deviation,
            deviationRatio: deviation / diameter,
            outOfTolerance: Math.abs(deviation) > tolerance + 1e-9
        };
    });

    const groups = new Map<string, { tool: Tool; holes: HoleSize[] }>();
    for (const advice of holes)
    {
        if (advice.method === "drill" && advice.tool)
        {
            const group = groups.get(advice.tool.id) ?? { tool: advice.tool, holes: [] };
            group.holes.push(advice.hole);
            groups.set(advice.tool.id, group);
        }
    }
    const drilledSizes = holes.filter((advice) => advice.method === "drill").length;
    return { holes, groups: [...groups.values()], changesSaved: drilledSizes - groups.size };
}

export interface CutoutAdvice
{
    tool: Tool;
    passes: number;
    /** Depth to cut through the board, mm. */
    depth: number;
    recommended: boolean;
}

/** Extra depth below the board so the cut goes through (specification 6.10: through + margin). */
export const CUTOUT_EXTRA_DEPTH = 0.1;

/**
 * End mills able to cut the board out, with the number of passes for the board thickness.
 * Tools meant for cutout come first, then the ones needing the fewest passes.
 */
export function recommendCutout(tools: readonly Tool[], board: BoardSummary): CutoutAdvice[]
{
    const depth = board.thickness + CUTOUT_EXTRA_DEPTH;
    const advice = tools
        .filter((tool) => tool.type === "endmill" && tool.diameter >= 0.8)
        .map((tool) => ({ tool, passes: passCount(depth, tool.depthPerPass), depth, recommended: false }))
        .sort((first, second) =>
            Number(second.tool.usages.includes("cutout")) - Number(first.tool.usages.includes("cutout"))
            || first.passes - second.passes
            || second.tool.diameter - first.tool.diameter);
    if (advice[0])
    {
        advice[0].recommended = true;
    }
    return advice;
}
