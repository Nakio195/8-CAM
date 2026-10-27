// Gerber RS-274X / X2 parser: turns commands into graphics objects (flashes, tracks, regions).
// Reference: Gerber Layer Format Specification 2024.05; FlatCAM appParsers/ParseGerber.py parse_lines().
// The parser never throws on file content: problems become warnings with line numbers.
// Building the copper geometry from the objects is a separate step (see builder.ts).

import { arcBetween, arcSweep, DEFAULT_ARC_TOLERANCE, type Path, type Point } from "@core/geometry/index";
import type { LengthUnit } from "@core/units/index";
import { parseApertureDefinition } from "./aperture";
import { decodeCoordinate, decodeLength, defaultFormat, parseFormatSpecification, type CoordinateFormat } from "./format";
import { lexGerber, type GerberCommand } from "./lexer";
import { MacroSyntaxError, parseApertureMacro, type ApertureMacro } from "./macro";
import type {
    ApertureTransform,
    AttributeSet,
    GerberAperture,
    GerberDocument,
    GerberWarningCode,
    GraphicObject,
    Polarity,
    RegionObject,
    TrackObject
} from "./types";

export interface GerberParseOptions
{
    /** Maximum chord error used to discretise arcs, internal units. */
    arcTolerance?: number;
    /** Called with a fraction between 0 and 1 while parsing. */
    onProgress?: (fraction: number) => void;
}

type Interpolation = "linear" | "clockwise" | "counterClockwise";

interface StepRepeat
{
    startIndex: number;
    countX: number;
    countY: number;
    stepX: number;
    stepY: number;
    line: number;
}

const NO_TRANSFORM: ApertureTransform = Object.freeze({ mirrorX: false, mirrorY: false, rotation: 0, scale: 1 });
const EMPTY_ATTRIBUTES: AttributeSet = Object.freeze({});
const PROGRESS_STEP = 5000;

// Deprecated image parameters and other commands accepted but ignored
const IGNORED_EXTENDED = /^(IN|LN|AS|IR|MI|OF|SF|IJ|IO|KO|PF|RO|SM|TS)/;
const WORD_RE = /([GDMXYIJ])([+-]?[\d.]+)/g;

class GerberParser
{
    private mDocument: GerberDocument;
    private mArcTolerance: number;
    private mUnit: LengthUnit | null = null;
    private mFormat: CoordinateFormat | null = null;
    private mCurrent: Point = { x: 0, y: 0 };
    private mAperture: number | null = null;
    private mInterpolation: Interpolation = "linear";
    private mQuadrant: "single" | "multi" | null = null;
    private mPolarity: Polarity = "dark";
    private mTransform: ApertureTransform = NO_TRANSFORM;
    private mApertureAttributes: AttributeSet = EMPTY_ATTRIBUTES;
    private mObjectAttributes: AttributeSet = EMPTY_ATTRIBUTES;
    private mLastOperation: 1 | 2 | 3 | null = null;
    private mTrack: TrackObject | null = null;
    private mRegion: RegionObject | null = null;
    private mContour: Path | null = null;
    private mStepRepeat: StepRepeat | null = null;
    private mReported = new Set<GerberWarningCode>();

    constructor(options: GerberParseOptions)
    {
        this.mArcTolerance = options.arcTolerance ?? DEFAULT_ARC_TOLERANCE;
        this.mDocument = {
            unit: "in",
            format: null,
            fileAttributes: EMPTY_ATTRIBUTES,
            apertures: new Map<number, GerberAperture>(),
            macros: new Map<string, ApertureMacro>(),
            objects: [],
            imagePolarity: "positive",
            endOfFile: false,
            warnings: []
        };
    }

