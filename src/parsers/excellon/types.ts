import type { Path, Point } from "@core/geometry/index";
import type { LengthUnit } from "@core/units/index";

/** Whether holes are metallised. Plated holes are drilled before plating, non-plated after (or on a separate run). */
export type Plating = "plated" | "nonPlated" | "unknown";

export interface DrillTool
{
    /** Tool number in the file (T1, T01... → 1). */
    number: number;
    /** Hole diameter, internal units. */
    diameter: number;
    plating: Plating;
    line: number;
}

/** A drilled hole. */
export interface DrillHit
{
    tool: number;
    point: Point;
    line: number;
}

/**
 * A milled slot: G85 slots have two points, routed slots (M15 / M16) any number of points.
 * Arcs of routed slots are already discretised into the path.
 */
export interface DrillSlot
{
    tool: number;
    path: Path;
    line: number;
}

/** "leading": leading zeros are written and trailing zeros may be omitted (Excellon "LZ"); "trailing": the opposite ("TZ"). */
export type ExcellonZeros = "leading" | "trailing";

export interface ExcellonFormat
{
    integerDigits: number;
    decimalDigits: number;
    zeros: ExcellonZeros;
}

/** How the coordinate format was obtained: written in the file, guessed from the numbers, or forced by the user. */
export type FormatOrigin = "declared" | "guessed" | "forced";

export type DrillWarningCode =
    | "unknownCommand"
    | "unsupportedCommand"
    | "missingUnits"
    | "formatGuessed"
    | "invalidCoordinate"
    | "invalidTool"
    | "undefinedTool"
    | "noToolSelected"
    | "invalidSlot"
    | "invalidArc"
    | "missingEndOfFile"
    | "nonCircularAperture";

export interface DrillWarning
{
    code: DrillWarningCode;
    line: number;
    detail: string;
}

export interface DrillDocument
{
    source: "excellon" | "gerber";
    unit: LengthUnit;
    /** Coordinate format (Excellon only). */
    format: ExcellonFormat | null;
    formatOrigin: FormatOrigin | null;
    tools: Map<number, DrillTool>;
    hits: DrillHit[];
    slots: DrillSlot[];
    warnings: DrillWarning[];
}
