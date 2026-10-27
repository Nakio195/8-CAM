// Excellon drill file parser. Reference: FlatCAM appParsers/ParseExcellon.py parse_lines(), and the
// conventions of KiCad (decimal coordinates, ";#@! TF" attributes), Altium (";FILE_FORMAT", ";TYPE=PLATED")
// and Eagle (no zeros declaration). Like the Gerber parser it never throws on file content.

import { arcBetween, arcSweep, DEFAULT_ARC_TOLERANCE, type Point } from "@core/geometry/index";
import { toInternal, type LengthUnit } from "@core/units/index";
import { decodeExcellonNumber, defaultExcellonFormat, guessZeros } from "./format";
import type {
    DrillDocument,
    DrillSlot,
    DrillTool,
    DrillWarningCode,
    ExcellonFormat,
    FormatOrigin,
    Plating
} from "./types";

export interface ExcellonParseOptions
{
    /** File name, used to guess plating ("-NPTH.drl", "Plated"...). */
    fileName?: string;
    /** Overrides what the file declares (format selection in the user interface). */
    force?: Partial<ExcellonFormat> & { unit?: LengthUnit };
    arcTolerance?: number;
}

// Header commands that carry no geometry
const IGNORED_HEADER = /^(FMAT|ICI|VER|DETECT|ATC|BLKD|SBK|TCST|OSTOP|SG|AFS|CCW|NCSL|PCR|OM48|R,|M95)/;
const TOOL_RE = /^T(\d+)((?:[A-Z][-+]?[\d.]*)*)$/;
const COORDINATE_RE = /([XYIJA])([-+]?[\d.]*)/g;

/** Plating hinted by a file name: KiCad "-PTH.drl" / "-NPTH.drl", Proteus "Plated", Altium "NonPlated". */
export function platingFromFileName(fileName: string): Plating
{
    if (/(npth|non[-_ ]?plated|unplated)/i.test(fileName))
    {
        return "nonPlated";
    }
    if (/(pth|plated)/i.test(fileName))
    {
        return "plated";
    }
    return "unknown";
}

/** Plating named in an X2-like attribute value list ("Plated,1,2,PTH", "NonPlated,1,2,NPTH"). */
function platingFromAttribute(values: string): Plating | null
{
    if (/^NonPlated/i.test(values) || /NPTH/i.test(values))
    {
        return "nonPlated";
    }
    if (/^Plated/i.test(values) || /PTH/i.test(values))
    {
        return "plated";
    }
    return null;
}

type Coordinates = Partial<Record<"X" | "Y" | "I" | "J" | "A", string>>;

class ExcellonParser
{
    private mOptions: ExcellonParseOptions;
    private mArcTolerance: number;
    private mDocument: DrillDocument;
    private mUnit: LengthUnit | null = null;
    private mFormat: ExcellonFormat | null = null;
    private mFormatOrigin: FormatOrigin | null = null;
    private mDeclaredZeros = false;
    private mDeclaredDigits = false;
    private mInHeader = false;
    private mIncremental = false;
    private mCurrent: Point = { x: 0, y: 0 };
    private mOrigin: Point = { x: 0, y: 0 };
    private mTool: number | null = null;
    private mLastHit: Point | null = null;
    private mRouteMode = false;
    private mPlunged = false;
    private mRoute: DrillSlot | null = null;
    private mInterpolation: "linear" | "clockwise" | "counterClockwise" = "linear";
    private mFilePlating: Plating;
    private mNextToolPlating: Plating | null = null;
    private mEnded = false;
    private mReported = new Set<DrillWarningCode>();

    constructor(options: ExcellonParseOptions)
    {
        this.mOptions = options;
        this.mArcTolerance = options.arcTolerance ?? DEFAULT_ARC_TOLERANCE;
        this.mFilePlating = platingFromFileName(options.fileName ?? "");
        this.mDocument = {
            source: "excellon",
            unit: "in",
            format: null,
            formatOrigin: null,
            tools: new Map<number, DrillTool>(),
            hits: [],
            slots: [],
            warnings: []
        };
    }

    public parse(source: string): DrillDocument
    {
        const lines = source.split(/\r?\n/);
        this.readDeclarations(lines);
        for (let index = 0; index < lines.length && !this.mEnded; index++)
        {
            const text = (lines[index] as string).trim();
            if (text.length > 0)
            {
                this.handleLine(text, index + 1);
            }
        }
        this.endRoute();
        if (!this.mEnded)
        {
            this.warn("missingEndOfFile", lines.length, "File does not end with M30");
        }
        this.mDocument.unit = this.unit(1);
        this.mDocument.format = this.mFormat;
        this.mDocument.formatOrigin = this.mFormatOrigin;
        return this.mDocument;
    }