    public parse(source: string, onProgress?: (fraction: number) => void): GerberDocument
    {
        const { commands, unterminated } = lexGerber(source);
        for (let i = 0; i < commands.length; i++)
        {
            const command = commands[i] as GerberCommand;
            if (this.mDocument.endOfFile)
            {
                this.warn("contentAfterEndOfFile", command.line, "Commands after M02 are ignored");
                break;
            }
            if (command.kind === "word")
            {
                this.handleWord(command.text, command.line);
            }
            else
            {
                this.handleExtended(command.blocks, command.line);
            }
            if (onProgress && i % PROGRESS_STEP === 0)
            {
                onProgress(i / commands.length);
            }
        }
        if (unterminated)
        {
            this.warn("unterminatedCommand", unterminated.line, `Command without terminator ignored: '${unterminated.text}'`);
        }
        const lastLine = commands[commands.length - 1]?.line ?? 1;
        this.endTrack();
        if (this.mRegion)
        {
            this.warn("invalidRegion", lastLine, "Region not closed by G37");
            this.closeRegion();
        }
        this.closeStepRepeat();
        if (!this.mDocument.endOfFile)
        {
            this.warn("missingEndOfFile", lastLine, "File does not end with M02");
        }
        this.mDocument.unit = this.mUnit ?? "in";
        this.mDocument.format = this.mFormat;
        onProgress?.(1);
        return this.mDocument;
    }

    // ----- Warnings -----

    private warn(code: GerberWarningCode, line: number, detail: string): void
    {
        this.mDocument.warnings.push({ code, line, detail });
    }

    /** Reports a warning only the first time it happens (missing units, deprecated modal codes...). */
    private warnOnce(code: GerberWarningCode, line: number, detail: string): void
    {
        if (!this.mReported.has(code))
        {
            this.mReported.add(code);
            this.warn(code, line, detail);
        }
    }

    private unit(line: number): LengthUnit
    {
        if (this.mUnit === null)
        {
            this.warnOnce("missingUnits", line, "No %MO command before the first size: inches assumed");
            this.mUnit = "in";
        }
        return this.mUnit;
    }

    private format(line: number): CoordinateFormat
    {
        if (this.mFormat === null)
        {
            const unit = this.unit(line);
            this.mFormat = defaultFormat(unit);
            this.warnOnce("missingFormat", line,
                `No %FS command before the first coordinate: ${this.mFormat.integerDigits}.${this.mFormat.decimalDigits} assumed`);
        }
        return this.mFormat;
    }

    // ----- Extended commands -----

    private handleExtended(blocks: string[], line: number): void
    {
        const first = blocks[0] ?? "";
        if (first.startsWith("AM"))
        {
            this.defineMacro(blocks, line);
            return;
        }
        for (const raw of blocks)
        {
            if (raw.startsWith("T"))
            {
                this.handleAttribute(raw, line);
            }
            else
            {
                this.handleParameter(raw.replace(/\s+/g, ""), line);
            }
        }
    }

    private handleParameter(block: string, line: number): void
    {
        if (block.length === 0)
        {
            return;
        }
        const code = block.slice(0, 2);
        switch (code)
        {
            case "FS":
            {
                const format = parseFormatSpecification(block);
                if (format)
                {
                    this.mFormat = format;
                }
                else
                {
                    this.warn("invalidFormat", line, `Invalid format specification '${block}'`);
                }
                return;
            }
            case "MO":
                if (block === "MOMM" || block === "MOIN")
                {
                    this.mUnit = block === "MOMM" ? "mm" : "in";
                }
                else
                {
                    this.warn("invalidFormat", line, `Invalid unit '${block}'`);
                }
                return;
            case "AD":
                this.defineAperture(block, line);
                return;
            case "LP":
                this.endTrack();
                if (block === "LPD" || block === "LPC")
                {
                    this.mPolarity = block === "LPD" ? "dark" : "clear";
                }
                else
                {
                    this.warn("unknownCommand", line, `Invalid polarity '${block}'`);
                }
                return;
            case "LM":
            case "LR":
            case "LS":
                this.endTrack();
                this.setTransform(block, line);
                return;
            case "SR":
                this.handleStepRepeat(block, line);
                return;
            case "IP":
                if (block === "IPNEG")
                {
                    this.mDocument.imagePolarity = "negative";
                    this.warn("negativeImage", line, "%IPNEG (negative image) is not supported; the image is read as positive");
                }
                return;
            case "AB":
                this.warn("unsupportedCommand", line, "Block apertures (%AB) are not supported; their content is ignored");
                return;
            default:
                if (IGNORED_EXTENDED.test(block))
                {
                    this.warn("deprecatedCommand", line, `Obsolete command %${code} ignored`);
                }
                else if (/^G0?4/.test(block))
                {
                    // Comment written inside an extended command by some generators
                }
                else
                {
                    this.warn("unknownCommand", line, `Unknown command '%${block}%'`);
                }
        }
    }

