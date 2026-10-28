// Board cutout computation. A single contour is quick to compute: the user interface runs it directly, so the result
// follows every change of the settings and every tab clicked on the board (pure function, also usable in tests).

import {
    autoTabs,
    boardEdge,
    cutoutContour,
    cutoutMoves,
    planCutout,
    tabMarks
} from "@cam/cutout/index";
import { checkMoves, DEFAULT_RAPID_FEED, moveStatistics } from "@cam/toolpath/index";
import { packPolygons, pathLength, unpackPolygons, type Point } from "@core/geometry/index";
import { internalToMm, mmToInternal } from "@core/units/index";
import type { CutoutOutput, CutoutRequestData } from "@project/operations";

/** Tab centres spread automatically on the contour of a request (its own tabs are ignored). */
export function automaticTabs(request: Omit<CutoutRequestData, "tabs">, count: number): Point[]
{
    const edge = request.outline ? boardEdge(unpackPolygons(request.outline)) : null;
    const contour = cutoutContour(edge, request.box, request.params, request.tool.diameter);
    return autoTabs(contour, count, mmToInternal(request.params.tabWidth + request.tool.diameter))
        .map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }));
}

export function runCutout(request: CutoutRequestData): CutoutOutput
{
    const start = performance.now();
    const edge = request.outline ? boardEdge(unpackPolygons(request.outline)) : null;
    const contour = cutoutContour(edge, request.box, request.params, request.tool.diameter);
    const plan = planCutout(contour, request.tabs, request.params, request.tool);
    const moves = cutoutMoves(plan, request.tool);
    const statistics = moveStatistics(moves, DEFAULT_RAPID_FEED, { x: 0, y: 0, z: request.tool.safeZ });
    return {
        tool: request.tool,
        fromOutline: edge !== null,
        contour: packPolygons([{ outer: plan.contour, holes: [] }]),
        tabMarks: packPolygons(tabMarks(plan, request.params.tabWidth, request.tool.diameter)),
        tabs: plan.tabs.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) })),
        passes: plan.depths.length,
        lapLength: internalToMm(pathLength(plan.contour, true)),
        duration: statistics.duration,
        issues: plan.issues.map((issue) => issue.code),
        safetyIssues: checkMoves(moves, request.tool.travelZ, request.tool.safeZ).length,
        moves,
        computeMs: performance.now() - start
    };
}
