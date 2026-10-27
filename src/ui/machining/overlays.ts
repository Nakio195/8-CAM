// Toolpaths of the machining operations as extra layers of the board view (specification 6.9: cuts and rapids in
// distinct colours over the copper).

import type { IsolationOperation } from "@project/index";
import type { RenderLayer } from "@render/index";

/** Brand colours: isolation paths in training green, rapids in pink, non isolated areas in PRO yellow. */
const CUT_COLOR = "#1ebe96";
const TRAVEL_COLOR = "#faa0cd";
const ZONE_COLOR = "#ffe600";

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