    private defineMacro(blocks: string[], line: number): void
    {
        try
        {
            const macro = parseApertureMacro(blocks);
            this.mDocument.macros.set(macro.name, macro);
        }
        catch (error)
        {
            const detail = error instanceof MacroSyntaxError ? error.message : String(error);
            this.warn("invalidMacro", line, detail);
        }
    }

    private defineAperture(block: string, line: number): void
    {
        const definition = parseApertureDefinition(block, this.unit(line));
        if ("error" in definition)
        {
            this.warn("invalidAperture", line, definition.error);
            return;
        }
        if (definition.template.kind === "macro" && !this.mDocument.macros.has(definition.template.name))
        {
            this.warn("invalidAperture", line, `Aperture D${definition.code} uses undefined macro '${definition.template.name}'`);
        }
        this.mDocument.apertures.set(definition.code, {
            code: definition.code,
            template: definition.template,
            attributes: this.mApertureAttributes,
            line
        });
    }

    private setTransform(block: string, line: number): void
    {
        const value = block.slice(2);
        const transform = { ...this.mTransform };
        if (block.startsWith("LM"))
        {
            if (!/^(N|X|Y|XY)$/.test(value))
            {
                this.warn("unknownCommand", line, `Invalid mirroring '${block}'`);
                return;
            }
            transform.mirrorX = value.includes("X");
            transform.mirrorY = value.includes("Y");
        }
        else
        {
            const number = Number(value);
            if (value === "" || !Number.isFinite(number) || (block.startsWith("LS") && number <= 0))
            {
                this.warn("unknownCommand", line, `Invalid transformation '${block}'`);
                return;
            }
            if (block.startsWith("LR"))
            {
                transform.rotation = number;
            }
            else
            {
                transform.scale = number;
            }
        }
        this.mTransform = Object.freeze(transform);
    }

    private handleStepRepeat(block: string, line: number): void
    {
        this.endTrack();
        // A new %SR closes the previous block; "%SR*%" only closes it
        this.closeStepRepeat();
        if (block === "SR")
        {
            return;
        }
        const match = /^SR(?:X(\d+))?(?:Y(\d+))?(?:I([+-]?[\d.]+))?(?:J([+-]?[\d.]+))?$/.exec(block);
        if (!match)
        {
            this.warn("invalidStepRepeat", line, `Invalid step and repeat '${block}'`);
            return;
        }
        const unit = this.unit(line);
        const countX = Number(match[1] ?? 1);
        const countY = Number(match[2] ?? 1);
        if (countX < 1 || countY < 1)
        {
            this.warn("invalidStepRepeat", line, `Invalid repeat count in '${block}'`);
            return;
        }
        this.mStepRepeat = {
            startIndex: this.mDocument.objects.length,
            countX,
            countY,
            stepX: match[3] ? decodeLength(match[3], unit) : 0,
            stepY: match[4] ? decodeLength(match[4], unit) : 0,
            line
        };
    }

    /** Replicates the objects of the open step and repeat block. */
    private closeStepRepeat(): void
    {
        const block = this.mStepRepeat;
        if (!block)
        {
            return;
        }
        this.endTrack();
        this.mStepRepeat = null;
        const objects = this.mDocument.objects;
        const original = objects.splice(block.startIndex);
        for (let row = 0; row < block.countY; row++)
        {
            for (let column = 0; column < block.countX; column++)
            {
                const dx = column * block.stepX;
                const dy = row * block.stepY;
                for (const object of original)
                {
                    objects.push(dx === 0 && dy === 0 ? object : translateObject(object, dx, dy));
                }
            }
        }
    }

