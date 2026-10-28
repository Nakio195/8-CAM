// Drilling planned in the CAM worker (pure function, also usable in tests).

import { drillingMoves, planDrilling, type DrillingPlan } from "@cam/drilling/index";
import { checkMoves, DEFAULT_RAPID_FEED, moveStatistics } from "@cam/toolpath/index";
import { arcSegmentCount, packPolygons, type Path, type Point, type Polygon } from "@core/geometry/index";
import type { DrillingOutput, DrillingRequestData } from "@project/operations";

const ORIGIN: Point = { x: 0, y: 0 };

/** Open line through the points (a packed polygon with one ring, drawn as a line). */
function line(points: Path): Polygon
{
    return { outer: points, holes: [] };
}

function circle(centre: Point, radius: number): Path
{
    const steps = Math.max(12, arcSegmentCount(radius, 2 * Math.PI));
    return Array.from({ length: steps + 1 }, (_, i) => ({
        x: Math.round(centre.x + radius * Math.cos((2 * Math.PI * i) / steps)),
        y: Math.round(centre.y + radius * Math.sin((2 * Math.PI * i) / steps))
    }));
}

/** Route of each tool from where the previous one ended, through its holes then its slots. */
function routes(plan: DrillingPlan): Polygon[]
{
    let position = ORIGIN;
    return plan.runs.map((run) =>
    {
        const points: Point[] = [position];
        points.push(...run.hits, ...run.milled.map((hole) => hole.centre));
        for (const slot of run.slots)
        {
            points.push(...slot);
        }
        position = points[points.length - 1] ?? position;
        return line(points);
    });
}

export function runDrilling(request: DrillingRequestData): DrillingOutput
{
    const start = performance.now();
    const plan = planDrilling(request.sets, ORIGIN);
    const moves = drillingMoves(plan, request.params);
    const statistics = moveStatistics(moves, request.rapidFeed ?? DEFAULT_RAPID_FEED, { ...ORIGIN, z: plan.runs[0]?.tool.safeZ ?? 0 });
    // Each tool has its own moves (exported as its own operation) and heights: its moves are checked against them
    const runMoves = plan.runs.map((run) => drillingMoves({ ...plan, runs: [run] }, request.params));
    const safety = plan.runs.reduce((count, run, index) => count + checkMoves(runMoves[index] ?? [], run.tool.travelZ, run.tool.safeZ).length, 0);

    // The order of the file, tool by tool as the plan groups them: what the optimisation is compared with
    let filePosition = ORIGIN;
    const fileRoute = plan.runs.map((run) =>
    {
        const holes = request.sets.filter((set) => set.tool && run.diameters.includes(set.diameter) && set.tool.id === run.tool.id)
            .flatMap((set) => set.holes);
        const points = [filePosition, ...holes];
        filePosition = points[points.length - 1] ?? filePosition;
        return line(points);
    });

    const milledPaths = plan.runs.flatMap((run) => [
        ...run.milled.filter((hole) => hole.radius > 0).map((hole) => line(circle(hole.centre, hole.radius))),
        ...run.slots.map(line)
    ]);

    return {
        runs: plan.runs.map((run) => ({
            tool: run.tool,
            method: run.method,
            diameters: run.diameters,
            hits: run.hits.length,
            milled: run.milled.length,
            slots: run.slots.length,
            distances: run.distances
        })),
        issues: plan.issues,
        distances: plan.distances,
        route: packPolygons(routes(plan)),
        fileRoute: packPolygons(fileRoute),
        milledPaths: packPolygons(milledPaths),
        toolChanges: plan.runs.length,
        duration: statistics.duration,
        safetyIssues: safety,
        runMoves,
        computeMs: performance.now() - start
    };
}
