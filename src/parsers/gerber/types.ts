import type { Path, Point } from "@core/geometry/index";
import type { LengthUnit } from "@core/units/index";
import type { ApertureTemplate } from "./aperture";
import type { CoordinateFormat } from "./format";
import type { ApertureMacro } from "./macro";

export type Polarity = "dark" | "clear";

/** X2 attributes: name (".AperFunction", ".N", custom names) to values. Shared and never mutated. */
export type AttributeSet = Readonly<Record<string, readonly string[]>>;

/** Aperture transformation set by %LM, %LR and %LS (applies to flashes and aperture shapes, not to coordinates). */
export interface ApertureTransform
{
    mirrorX: boolean;
    mirrorY: boolean;
    /** Degrees, counter-clockwise. */
    rotation: number;
    scale: number;
}

export interface GerberAperture
{
    code: number;
    template: ApertureTemplate;
    /** Aperture attributes (%TA) active when the aperture was defined. */
    attributes: AttributeSet;
    line: number;
}

interface ObjectBase
{
    polarity: Polarity;
    /** Object attributes (%TO) active when the object was created. */
    attributes: AttributeSet;
    /** Line of the command that created the object. */
    line: number;
}

export interface FlashObject extends ObjectBase
{
    kind: "flash";
    aperture: number;
    point: Point;
    transform: ApertureTransform;
}

/** Consecutive D01 draws with the same aperture; arcs are already discretised into the path. */
export interface TrackObject extends ObjectBase
{
    kind: "track";
    aperture: number;
    path: Path;
    transform: ApertureTransform;
}

/** G36 / G37 region: each contour is a closed ring (cut-ins allowed). */
export interface RegionObject extends ObjectBase
{
    kind: "region";
    contours: Path[];
}

export type GraphicObject = FlashObject | TrackObject | RegionObject;

/**
 * Warning codes are stable identifiers translated by the user interface;
 * detail is an English description for logs.
 */
export type GerberWarningCode =
    | "unterminatedCommand"
    | "unknownCommand"
    | "unsupportedCommand"
    | "deprecatedCommand"
    | "invalidFormat"
    | "missingFormat"
    | "missingUnits"
    | "invalidCoordinate"
    | "invalidAperture"
    | "invalidMacro"
    | "apertureShape"
    | "undefinedAperture"
    | "noApertureSelected"
    | "noQuadrantMode"
    | "invalidArc"
    | "invalidRegion"
    | "flashInRegion"
    | "invalidStepRepeat"
    | "invalidAttribute"
    | "negativeImage"
    | "missingEndOfFile"
    | "contentAfterEndOfFile";

export interface GerberWarning
{
    code: GerberWarningCode;
    line: number;
    detail: string;
}

export interface GerberDocument
{
    unit: LengthUnit;
    format: CoordinateFormat | null;
    fileAttributes: AttributeSet;
    apertures: Map<number, GerberAperture>;
    macros: Map<string, ApertureMacro>;
    /** Graphics objects in file order, step and repeat already expanded. */
    objects: GraphicObject[];
    /** %IPNEG (obsolete) is reported, not applied. */
    imagePolarity: "positive" | "negative";
    endOfFile: boolean;
    warnings: GerberWarning[];
}