    // ----- Format -----

    /**
     * First pass: units, zeros and digits may only be known from the header or comments, and a missing zeros
     * declaration is guessed from all the coordinates of the file before decoding any of them.
     */
    private readDeclarations(lines: readonly string[]): void
    {
        let zeros: ExcellonFormat["zeros"] | null = null;
        let digits: [number, number] | null = null;
        const numbers: string[] = [];
        for (const raw of lines)
        {
            const text = raw.trim();
            const units = /^(METRIC|INCH)\b(?:,(LZ|TZ))?(?:,(0*)\.(0*))?/.exec(text);
            if (units)
            {
                this.mUnit ??= units[1] === "METRIC" ? "mm" : "in";
                if (units[2])
                {
                    zeros = units[2] === "LZ" ? "leading" : "trailing";
                }
                if (units[3] !== undefined && units[4] !== undefined && units[3].length + units[4].length > 0)
                {
                    digits = [units[3].length, units[4].length];
                }
                continue;
            }
            if (text === "M71" || text === "M72")
            {
                this.mUnit ??= text === "M71" ? "mm" : "in";
                continue;
            }
            if (text === "LZ" || text === "TZ")
            {
                zeros = text === "LZ" ? "leading" : "trailing";
                continue;
            }
            const fileFormat = /^;\s*(?:FILE_FORMAT|Format)\s*[=:]\s*(\d+)\s*[:.]\s*(\d+)/i.exec(text);
            if (fileFormat)
            {
                digits = [Number(fileFormat[1]), Number(fileFormat[2])];
                continue;
            }
            if (!text.startsWith(";") && !TOOL_RE.test(text))
            {
                for (const match of text.matchAll(/[XY]([-+]?[\d.]+)/g))
                {
                    numbers.push(match[1] as string);
                }
            }
        }

        const unit = this.mOptions.force?.unit ?? this.mUnit;
        if (this.mOptions.force?.unit)
        {
            this.mUnit = this.mOptions.force.unit;
        }
        this.mDeclaredZeros = zeros !== null;
        this.mDeclaredDigits = digits !== null;
        const guessed = zeros ?? guessZeros(numbers) ?? "leading";
        const base = defaultExcellonFormat(unit ?? "in", guessed);
        this.mFormat = {
            integerDigits: this.mOptions.force?.integerDigits ?? digits?.[0] ?? base.integerDigits,
            decimalDigits: this.mOptions.force?.decimalDigits ?? digits?.[1] ?? base.decimalDigits,
            zeros: this.mOptions.force?.zeros ?? guessed
        };
        const forced = this.mOptions.force !== undefined && Object.keys(this.mOptions.force).length > 0;
        const allDecimal = numbers.every((number) => number.includes(".") || !/[1-9]/.test(number));
        this.mFormatOrigin = forced ? "forced" : this.mDeclaredZeros || allDecimal ? "declared" : "guessed";
    }

    private unit(line: number): LengthUnit
    {
        if (this.mUnit === null)
        {
            this.warnOnce("missingUnits", line, "No METRIC / INCH declaration: inches assumed");
            this.mUnit = "in";
        }
        return this.mUnit;
    }

    private format(line: number): ExcellonFormat
    {
        const format = this.mFormat ?? defaultExcellonFormat(this.unit(line));
        if (this.mFormatOrigin === "guessed")
        {
            const digits = this.mDeclaredDigits ? "" : `, ${format.integerDigits}.${format.decimalDigits} digits assumed`;
            this.warnOnce("formatGuessed", line,
                `Zeros not declared: ${format.zeros === "leading" ? "LZ" : "TZ"} guessed from the coordinates${digits}`);
        }
        return format;
    }

    // ----- Warnings -----

    private warn(code: DrillWarningCode, line: number, detail: string): void
    {
        this.mDocument.warnings.push({ code, line, detail });
    }

    private warnOnce(code: DrillWarningCode, line: number, detail: string): void
    {
        if (!this.mReported.has(code))
        {
            this.mReported.add(code);
            this.warn(code, line, detail);
        }
    }

    // ----- Lines -----

