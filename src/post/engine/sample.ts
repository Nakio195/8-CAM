// A small but complete job used to preview a profile while editing it (specification 6.8: live G-code preview) and
// as the reference job of the golden tests: isolation of two pads, three holes pecked with a dwell, a cutout with two
// tabs. Every kind of move and every template of a profile shows up in it.

import { autoTabs, cutoutContour, cutoutMoves, DEFAULT_CUTOUT, planCutout } from "@cam/cutout/index";
import { DEFAULT_DRILLING, drillingMoves, planDrilling } from "@cam/drilling/index";
import { segmentsToMoves } from "@cam/toolpath/index";
import type { Tool } from "@cam/tools/index";
import { rectanglePath } from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";
import type { PostJob } from "./writer";

export interface SampleTools
{
    isolation: { tool: Tool; label: string };
    drill: { tool: Tool; label: string };
    cutout: { tool: Tool; label: string };
}

export function sampleJob(tools: SampleTools, date: Date, version: string): PostJob
{
    const MM = mmToInternal(1);
    const { isolation, drill, cutout } = tools;
    const isolationMoves = segmentsToMoves([
        { points: rectanglePath(2 * MM, 2 * MM, 4 * MM, 4 * MM), closed: true },
        { points: rectanglePath(8 * MM, 2 * MM, 10 * MM, 4 * MM), closed: true }
    ], { ...isolation.tool, toolId: isolation.tool.id }, "Isolation");
    const drillMoves = drillingMoves(planDrilling([{
        diameter: drill.tool.diameter * MM,
        holes: [{ x: 3 * MM, y: 3 * MM }, { x: 9 * MM, y: 3 * MM }, { x: 6 * MM, y: 8 * MM }],
        slots: [],
        tool: drill.tool
    }]), { ...DEFAULT_DRILLING, cycle: "peck", peckDepth: 0.9, dwell: 0.5 });
    const contour = cutoutContour(null, { minX: 0, minY: 0, maxX: 12 * MM, maxY: 10 * MM },
        { ...DEFAULT_CUTOUT, mode: "rectangle", margin: 1 }, cutout.tool.diameter);
    const plan = planCutout(contour, autoTabs(contour, 2, (DEFAULT_CUTOUT.tabWidth + cutout.tool.diameter) * MM), DEFAULT_CUTOUT, cutout.tool);
    return {
        name: "Sample board",
        version,
        date,
        operations: [
            { label: "Isolation", tool: isolation.tool, toolLabel: isolation.label, moves: isolationMoves },
            { label: "Drilling", tool: drill.tool, toolLabel: drill.label, moves: drillMoves },
            { label: "Cutout", tool: cutout.tool, toolLabel: cutout.label, moves: cutoutMoves(plan, cutout.tool) }
        ]
    };
}
