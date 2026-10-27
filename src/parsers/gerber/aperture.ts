// Aperture templates (%AD) and their shapes, centred on the origin, in internal units.
// Reference: Gerber Layer Format Specification 2024.05 sections 4.4 and 4.5;
// FlatCAM appParsers/ParseGerber.py aperture_parse() and camlib.ApertureMacro.make_* methods.

import {
    arcPoints,
    circlePath,
    compose,
    differencePolygons,
    rectanglePath,
    rotation,
    transformPolygons,
    translation,
    unionPolygons,
    withOrientation,
    type Path,
    type Point,
    type Polygon
} from "@core/geometry/index";
import { INTERNAL_UNITS_PER_MM, MM_PER_INCH, type LengthUnit } from "@core/units/index";
import { evaluateApertureMacro, type ApertureMacro } from "./macro";

export type ApertureHole = { kind: "round"; diameter: number } | { kind: "rectangular"; width: number; height: number };

/** Sizes are in internal units, angles in degrees. */
export type ApertureTemplate =
    | { kind: "circle"; diameter: number; hole: ApertureHole | null }
    | { kind: "rectangle"; width: number; height: number; hole: ApertureHole | null }
    | { kind: "obround"; width: number; height: number; hole: ApertureHole | null }
    | { kind: "polygon"; diameter: number; vertices: number; rotation: number; hole: ApertureHole | null }
    | { kind: "macro"; name: string; parameters: number[] };

export interface ShapeOptions
{
    unit: LengthUnit;
    arcTolerance?: number;
}

export interface ShapeResult
{
    polygons: Polygon[];
    /** Problems met while building the shape (unknown primitive, invalid modifiers). */
    warnings: string[];
}

/** Internal units per file unit (not rounded: macro values are scaled before rounding the points). */
export function unitScale(unit: LengthUnit): number
{
    return unit === "in" ? INTERNAL_UNITS_PER_MM * MM_PER_INCH : INTERNAL_UNITS_PER_MM;
}

function holePolygon(hole: ApertureHole | null, arcTolerance: number | undefined): Polygon[]
{
    if (!hole)
    {
        return [];
    }
    if (hole.kind === "round")
    {
        return hole.diameter > 0 ? [{ outer: circlePath({ x: 0, y: 0 }, hole.diameter / 2, arcTolerance), holes: [] }] : [];
    }
    return [{ outer: centeredRectangle(hole.width, hole.height), holes: [] }];
}

function centeredRectangle(width: number, height: number): Path
{
    const halfWidth = Math.round(width / 2);
    const halfHeight = Math.round(height / 2);
    return rectanglePath(-halfWidth, -halfHeight, halfWidth, halfHeight);
}

/** Stadium: a rectangle with half discs on its short sides. */
function obroundPath(width: number, height: number, arcTolerance: number | undefined): Path
{
    if (width === height)
    {
        return circlePath({ x: 0, y: 0 }, width / 2, arcTolerance);
    }
    const radius = Math.min(width, height) / 2;
    const horizontal = width > height;
    const half = (Math.max(width, height) - 2 * radius) / 2;
    // Two half circles, counter-clockwise; the straight sides join their end points
    const centers: Point[] = horizontal ? [{ x: half, y: 0 }, { x: -half, y: 0 }] : [{ x: 0, y: half }, { x: 0, y: -half }];
    const startAngle = horizontal ? -Math.PI / 2 : 0;
    return centers.flatMap((center, index) =>
        arcPoints(center, radius, startAngle + index * Math.PI, Math.PI, arcTolerance));
}

function regularPolygonPath(diameter: number, vertices: number, degrees: number): Path
{
    const radius = diameter / 2;
    const start = (degrees * Math.PI) / 180;
    const points: Path = [];
    for (let i = 0; i < vertices; i++)
    {
        const angle = start + (2 * Math.PI * i) / vertices;
        points.push({ x: Math.round(radius * Math.cos(angle)), y: Math.round(radius * Math.sin(angle)) });
    }
    return points;
}

function withHole(outer: Path, hole: ApertureHole | null, arcTolerance: number | undefined): Polygon[]
{
    const shape: Polygon = { outer, holes: [] };
    const holes = holePolygon(hole, arcTolerance);
    if (holes.length === 0)
    {
        return [shape];
    }
    // A hole is transparent: it is part of the flash, not a clear area erasing what lies below
    return [{ outer, holes: holes.map((polygon) => withOrientation(polygon.outer, false)) }];
}

