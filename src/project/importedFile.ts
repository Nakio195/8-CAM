// Result of importing one file: what the import worker sends back and what a project layer keeps.

import type { CopperAnalysis } from "@cam/analysis/index";
import type { BBox, PackedPolygons } from "@core/geometry/index";
import type { LengthUnit } from "@core/units/index";
import type { DrillTool, Plating } from "@parsers/excellon/index";
import type { LayerType } from "@parsers/gerber/index";

export type FileFormat = "gerber" | "excellon";

export interface ImportWarning
{
    /** Gerber or drill warning code, translated by the user interface. */
    code: string;
    line: number;
    detail: string;
}

export interface DrillSummaryEntry
{
    tool: number;
    diameter: number;
    plating: Plating;
    hits: number;
    slots: number;
}

export interface ImportedDrill
{
    tools: DrillTool[];
    hits: { tool: number; x: number; y: number }[];
    slots: { tool: number; path: { x: number; y: number }[] }[];
    summary: DrillSummaryEntry[];
}

export interface ImportedFile
{
    fileName: string;
    format: FileFormat;
    layerType: LayerType;
    unit: LengthUnit;
    /** Filled geometry to draw: copper image, outline, or holes for drill files. */
    geometry: PackedPolygons;
    bbox: BBox;
    /** Drilling data when the file is a drill file (Excellon or Gerber X2 drill). */
    drill: ImportedDrill | null;
    /** Clearances and track width, for copper layers (and layers of unknown type, which may be copper). */
    analysis: CopperAnalysis | null;
    warnings: ImportWarning[];
    stats: { objects: number; polygons: number; points: number; parseMs: number; buildMs: number; analysisMs: number };
}
