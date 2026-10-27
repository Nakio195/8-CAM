// Hole shapes of drilling data, for display, board analysis and checks against copper.

import { circlePath, strokePolylines, unionPolygons, type Polygon } from "@core/geometry/index";
import type { DrillDocument } from "./types";

/** Discs for hits and stadiums for slots, merged per tool. */
export function drillPolygons(document: DrillDocument, arcTolerance?: number): Polygon[]
{
    const shapes: Polygon[] = [];
    for (const hit of document.hits)
    {
        const tool = document.tools.get(hit.tool);
        if (tool)
        {
            shapes.push({ outer: circlePath(hit.point, tool.diameter / 2, arcTolerance), holes: [] });
        }
    }
    for (const slot of document.slots)
    {
        const tool = document.tools.get(slot.tool);
        if (tool)
        {
            shapes.push(...strokePolylines([slot.path], tool.diameter, { arcTolerance }));
        }
    }
    return unionPolygons(shapes);
}

/** Number of holes and slots per tool, sorted by diameter. */
export function drillSummary(document: DrillDocument): { tool: number; diameter: number; hits: number; slots: number }[]
{
    return [...document.tools.values()]
        .map((tool) => ({
            tool: tool.number,
            diameter: tool.diameter,
            hits: document.hits.filter((hit) => hit.tool === tool.number).length,
            slots: document.slots.filter((slot) => slot.tool === tool.number).length
        }))
        .sort((a, b) => a.diameter - b.diameter);
}