/** Shape of a standard aperture or of a macro instance, centred on the origin. */
export function apertureShape(template: ApertureTemplate, macros: ReadonlyMap<string, ApertureMacro>,
    options: ShapeOptions): ShapeResult
{
    const tolerance = options.arcTolerance;
    switch (template.kind)
    {
        case "circle":
            if (template.diameter <= 0)
            {
                return { polygons: [], warnings: [] };
            }
            return { polygons: withHole(circlePath({ x: 0, y: 0 }, template.diameter / 2, tolerance), template.hole, tolerance), warnings: [] };
        case "rectangle":
            if (template.width <= 0 || template.height <= 0)
            {
                return { polygons: [], warnings: [] };
            }
            return { polygons: withHole(centeredRectangle(template.width, template.height), template.hole, tolerance), warnings: [] };
        case "obround":
            if (template.width <= 0 || template.height <= 0)
            {
                return { polygons: [], warnings: [] };
            }
            return { polygons: withHole(obroundPath(template.width, template.height, tolerance), template.hole, tolerance), warnings: [] };
        case "polygon":
            if (template.diameter <= 0 || template.vertices < 3)
            {
                return { polygons: [], warnings: template.vertices < 3 ? ["Polygon aperture needs at least 3 vertices"] : [] };
            }
            return {
                polygons: withHole(regularPolygonPath(template.diameter, template.vertices, template.rotation), template.hole, tolerance),
                warnings: []
            };
        case "macro":
        {
            const macro = macros.get(template.name);
            if (!macro)
            {
                return { polygons: [], warnings: [`Undefined aperture macro '${template.name}'`] };
            }
            return macroShape(macro, template.parameters, options);
        }
    }
}

/** Builds a macro instance: primitives are combined in order, exposure off erases what precedes it. */
export function macroShape(macro: ApertureMacro, parameters: readonly number[], options: ShapeOptions): ShapeResult
{
    const warnings: string[] = [];
    const scale = unitScale(options.unit);
    let accumulated: Polygon[] = [];
    let pendingOn: Polygon[] = [];

    const flushOn = (): void =>
    {
        if (pendingOn.length > 0)
        {
            accumulated = unionPolygons([...accumulated, ...pendingOn]);
            pendingOn = [];
        }
    };

    for (const primitive of evaluateApertureMacro(macro, parameters))
    {
        const built = primitiveShape(primitive.code, primitive.modifiers, scale, options.arcTolerance);
        if (built.warning)
        {
            warnings.push(`Macro '${macro.name}': ${built.warning}`);
        }
        if (built.polygons.length === 0)
        {
            continue;
        }
        if (built.exposure)
        {
            pendingOn.push(...built.polygons);
        }
        else
        {
            flushOn();
            accumulated = differencePolygons(accumulated, built.polygons);
        }
    }
    flushOn();
    return { polygons: accumulated, warnings };
}

interface PrimitiveShape
{
    exposure: boolean;
    polygons: Polygon[];
    warning?: string;
}

function rotated(polygons: Polygon[], degrees: number): Polygon[]
{
    return degrees === 0 ? polygons : transformPolygons(polygons, rotation(degrees));
}

function ring(path: Path): Polygon
{
    return { outer: withOrientation(path, true), holes: [] };
}

/** Rectangle from start to end with the given width, square (butt) ends. */
function vectorLine(width: number, start: Point, end: Point): Path | null
{
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length === 0 || width <= 0)
    {
        return null;
    }
    const nx = (-(end.y - start.y) / length) * (width / 2);
    const ny = ((end.x - start.x) / length) * (width / 2);
    return [
        { x: Math.round(start.x - nx), y: Math.round(start.y - ny) },
        { x: Math.round(end.x - nx), y: Math.round(end.y - ny) },
        { x: Math.round(end.x + nx), y: Math.round(end.y + ny) },
        { x: Math.round(start.x + nx), y: Math.round(start.y + ny) }
    ];
}

/**
 * Shape of one macro primitive. Lengths in modifiers are file units and multiplied by scale;
 * rotations are degrees around the macro origin.
 */