    private handleLine(text: string, line: number): void
    {
        if (text.startsWith(";"))
        {
            this.handleComment(text);
            return;
        }
        if (text === "M48")
        {
            this.mInHeader = true;
            return;
        }
        if (text === "%" || text === "M95")
        {
            this.mInHeader = false;
            return;
        }
        if (/^(METRIC|INCH)\b/.test(text) || text === "M71" || text === "M72" || text === "LZ" || text === "TZ")
        {
            // Already read by readDeclarations()
            return;
        }
        const tool = TOOL_RE.exec(text);
        if (tool)
        {
            this.handleTool(Number(tool[1]), tool[2] as string, line);
            return;
        }
        if (this.mInHeader && IGNORED_HEADER.test(text))
        {
            return;
        }
        this.handleBody(text, line);
    }

    private handleComment(text: string): void
    {
        // KiCad: ";#@! TF.FileFunction,Plated,1,2,PTH" and ";#@! TA.AperFunction,Plated,PTH,ComponentDrill"
        const attribute = /^;\s*#@!\s*T([FA])\.(?:FileFunction|AperFunction),(.*)$/.exec(text);
        if (attribute)
        {
            const plating = platingFromAttribute(attribute[2] as string);
            if (plating && attribute[1] === "F")
            {
                this.mFilePlating = plating;
            }
            else if (plating)
            {
                this.mNextToolPlating = plating;
            }
            return;
        }
        // Altium: ";TYPE=PLATED" / ";TYPE=NON_PLATED" before the tools of each kind
        const altium = /^;\s*TYPE\s*=\s*(NON_PLATED|PLATED)/i.exec(text);
        if (altium)
        {
            this.mNextToolPlating = /^NON/i.test(altium[1] as string) ? "nonPlated" : "plated";
        }
    }

    /** "T1C0.8" defines a tool (header or body); "T01" alone selects it; "T0" unloads. */
    private handleTool(number: number, parameters: string, line: number): void
    {
        const diameterMatch = /C([-+]?[\d.]+)/.exec(parameters);
        if (diameterMatch)
        {
            const diameter = Number(diameterMatch[1]);
            if (!Number.isFinite(diameter) || diameter <= 0)
            {
                this.warn("invalidTool", line, `Invalid tool diameter in 'T${number}${parameters}'`);
                return;
            }
            this.mDocument.tools.set(number, {
                number,
                // Tool sizes always carry a decimal point and are in file units
                diameter: toInternal(diameter, this.unit(line)),
                plating: this.mNextToolPlating ?? this.mFilePlating,
                line
            });
            if (this.mInHeader)
            {
                return;
            }
        }
        else if (this.mInHeader)
        {
            this.warn("invalidTool", line, `Tool T${number} defined without a diameter`);
            return;
        }
        this.endRoute();
        if (number === 0)
        {
            this.mTool = null;
            return;
        }
        if (!this.mDocument.tools.has(number))
        {
            this.warn("undefinedTool", line, `Tool T${number} is not defined`);
        }
        this.mTool = number;
    }

    private handleBody(text: string, line: number): void
    {
        if (/^(M30|M00|M02)$/.test(text))
        {
            this.endRoute();
            this.mEnded = true;
            return;
        }
        if (/^(G05|G81|G90|G91|M15|M16|M17|M06|M09|M47|G40|G41|G42|G01|G02|G03)\b/.test(text) && !/[XY]/.test(text))
        {
            this.handleModal(text, line);
            return;
        }
        if (/^(M97|M98|M25|M01|M02|M08|M70|M80|M90)/.test(text))
        {
            this.warn("unsupportedCommand", line, `'${text}' is not supported and was ignored`);
            return;
        }
        if (text.startsWith("G93"))
        {
            const point = this.readPoint(this.coordinatesOf(text.slice(3)), line, { x: 0, y: 0 });
            if (point)
            {
                this.mOrigin = point;
            }
            return;
        }
        if (text.includes("G85"))
        {
            this.handleDrilledSlot(text, line);
            return;
        }
        const repeat = /^R(\d+)(.*)$/.exec(text);
        if (repeat)
        {
            this.handleRepeat(Number(repeat[1]), repeat[2] as string, line);
            return;
        }
        const route = /^G0([0123])(.*)$/.exec(text);
        if (route)
        {
            this.handleRoute(Number(route[1]), route[2] as string, line);
            return;
        }
        if (/^[XY]/.test(text))
        {
            this.handleCoordinates(text, line);
            return;
        }
        this.warn("unknownCommand", line, `Unknown command '${text}'`);
    }

