// Machining operations of a project and their computed results (what the CAM worker sends back).

import type { ClearanceSpot } from "@cam/analysis/index";
import type { CutoutIssueCode, CutoutParams } from "@cam/cutout/index";
import { DEFAULT_DRILLING, type DrillingIssue, type DrillingParams, type DrillMethod, type RouteDistances } from "@cam/drilling/index";
import { DEFAULT_ISOLATION, type IsolationParams } from "@cam/isolation/index";
import type { Move } from "@cam/toolpath/index";
import type { Tool } from "@cam/tools/index";
import type { BBox, Path, PackedPolygons, Point } from "@core/geometry/index";

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

/** What one tool does in a drilling operation. */
export interface DrillRunOutput
{
    /** Tool as it was when computing. */
    tool: Tool;
    method: DrillMethod;
    /** Hole diameters made by the tool, internal units. */
    diameters: number[];
    hits: number;
    milled: number;
    slots: number;
    distances: RouteDistances;
}

export interface DrillingOutput
{
    runs: DrillRunOutput[];
    issues: DrillingIssue[];
    distances: RouteDistances;
    /** Route of every tool in cutting order (one open path per tool, from where the previous tool ended). */
    route: PackedPolygons;
    /** The same holes in the order of the file, to compare. */
    fileRoute: PackedPolygons;
    /** Circles followed by the tool centre in milled holes, and slot paths, as open lines. */
    milledPaths: PackedPolygons;
    toolChanges: number;
    /** Estimated machining time, seconds. */
    duration: number;
    /** Machine safety problems found in the generated moves (none expected). */
    safetyIssues: number;
    /** Machine moves of each tool (same order as runs), written to G-code by the export (Gerber millimetres). */
    runMoves: Move[][];
    computeMs: number;
}

export interface DrillingOperation
{
    id: string;
    kind: "drilling";
    /** Drill layers whose holes are machined together. */
    layerIds: string[];
    /** Tool chosen for each hole diameter (internal units as a string key); null: hole size left out. */
    assignments: Record<string, string | null>;
    params: DrillingParams;
    result: DrillingOutput | null;
    visible: boolean;
    /** Also draws the route in the order of the file, to see what the optimisation saves. */
    showFileOrder: boolean;
}

export interface CutoutOutput
{
    /** Tool as it was when computing. */
    tool: Tool;
    /** False when the cut goes around the copper because no outline layer was chosen. */
    fromOutline: boolean;
    /** Closed path of the tool centre (one ring). */
    contour: PackedPolygons;
    /** One small rectangle across the path at each tab, for display. */
    tabMarks: PackedPolygons;
    /** Tab centres on the contour, internal units. */
    tabs: Point[];
    passes: number;
    /** Length of one lap, mm. */
    lapLength: number;
    /** Estimated machining time, seconds. */
    duration: number;
    issues: CutoutIssueCode[];
    /** Machine safety problems found in the generated moves (none expected). */
    safetyIssues: number;
    /** Machine moves, written to G-code by the export (Gerber millimetres). */
    moves: Move[];
    computeMs: number;
}

export interface CutoutOperation
{
    id: string;
    kind: "cutout";
    /** Outline layer giving the board edge; null: around the copper with a margin. */
    outlineLayerId: string | null;
    toolId: string;
    params: CutoutParams;
    /** Number of tabs placed automatically. */
    tabCount: number;
    /** Tab centres, internal units: placed automatically, then moved by clicks on the board. */
    tabs: Point[];
    result: CutoutOutput | null;
    visible: boolean;
}

export type Operation = IsolationOperation | DrillingOperation | CutoutOperation;

/** What the cutout computation needs. */
export interface CutoutRequestData
{
    /** Polygons of the outline layer, or null to go around box. */
    outline: PackedPolygons | null;
    /** Bounding box of the copper and drill layers, internal units. */
    box: BBox;
    tool: Tool;
    params: CutoutParams;
    tabs: Point[];
    /** Rapid speed of the machine for the time estimate, mm/min (DEFAULT_RAPID_FEED when not given). */
    rapidFeed?: number;
}

export function createIsolation(id: string, layerId: string, toolId: string): IsolationOperation
{
    return { id, kind: "isolation", layerId, toolId, params: { ...DEFAULT_ISOLATION }, result: null, visible: true };
}

export function createDrilling(id: string, layerIds: string[], assignments: Record<string, string | null>, depth: number): DrillingOperation
{
    return { id, kind: "drilling", layerIds, assignments, params: { ...DEFAULT_DRILLING, depth }, result: null, visible: true,
        showFileOrder: false };
}

/** Holes of one diameter, with the tool chosen for them (null: left out). */
export interface DrillingSetData
{
    diameter: number;
    holes: Point[];
    slots: Path[];
    tool: Tool | null;
}

/** What the CAM worker needs to plan a drilling operation. */
export interface DrillingRequestData
{
    sets: DrillingSetData[];
    params: DrillingParams;
    /** Rapid speed of the machine for the time estimate, mm/min (DEFAULT_RAPID_FEED when not given). */
    rapidFeed?: number;
}

/** What the CAM worker needs to compute an isolation. */
export interface IsolationRequestData
{
    copper: PackedPolygons;
    spots: ClearanceSpot[];
    tool: Tool;
    params: IsolationParams;
    /** Rapid speed of the machine for the time estimate, mm/min (DEFAULT_RAPID_FEED when not given). */
    rapidFeed?: number;
}