function primitiveShape(code: number, values: readonly number[], scale: number, tolerance: number | undefined): PrimitiveShape
{
    const value = (index: number): number => values[index] ?? 0;
    const length = (index: number): number => value(index) * scale;
    const exposure = value(0) !== 0;

    switch (code)
    {
        case 1:
        {
            // Circle: exposure, diameter, centre x, centre y [, rotation]
            const diameter = length(1);
            if (diameter <= 0)
            {
                return { exposure, polygons: [] };
            }
            const disc = ring(circlePath({ x: length(2), y: length(3) }, diameter / 2, tolerance));
            return { exposure, polygons: rotated([disc], value(4)) };
        }
        case 2:
        case 20:
        {
            // Vector line: exposure, width, start x, start y, end x, end y, rotation (2 is the obsolete code)
            const path = vectorLine(length(1), { x: length(2), y: length(3) }, { x: length(4), y: length(5) });
            return { exposure, polygons: path ? rotated([ring(path)], value(6)) : [] };
        }
        case 21:
        {
            // Centre line: exposure, width, height, centre x, centre y, rotation
            const width = length(1);
            const height = length(2);
            if (width <= 0 || height <= 0)
            {
                return { exposure, polygons: [] };
            }
            const cx = length(3);
            const cy = length(4);
            const path = rectanglePath(Math.round(cx - width / 2), Math.round(cy - height / 2),
                Math.round(cx + width / 2), Math.round(cy + height / 2));
            return { exposure, polygons: rotated([ring(path)], value(5)) };
        }
        case 22:
        {
            // Lower left line (obsolete): exposure, width, height, lower left x, lower left y, rotation
            const x = length(3);
            const y = length(4);
            const path = rectanglePath(Math.round(x), Math.round(y), Math.round(x + length(1)), Math.round(y + length(2)));
            return { exposure, polygons: length(1) > 0 && length(2) > 0 ? rotated([ring(path)], value(5)) : [] };
        }
        case 4:
        {
            // Outline: exposure, vertex count n, n + 1 points (the last equals the first), rotation
            const count = Math.round(value(1));
            if (count < 3 || values.length < 2 + 2 * (count + 1))
            {
                return { exposure, polygons: [], warning: "outline primitive with too few points" };
            }
            const path: Path = [];
            for (let i = 0; i < count; i++)
            {
                path.push({ x: Math.round(length(2 + 2 * i)), y: Math.round(length(3 + 2 * i)) });
            }
            return { exposure, polygons: rotated([ring(path)], value(2 + 2 * (count + 1))) };
        }
        case 5:
        {
            // Polygon: exposure, vertex count, centre x, centre y, diameter, rotation
            const vertices = Math.round(value(1));
            if (vertices < 3 || length(4) <= 0)
            {
                return { exposure, polygons: [], warning: vertices < 3 ? "polygon primitive with fewer than 3 vertices" : undefined };
            }
            const shape = transformPolygons([ring(regularPolygonPath(length(4), vertices, 0))],
                compose(translation(length(2), length(3)), rotation(value(5))));
            return { exposure, polygons: shape };
        }
        case 6:
            return { exposure: true, polygons: moirePolygons(values, scale, tolerance) };
        case 7:
            return { exposure: true, polygons: thermalPolygons(values, scale, tolerance) };
        default:
            return { exposure, polygons: [], warning: `unsupported primitive ${code}` };
    }
}

/** Moiré (obsolete): centre x, centre y, outer diameter, ring thickness, gap, max rings, cross thickness, cross length, rotation. */
function moirePolygons(values: readonly number[], scale: number, tolerance: number | undefined): Polygon[]
{
    const value = (index: number): number => values[index] ?? 0;
    const center = { x: value(0) * scale, y: value(1) * scale };
    const thickness = value(3) * scale;
    const gap = value(4) * scale;
    const crossThickness = value(6) * scale;
    const crossLength = value(7) * scale;
    const shapes: Polygon[] = [];
    let diameter = value(2) * scale;
    for (let i = 0; i < Math.round(value(5)) && diameter > 0; i++)
    {
        const inner = diameter - 2 * thickness;
        const outer = ring(circlePath(center, diameter / 2, tolerance));
        if (inner > 0)
        {
            outer.holes.push(withOrientation(circlePath(center, inner / 2, tolerance), false));
        }
        shapes.push(outer);
        diameter = inner - 2 * gap;
    }
    if (crossThickness > 0 && crossLength > 0)
    {
        const half = crossLength / 2;
        const lineA = vectorLine(crossThickness, { x: center.x - half, y: center.y }, { x: center.x + half, y: center.y });
        const lineB = vectorLine(crossThickness, { x: center.x, y: center.y - half }, { x: center.x, y: center.y + half });
        for (const line of [lineA, lineB])
        {
            if (line)
            {
                shapes.push(ring(line));
            }
        }
    }
    return rotated(unionPolygons(shapes), value(8));
}