    private handleModal(text: string, line: number): void
    {
        const code = text.slice(0, 3);
        switch (code)
        {
            case "G05":
            case "G81":
                this.endRoute();
                this.mRouteMode = false;
                return;
            case "G90":
            case "G91":
                this.mIncremental = code === "G91";
                return;
            case "M15":
                this.mPlunged = true;
                this.startRoute(line);
                return;
            case "M16":
            case "M17":
                this.endRoute();
                this.mPlunged = false;
                return;
            case "G01":
                this.mInterpolation = "linear";
                return;
            case "G02":
                this.mInterpolation = "clockwise";
                return;
            case "G03":
                this.mInterpolation = "counterClockwise";
                return;
            default:
                // M06 / M09 (tool change, stop), M47 (operator message), G40-G42 (cutter compensation)
                return;
        }
    }

    private coordinatesOf(text: string): Coordinates
    {
        const coordinates: Coordinates = {};
        for (const match of text.matchAll(COORDINATE_RE))
        {
            coordinates[match[1] as keyof Coordinates] = match[2] as string;
        }
        return coordinates;
    }

    /** New position from X / Y (absolute or incremental, relative to the G93 origin); null when invalid. */
    private readPoint(coordinates: Coordinates, line: number, from: Point = this.mCurrent): Point | null
    {
        const format = this.format(line);
        const unit = this.unit(line);
        const x = coordinates.X === undefined ? null : decodeExcellonNumber(coordinates.X, format, unit);
        const y = coordinates.Y === undefined ? null : decodeExcellonNumber(coordinates.Y, format, unit);
        if ((x !== null && Number.isNaN(x)) || (y !== null && Number.isNaN(y)))
        {
            this.warn("invalidCoordinate", line, "Invalid coordinate value");
            return null;
        }
        if (this.mIncremental)
        {
            return { x: from.x + (x ?? 0), y: from.y + (y ?? 0) };
        }
        return {
            x: x === null ? from.x : x + this.mOrigin.x,
            y: y === null ? from.y : y + this.mOrigin.y
        };
    }

    private requireTool(line: number): number | null
    {
        if (this.mTool === null)
        {
            this.warnOnce("noToolSelected", line, "Coordinates before any tool selection ignored");
        }
        return this.mTool;
    }

    private handleCoordinates(text: string, line: number): void
    {
        const point = this.readPoint(this.coordinatesOf(text), line);
        if (!point)
        {
            return;
        }
        if (this.mRouteMode)
        {
            this.routeTo(point, this.coordinatesOf(text), line);
            return;
        }
        this.mCurrent = point;
        const tool = this.requireTool(line);
        if (tool !== null)
        {
            this.mDocument.hits.push({ tool, point, line });
            this.mLastHit = point;
        }
    }

    /** "X1Y2G85X3Y2": slot drilled from the first point to the second one. */
    private handleDrilledSlot(text: string, line: number): void
    {
        const [startText = "", endText = ""] = text.split("G85");
        const start = this.readPoint(this.coordinatesOf(startText), line);
        if (!start)
        {
            return;
        }
        const end = this.readPoint(this.coordinatesOf(endText), line, start);
        if (!end || endText.trim().length === 0)
        {
            this.warn("invalidSlot", line, `Invalid slot '${text}'`);
            return;
        }
        this.mCurrent = end;
        const tool = this.requireTool(line);
        if (tool !== null)
        {
            this.mDocument.slots.push({ tool, path: [start, end], line });
        }
    }

    /** "R5X0.1": repeats the last hole 5 times, each one offset by X / Y from the previous one. */
    private handleRepeat(count: number, rest: string, line: number): void
    {
        const tool = this.requireTool(line);
        const coordinates = this.coordinatesOf(rest);
        const format = this.format(line);
        const unit = this.unit(line);
        const dx = coordinates.X === undefined ? 0 : decodeExcellonNumber(coordinates.X, format, unit);
        const dy = coordinates.Y === undefined ? 0 : decodeExcellonNumber(coordinates.Y, format, unit);
        if (tool === null || !this.mLastHit || Number.isNaN(dx) || Number.isNaN(dy))
        {
            this.warn("invalidCoordinate", line, `Invalid repeat '${rest}'`);
            return;
        }
        let point = this.mLastHit;
        for (let i = 0; i < count; i++)
        {
            point = { x: point.x + dx, y: point.y + dy };
            this.mDocument.hits.push({ tool, point, line });
        }
        this.mLastHit = point;
        this.mCurrent = point;
    }