    private handleAttribute(block: string, line: number): void
    {
        const command = block.slice(0, 2);
        const [name = "", ...values] = block.slice(2).split(",");
        const key = name.trim();
        switch (command)
        {
            case "TF":
            case "TA":
            case "TO":
            {
                if (key.length === 0)
                {
                    this.warn("invalidAttribute", line, `Attribute without a name '${block}'`);
                    return;
                }
                if (command === "TO")
                {
                    this.endTrack();
                }
                const entry = { [key]: Object.freeze(values.map((value) => value.trim())) };
                if (command === "TF")
                {
                    this.mDocument.fileAttributes = Object.freeze({ ...this.mDocument.fileAttributes, ...entry });
                }
                else if (command === "TA")
                {
                    this.mApertureAttributes = Object.freeze({ ...this.mApertureAttributes, ...entry });
                }
                else
                {
                    this.mObjectAttributes = Object.freeze({ ...this.mObjectAttributes, ...entry });
                }
                return;
            }
            case "TD":
                this.endTrack();
                if (key.length === 0)
                {
                    this.mApertureAttributes = EMPTY_ATTRIBUTES;
                    this.mObjectAttributes = EMPTY_ATTRIBUTES;
                }
                else
                {
                    this.mApertureAttributes = withoutKey(this.mApertureAttributes, key);
                    this.mObjectAttributes = withoutKey(this.mObjectAttributes, key);
                }
                return;
            default:
                this.warn("unknownCommand", line, `Unknown command '%${block}%'`);
        }
    }

    // ----- Word commands -----