/** Thermal: centre x, centre y, outer diameter, inner diameter, gap thickness, rotation. */
function thermalPolygons(values: readonly number[], scale: number, tolerance: number | undefined): Polygon[]
{
    const value = (index: number): number => values[index] ?? 0;
    const center = { x: value(0) * scale, y: value(1) * scale };
    const outer = value(2) * scale;
    const inner = value(3) * scale;
    const gap = value(4) * scale;
    if (outer <= 0 || inner >= outer)
    {
        return [];
    }
    const annulus = ring(circlePath(center, outer / 2, tolerance));
    if (inner > 0)
    {
        annulus.holes.push(withOrientation(circlePath(center, inner / 2, tolerance), false));
    }
    const cuts: Polygon[] = [];
    if (gap > 0)
    {
        const half = outer / 2 + 1;
        const lineA = vectorLine(gap, { x: center.x - half, y: center.y }, { x: center.x + half, y: center.y });
        const lineB = vectorLine(gap, { x: center.x, y: center.y - half }, { x: center.x, y: center.y + half });
        for (const line of [lineA, lineB])
        {
            if (line)
            {
                cuts.push(ring(line));
            }
        }
    }
    return rotated(differencePolygons([annulus], cuts), value(5));
}

export interface ApertureDefinition
{
    code: number;
    template: ApertureTemplate;
}

const DEFINITION_RE = /^ADD(\d+)([A-Za-z_$.][A-Za-z0-9_$.-]*?)(?:,(.*))?$/;

/** Hole modifiers: one value is a round hole, two values an obsolete rectangular hole. */
function parseHole(values: readonly number[], scale: number): ApertureHole | null
{
    const [first, second] = values;
    if (first === undefined || first <= 0)
    {
        return null;
    }
    if (second !== undefined && second > 0)
    {
        return { kind: "rectangular", width: first * scale, height: second * scale };
    }
    return { kind: "round", diameter: first * scale };
}

/**
 * Parses the body of an %AD command ("ADD10C,0.4X0.2", "ADD12RoundRect,0.25X0.5").
 * Standard sizes are converted to internal units; macro parameters stay in file units.
 */
export function parseApertureDefinition(block: string, unit: LengthUnit): ApertureDefinition | { error: string }
{
    const match = DEFINITION_RE.exec(block);
    if (!match)
    {
        return { error: `Invalid aperture definition '${block}'` };
    }
    const code = Number(match[1]);
    const name = match[2] as string;
    const values = match[3] === undefined || match[3] === "" ? [] : match[3].split(/[Xx]/).map(Number);
    if (values.some((entry) => !Number.isFinite(entry)))
    {
        return { error: `Invalid aperture parameters '${block}'` };
    }
    const scale = unitScale(unit);
    const size = (index: number): number => (values[index] ?? 0) * scale;

    switch (name)
    {
        case "C":
            return { code, template: { kind: "circle", diameter: size(0), hole: parseHole(values.slice(1), scale) } };
        case "R":
            return { code, template: { kind: "rectangle", width: size(0), height: size(1), hole: parseHole(values.slice(2), scale) } };
        case "O":
            return { code, template: { kind: "obround", width: size(0), height: size(1), hole: parseHole(values.slice(2), scale) } };
        case "P":
            return {
                code,
                template: {
                    kind: "polygon",
                    diameter: size(0),
                    vertices: Math.round(values[1] ?? 0),
                    rotation: values[2] ?? 0,
                    hole: parseHole(values.slice(3), scale)
                }
            };
        default:
            return { code, template: { kind: "macro", name, parameters: values } };
    }
}

/** Width drawn by a circular aperture, or null when the aperture cannot draw tracks in the standard sense. */
export function strokeWidth(template: ApertureTemplate): number | null
{
    return template.kind === "circle" ? template.diameter : null;
}