    // ----- Routing (G00 / M15 / G01 / G02 / G03 / M16) -----

    private handleRoute(code: number, rest: string, line: number): void
    {
        const coordinates = this.coordinatesOf(rest);
        this.mRouteMode = true;
        if (code === 0)
        {
            this.endRoute();
            this.mPlunged = false;
            const point = this.readPoint(coordinates, line);
            if (point)
            {
                this.mCurrent = point;
            }
            return;
        }
        this.mInterpolation = code === 1 ? "linear" : code === 2 ? "clockwise" : "counterClockwise";
        const point = this.readPoint(coordinates, line);
        if (point)
        {
            this.routeTo(point, coordinates, line);
        }
    }

    private startRoute(line: number): void
    {
        this.endRoute();
        const tool = this.requireTool(line);
        if (tool !== null)
        {
            this.mRoute = { tool, path: [this.mCurrent], line };
        }
    }

    private routeTo(point: Point, coordinates: Coordinates, line: number): void
    {
        const start = this.mCurrent;
        this.mCurrent = point;
        if (!this.mPlunged || !this.mRoute)
        {
            return;
        }
        if (this.mInterpolation === "linear")
        {
            this.mRoute.path.push(point);
            return;
        }
        const clockwise = this.mInterpolation === "clockwise";
        const center = this.arcCenter(start, point, coordinates, clockwise, line);
        if (!center)
        {
            this.mRoute.path.push(point);
            return;
        }
        this.mRoute.path.push(...arcBetween(start, point, center, clockwise, this.mArcTolerance).slice(1));
    }

    /** Arc centre from I / J offsets, or from the radius A (shorter arc for a positive radius). */
    private arcCenter(start: Point, end: Point, coordinates: Coordinates, clockwise: boolean, line: number): Point | null
    {
        const format = this.format(line);
        const unit = this.unit(line);
        if (coordinates.A !== undefined)
        {
            const radius = decodeExcellonNumber(coordinates.A, format, unit);
            const chord = Math.hypot(end.x - start.x, end.y - start.y);
            if (Number.isNaN(radius) || chord === 0 || chord > 2 * Math.abs(radius) + 1)
            {
                this.warn("invalidArc", line, "Invalid arc radius: drawn as a line");
                return null;
            }
            const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
            const offset = Math.sqrt(Math.max(0, radius * radius - (chord / 2) ** 2));
            const normal = { x: -(end.y - start.y) / chord, y: (end.x - start.x) / chord };
            for (const side of [1, -1])
            {
                const center = { x: middle.x + side * offset * normal.x, y: middle.y + side * offset * normal.y };
                const shorter = Math.abs(arcSweep(start, end, center, clockwise)) <= Math.PI + 1e-9;
                if (shorter === radius > 0)
                {
                    return center;
                }
            }
            return null;
        }
        const i = coordinates.I === undefined ? 0 : decodeExcellonNumber(coordinates.I, format, unit);
        const j = coordinates.J === undefined ? 0 : decodeExcellonNumber(coordinates.J, format, unit);
        if (Number.isNaN(i) || Number.isNaN(j) || (i === 0 && j === 0))
        {
            this.warn("invalidArc", line, "Arc without centre or radius: drawn as a line");
            return null;
        }
        return { x: start.x + i, y: start.y + j };
    }

    private endRoute(): void
    {
        const route = this.mRoute;
        this.mRoute = null;
        if (route && route.path.length >= 2)
        {
            this.mDocument.slots.push(route);
        }
    }
}

/** Parses an Excellon drill file. Never throws on file content: see document.warnings. */
export function parseExcellon(source: string, options: ExcellonParseOptions = {}): DrillDocument
{
    return new ExcellonParser(options).parse(source);
}

/** True when the text looks like an Excellon file rather than a Gerber file. */
export function looksLikeExcellon(source: string): boolean
{
    const head = source.slice(0, 4096);
    if (/%(FS|MO|AD|TF)/.test(head))
    {
        return false;
    }
    return /^\s*M48\s*$/m.test(head) || /^\s*(METRIC|INCH)\b/m.test(head) || /^\s*T\d+C[\d.]+/m.test(head);
}