    private handleWord(text: string, line: number): void
    {
        if (/^G0?4(?!\d)/.test(text))
        {
            return;
        }
        if (text === "G36" || text === "G37")
        {
            this.endTrack();
            if (text === "G36")
            {
                this.openRegion(line);
            }
            else if (this.mRegion)
            {
                this.closeRegion();
            }
            else
            {
                this.warn("invalidRegion", line, "G37 without G36");
            }
            return;
        }

        let rest = text;
        let operation: number | null = null;
        const coordinates: Partial<Record<"X" | "Y" | "I" | "J", string>> = {};
        WORD_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = WORD_RE.exec(text)) !== null)
        {
            const letter = match[1] as "G" | "D" | "M" | "X" | "Y" | "I" | "J";
            const value = match[2] as string;
            rest = rest.replace(match[0], "");
            if (letter === "G")
            {
                this.handleGCode(Number(value), line);
            }
            else if (letter === "M")
            {
                this.handleMCode(Number(value), line);
            }
            else if (letter === "D")
            {
                const code = Number(value);
                if (code >= 10)
                {
                    this.selectAperture(code, line);
                }
                else
                {
                    operation = code;
                }
            }
            else
            {
                coordinates[letter] = value;
            }
        }
        if (rest.length > 0)
        {
            this.warn("unknownCommand", line, `Unknown command '${text}'`);
            return;
        }

        const hasCoordinates = Object.keys(coordinates).length > 0;
        if (operation === null && hasCoordinates)
        {
            // Obsolete modal operation: coordinates alone repeat the previous D01 / D02 / D03
            if (this.mLastOperation === null)
            {
                this.updateCurrentPoint(coordinates, line);
                return;
            }
            this.warnOnce("deprecatedCommand", line, "Coordinates without D01 / D02 / D03 (obsolete modal operation)");
            operation = this.mLastOperation;
        }
        if (operation === null)
        {
            return;
        }
        if (operation !== 1 && operation !== 2 && operation !== 3)
        {
            this.warn("unknownCommand", line, `Invalid operation D${operation}`);
            return;
        }
        this.mLastOperation = operation;
        this.handleOperation(operation, coordinates, line);
    }

    private handleGCode(code: number, line: number): void
    {
        switch (code)
        {
            case 1:
                this.mInterpolation = "linear";
                return;
            case 2:
                this.mInterpolation = "clockwise";
                return;
            case 3:
                this.mInterpolation = "counterClockwise";
                return;
            case 74:
                this.mQuadrant = "single";
                return;
            case 75:
                this.mQuadrant = "multi";
                return;
            case 70:
            case 71:
                // Obsolete unit selection, only used when %MO is absent
                if (this.mUnit === null)
                {
                    this.mUnit = code === 70 ? "in" : "mm";
                }
                return;
            case 90:
            case 91:
                if (this.mFormat && code === 91)
                {
                    this.mFormat = { ...this.mFormat, notation: "incremental" };
                }
                return;
            case 54:
            case 55:
                // Obsolete prefixes of aperture selection and flash
                return;
            case 10:
            case 11:
            case 12:
                this.warnOnce("deprecatedCommand", line, `Obsolete G${code} read as linear interpolation`);
                this.mInterpolation = "linear";
                return;
            default:
                this.warn("unsupportedCommand", line, `G${code} is not supported and was ignored`);
        }
    }

    private handleMCode(code: number, line: number): void
    {
        if (code === 2)
        {
            this.mDocument.endOfFile = true;
        }
        else if (code === 0 || code === 1)
        {
            this.warnOnce("deprecatedCommand", line, `Obsolete M0${code} ignored`);
        }
        else
        {
            this.warn("unsupportedCommand", line, `M${code} is not supported and was ignored`);
        }
    }

    private selectAperture(code: number, line: number): void
    {
        this.endTrack();
        if (!this.mDocument.apertures.has(code))
        {
            this.warn("undefinedAperture", line, `Aperture D${code} is not defined`);
        }
        this.mAperture = code;
    }

    /** Applies X / Y to the current point and returns the new point; null on invalid numbers. */
    private targetPoint(coordinates: Partial<Record<"X" | "Y" | "I" | "J", string>>, line: number): Point | null
    {
        const format = this.format(line);
        const unit = this.unit(line);
        const x = coordinates.X === undefined ? null : decodeCoordinate(coordinates.X, format, unit);
        const y = coordinates.Y === undefined ? null : decodeCoordinate(coordinates.Y, format, unit);
        if ((x !== null && Number.isNaN(x)) || (y !== null && Number.isNaN(y)))
        {
            this.warn("invalidCoordinate", line, "Invalid coordinate value");
            return null;
        }
        if (format.notation === "incremental")
        {
            return { x: this.mCurrent.x + (x ?? 0), y: this.mCurrent.y + (y ?? 0) };
        }
        return { x: x ?? this.mCurrent.x, y: y ?? this.mCurrent.y };
    }

    private updateCurrentPoint(coordinates: Partial<Record<"X" | "Y" | "I" | "J", string>>, line: number): void
    {
        const target = this.targetPoint(coordinates, line);
        if (target)
        {
            this.mCurrent = target;
        }
    }

    private handleOperation(operation: 1 | 2 | 3, coordinates: Partial<Record<"X" | "Y" | "I" | "J", string>>,
        line: number): void
    {
        const start = this.mCurrent;
        const target = this.targetPoint(coordinates, line);
        if (!target)
        {
            return;
        }
        this.mCurrent = target;

        if (operation === 2)
        {
            this.endTrack();
            if (this.mRegion)
            {
                this.closeContour();
            }
            return;
        }
        if (operation === 3)
        {
            this.endTrack();
            if (this.mRegion)
            {
                this.warn("flashInRegion", line, "D03 is not allowed inside a region and was ignored");
                return;
            }
            const aperture = this.requireAperture(line);
            if (aperture !== null)
            {
                this.addObject({
                    kind: "flash",
                    aperture,
                    point: target,
                    polarity: this.mPolarity,
                    transform: this.mTransform,
                    attributes: this.mObjectAttributes,
                    line
                });
            }
            return;
        }

        const segment = this.interpolate(start, target, coordinates, line);
        if (this.mRegion)
        {
            if (!this.mContour)
            {
                this.mContour = [start];
            }
            this.mContour.push(...segment);
            return;
        }
        const aperture = this.requireAperture(line);
        if (aperture === null)
        {
            return;
        }
        const track = this.mTrack;
        const last = track?.path[track.path.length - 1];
        if (track && last && last.x === start.x && last.y === start.y)
        {
            track.path.push(...segment);
        }
        else
        {
            this.endTrack();
            const newTrack: TrackObject = {
                kind: "track",
                aperture,
                path: [start, ...segment],
                polarity: this.mPolarity,
                transform: this.mTransform,
                attributes: this.mObjectAttributes,
                line
            };
            this.mTrack = newTrack;
            this.addObject(newTrack);
        }
    }

    private requireAperture(line: number): number | null
    {
        if (this.mAperture === null)
        {
            this.warnOnce("noApertureSelected", line, "Operation before any aperture selection ignored");
        }
        return this.mAperture;
    }

    /** Points after start reaching target: [target] for lines, the discretised arc otherwise. */
    private interpolate(start: Point, target: Point, coordinates: Partial<Record<"X" | "Y" | "I" | "J", string>>,
        line: number): Path
    {
        if (this.mInterpolation === "linear")
        {
            return [target];
        }
        const clockwise = this.mInterpolation === "clockwise";
        const format = this.format(line);
        const unit = this.unit(line);
        const i = coordinates.I === undefined ? 0 : decodeCoordinate(coordinates.I, format, unit);
        const j = coordinates.J === undefined ? 0 : decodeCoordinate(coordinates.J, format, unit);
        if (Number.isNaN(i) || Number.isNaN(j))
        {
            this.warn("invalidCoordinate", line, "Invalid arc centre offset");
            return [target];
        }
        if (this.mQuadrant === null)
        {
            this.warnOnce("noQuadrantMode", line, "Arc before G74 / G75: multi quadrant mode (G75) assumed");
            this.mQuadrant = "multi";
        }
        if (this.mQuadrant === "multi")
        {
            const center = { x: start.x + i, y: start.y + j };
            return arcBetween(start, target, center, clockwise, this.mArcTolerance).slice(1);
        }
        const center = singleQuadrantCenter(start, target, Math.abs(i), Math.abs(j), clockwise);
        if (!center)
        {
            this.warn("invalidArc", line, "No single quadrant arc matches these points: drawn as a line");
            return [target];
        }
        return arcBetween(start, target, center, clockwise, this.mArcTolerance, false).slice(1);
    }

    // ----- Regions and tracks -----

    private openRegion(line: number): void
    {
        if (this.mRegion)
        {
            this.warn("invalidRegion", line, "G36 inside a region");
            this.closeRegion();
        }
        this.mRegion = {
            kind: "region",
            contours: [],
            polarity: this.mPolarity,
            attributes: this.mObjectAttributes,
            line
        };
        this.mContour = null;
    }

    private closeContour(): void
    {
        const contour = this.mContour;
        this.mContour = null;
        if (!contour || !this.mRegion)
        {
            return;
        }
        const first = contour[0];
        const last = contour[contour.length - 1];
        if (first && last && first.x === last.x && first.y === last.y)
        {
            contour.pop();
        }
        if (contour.length >= 3)
        {
            this.mRegion.contours.push(contour);
        }
    }

    private closeRegion(): void
    {
        this.closeContour();
        const region = this.mRegion;
        this.mRegion = null;
        if (region && region.contours.length > 0)
        {
            this.addObject(region);
        }
        else if (region)
        {
            this.warn("invalidRegion", region.line, "Region without a valid contour ignored");
        }
    }

    private endTrack(): void
    {
        this.mTrack = null;
    }

    private addObject(object: GraphicObject): void
    {
        this.mDocument.objects.push(object);
    }
}

