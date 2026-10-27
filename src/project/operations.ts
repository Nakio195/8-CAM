// Machining operations of a project and their computed results (what the CAM worker sends back).

import type { ClearanceSpot } from "@cam/analysis/index";
import { DEFAULT_ISOLATION, type IsolationParams } from "@cam/isolation/index";
import type { Tool } from "@cam/tools/index";
import type { PackedPolygons, Point } from "@core/geometry/index";

export interface IsolationZoneOutput
{
    polygons: [number, number];
    centre: Point;
    /** Gap between the two features, internal units. */
    gap: number;
}

export interface IsolationOutput
{
    /** Tool as it was when computing, so later library edits do not silently change the result. */
    tool: Tool;
    /** Closed loops in cutting order, one ring per packed polygon (internal units). */
    loops: PackedPolygons;
    /** Moves between loops as open two-point lines, one ring per packed polygon. */
    travels: PackedPolygons;
    zones: IsolationZoneOutput[];
    /** Areas the tool cannot isolate, for display. */
    zoneShapes: PackedPolygons;
    loopsPerPass: number[];
    /** mm. */
    width: number;
    offsets: number[];
    /** Plane length of the loops, mm (one depth). */
    cutLength: number;
    travelLength: number;
    /** Estimated machining time with every depth pass, plunge and rapid, seconds. */
    duration: number;
    computeMs: number;
}

export interface IsolationOperation
{
    id: string;
    kind: "isolation";
    layerId: string;
    toolId: string;
    params: IsolationParams;
    result: IsolationOutput | null;
    visible: boolean;
}

export type Operation = IsolationOperation;

export function createIsolation(id: string, layerId: string, toolId: string): IsolationOperation
{
    return { id, kind: "isolation", layerId, toolId, params: { ...DEFAULT_ISOLATION }, result: null, visible: true };
}

/** What the CAM worker needs to compute an isolation. */
export interface IsolationRequestData
{
    copper: PackedPolygons;
    spots: ClearanceSpot[];
    tool: Tool;
    params: IsolationParams;
}
