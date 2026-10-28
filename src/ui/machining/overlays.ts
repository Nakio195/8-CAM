// Toolpaths of the machining operations as extra layers of the board view (specification 6.9: cuts and rapids in
// distinct colours over the copper).

import type { CutoutOperation, DrillingOperation, IsolationOperation } from "@project/index";
import type { RenderLayer } from "@render/index";

/** Brand colours: isolation paths in training green, rapids in pink, non isolated areas in PRO yellow. */
const CUT_COLOR = "#1ebe96";
const TRAVEL_COLOR = "#faa0cd";
const ZONE_COLOR = "#ffe600";
/** The file order of the holes, for comparison: light prune, dashed (the bottom copper is already purple). */
const FILE_ORDER_COLOR = "#e4dfe3";
/** Cutout tabs in brand red over the green cutting band. */
const TAB_COLOR = "#eb0a4b";

export function toolpathOverlays(operations: readonly IsolationOperation[]): RenderLayer[]
{
    return operations.flatMap((operation): RenderLayer[] =>
    {
        const result = operation.result;
        if (!result)
        {
            return [];
        }
        const visible = operation.visible;
        return [
            // Band of the real cutting width, then the tool centre line
            { id: `${operation.id}-width`, geometry: result.loops, color: CUT_COLOR, opacity: 0.32, visible, style: "loop", strokeWidth: result.width },
            { id: `${operation.id}-centre`, geometry: result.loops, color: CUT_COLOR, opacity: 1, visible, style: "loop", strokeWidth: 0 },
            { id: `${operation.id}-travel`, geometry: result.travels, color: TRAVEL_COLOR, opacity: 0.85, visible, style: "line", strokeWidth: 0, dashed: true },
            { id: `${operation.id}-zones`, geometry: result.zoneShapes, color: ZONE_COLOR, opacity: 0.95, visible }
        ];
    });
}

export function drillingOverlays(operations: readonly DrillingOperation[]): RenderLayer[]
{
    return operations.flatMap((operation): RenderLayer[] =>
    {
        const result = operation.result;
        if (!result)
        {
            return [];
        }
        const visible = operation.visible;
        return [
            { id: `${operation.id}-file`, geometry: result.fileRoute, color: FILE_ORDER_COLOR, opacity: 0.9, visible: visible && operation.showFileOrder, style: "line", strokeWidth: 0, dashed: true },
            // Moves between holes are rapids, pink as the isolation ones
            { id: `${operation.id}-route`, geometry: result.route, color: TRAVEL_COLOR, opacity: 1, visible, style: "line", strokeWidth: 0 },
            { id: `${operation.id}-milled`, geometry: result.milledPaths, color: CUT_COLOR, opacity: 1, visible, style: "line", strokeWidth: 0 }
        ];
    });
}

export function cutoutOverlays(operations: readonly CutoutOperation[]): RenderLayer[]
{
    return operations.flatMap((operation): RenderLayer[] =>
    {
        const result = operation.result;
        if (!result)
        {
            return [];
        }
        const visible = operation.visible;
        return [
            { id: `${operation.id}-width`, geometry: result.contour, color: CUT_COLOR, opacity: 0.32, visible, style: "loop", strokeWidth: result.tool.diameter },
            { id: `${operation.id}-centre`, geometry: result.contour, color: CUT_COLOR, opacity: 1, visible, style: "loop", strokeWidth: 0 },
            { id: `${operation.id}-tabs`, geometry: result.tabMarks, color: TAB_COLOR, opacity: 0.95, visible }
        ];
    });
}