function withoutKey(attributes: AttributeSet, key: string): AttributeSet
{
    if (!(key in attributes))
    {
        return attributes;
    }
    return Object.freeze(Object.fromEntries(Object.entries(attributes).filter(([name]) => name !== key)));
}

function translatePoint(point: Point, dx: number, dy: number): Point
{
    return { x: point.x + dx, y: point.y + dy };
}

function translateObject(object: GraphicObject, dx: number, dy: number): GraphicObject
{
    switch (object.kind)
    {
        case "flash":
            return { ...object, point: translatePoint(object.point, dx, dy) };
        case "track":
            return { ...object, path: object.path.map((point) => translatePoint(point, dx, dy)) };
        case "region":
            return { ...object, contours: object.contours.map((contour) => contour.map((point) => translatePoint(point, dx, dy))) };
    }
}

/**
 * G74 single quadrant arcs give unsigned centre offsets: picks the sign combination giving an arc of at most 90°
 * in the requested direction whose start and end radii match best (FlatCAM ParseGerber.py does the same search).
 */
function singleQuadrantCenter(start: Point, end: Point, i: number, j: number, clockwise: boolean): Point | null
{
    let best: Point | null = null;
    let bestError = Infinity;
    for (const sx of [1, -1])
    {
        for (const sy of [1, -1])
        {
            const center = { x: start.x + sx * i, y: start.y + sy * j };
            const sweep = arcSweep(start, end, center, clockwise, false);
            if (Math.abs(sweep) > Math.PI / 2 + 1e-6)
            {
                continue;
            }
            const error = Math.abs(Math.hypot(start.x - center.x, start.y - center.y)
                - Math.hypot(end.x - center.x, end.y - center.y));
            if (error < bestError)
            {
                bestError = error;
                best = center;
            }
        }
    }
    return best;
}

/** Parses a Gerber file. Never throws on file content: see document.warnings. */
export function parseGerber(source: string, options: GerberParseOptions = {}): GerberDocument
{
    return new GerberParser(options).parse(source, options.onProgress);
}
