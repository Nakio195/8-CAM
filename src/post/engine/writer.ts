// G-code writer: translates the machine-independent moves (specification 6.7) with a post-processor profile.
// One writer for every controller; the differences live in the profile (words, templates, number format).

import { moveStatistics, type Move } from "@cam/toolpath/index";
import type { Tool } from "@cam/tools/index";
import type { MachineProfile } from "../machine";
import type { PostProfile, TemplateLines } from "./profile";

/** Moves of one operation with the tool doing them. */
export interface PostOperation
{
    /** Shown in the header, e.g. "Isolation, Bottom Copper". */
    label: string;
    tool: Tool;
    /** Tool name as the user sees it, e.g. "V-bit 30° 0.2 mm". */
    toolLabel: string;
    moves: Move[];
}

export interface PostJob
{
    name: string;
    operations: PostOperation[];
    /** Given, not read from the clock, so that tests can compare whole files. */
    date: Date;
    /** Version of 8-CAM written in the header. */
    version: string;
    /** Instructions written in the header comments, e.g. which tool to mount and which zero to set. */
    notes?: string[];
}

export interface GcodeOutput
{
    text: string;
    lineCount: number;
    /** Forbidden words of the profile found in the output: the controller would refuse those lines. */
    forbidden: { word: string; line: number }[];
}

/** Arcs written as segments stay within this distance of the true arc, mm. */
const ARC_TOLERANCE = 0.005;
const MM_PER_INCH = 25.4;

/** Comments must stay plain ASCII without parentheses: some controllers stop on anything else. */
export function sanitizeComment(text: string): string
{
    return text
        .replace(/°/g, " deg")
        .replace(/[Øø⌀]/g, "D")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[()]/g, (bracket) => (bracket === "(" ? "[" : "]"))
        .replace(/[^\x20-\x7e]/g, "")
        .replace(/;/g, ",")
        .trim();
}

function fill(template: string, values: Readonly<Record<string, string>>): string
{
    return template.replace(/\{(\w+)\}/g, (match: string, name: string) => values[name] ?? match);
}

class Writer
{
    public readonly lines: string[] = [];
    private mNumber: number;
    private mPosition: { x: number | null; y: number | null; z: number | null } = { x: null, y: null, z: null };
    private mFeed: number | null = null;

    constructor(private readonly mProfile: PostProfile, private readonly mRapidFeed: number)
    {
        this.mNumber = mProfile.lineNumbers.start;
    }

    public number(value: number, digits: number): string
    {
        const scaled = this.mProfile.units === "inch" ? value / MM_PER_INCH : value;
        const text = scaled.toFixed(digits);
        // "-0.0000" is valid G-code but confusing
        return /^-0\.?0*$/.test(text) ? text.slice(1) : text;
    }

    public comment(text: string): void
    {
        const clean = sanitizeComment(text);
        if (this.mProfile.comments === "parentheses")
        {
            this.lines.push(`(${clean})`);
        }
        else if (this.mProfile.comments === "semicolon")
        {
            this.lines.push(`; ${clean}`);
        }
    }

    public blank(): void
    {
        if (this.mProfile.comments !== "none")
        {
            this.lines.push("");
        }
    }

    /** A G-code line, numbered when the profile asks for it. */
    public code(text: string): void
    {
        const trimmed = text.trim();
        if (trimmed === "")
        {
            return;
        }
        if (this.mProfile.lineNumbers.enabled)
        {
            this.lines.push(`N${this.mNumber} ${trimmed}`);
            this.mNumber += this.mProfile.lineNumbers.step;
        }
        else
        {
            this.lines.push(trimmed);
        }
    }

    public template(lines: TemplateLines, values: Readonly<Record<string, string>>): void
    {
        for (const line of lines)
        {
            const filled = fill(line, values);
            // A comment line of the template follows the comment style of the profile
            const comment = /^\s*\((.*)\)\s*$/.exec(filled);
            if (comment)
            {
                this.comment(comment[1] ?? "");
            }
            else
            {
                this.code(filled);
            }
        }
        // Templates may move the tool: positions written afterwards must not rely on the earlier ones
        this.mPosition = { x: null, y: null, z: null };
        this.mFeed = null;
    }

    public move(move: Extract<Move, { kind: "rapid" | "linear" }>): void
    {
        const digits = this.mProfile.decimals.coordinates;
        let words = "";
        for (const axis of ["x", "y", "z"] as const)
        {
            const value = move[axis];
            if (value !== undefined && this.number(value, digits) !== (this.mPosition[axis] === null ? null : this.number(this.mPosition[axis], digits)))
            {
                words += ` ${axis.toUpperCase()}${this.number(value, digits)}`;
                this.mPosition[axis] = value;
            }
        }
        if (words === "")
        {
            return;
        }
        if (move.kind === "rapid")
        {
            this.code(`${this.mProfile.commands.rapid}${words}${this.mProfile.rapidWithFeed ? ` F${this.number(this.mRapidFeed, this.mProfile.decimals.feed)}` : ""}`);
            if (this.mProfile.rapidWithFeed)
            {
                // Marlin keeps one feed for G0 and G1: after "G0 ... F3000", a cut without F would run at 3000.
                // The next cut must write its own feed again.
                this.mFeed = null;
            }
            return;
        }
        this.code(`${this.mProfile.commands.linear}${words}${this.feedWord(move.feed)}`);
    }

    public arc(move: Extract<Move, { kind: "arc" }>): void
    {
        const from = { x: this.mPosition.x ?? 0, y: this.mPosition.y ?? 0 };
        if (this.mProfile.arcs === "native")
        {
            const digits = this.mProfile.decimals.coordinates;
            const word = move.cw ? this.mProfile.commands.arcCW : this.mProfile.commands.arcCCW;
            this.code(`${word} X${this.number(move.x, digits)} Y${this.number(move.y, digits)} I${this.number(move.i, digits)} J${this.number(move.j, digits)}${this.feedWord(move.feed)}`);
            this.mPosition.x = move.x;
            this.mPosition.y = move.y;
            return;
        }
        const centre = { x: from.x + move.i, y: from.y + move.j };
        const radius = Math.hypot(move.i, move.j);
        const start = Math.atan2(from.y - centre.y, from.x - centre.x);
        let sweep = Math.atan2(move.y - centre.y, move.x - centre.x) - start;
        if (move.cw && sweep >= 0)
        {
            sweep -= 2 * Math.PI;
        }
        else if (!move.cw && sweep <= 0)
        {
            sweep += 2 * Math.PI;
        }
        const step = radius > ARC_TOLERANCE ? 2 * Math.acos(1 - ARC_TOLERANCE / radius) : Math.PI / 4;
        const count = Math.max(1, Math.ceil(Math.abs(sweep) / step));
        for (let i = 1; i <= count; i++)
        {
            const angle = start + (sweep * i) / count;
            const point = i === count ? { x: move.x, y: move.y } : { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
            this.move({ kind: "linear", x: point.x, y: point.y, feed: move.feed });
        }
    }

    private feedWord(feed: number): string
    {
        if (this.mProfile.feeds === "modal" && this.mFeed === feed)
        {
            return "";
        }
        this.mFeed = feed;
        return ` F${this.number(feed, this.mProfile.decimals.feed)}`;
    }
}

/** Extent of the moves in the plane, mm (null without any XY move). */
export function movesExtent(operations: readonly PostOperation[]): { xMin: number; xMax: number; yMin: number; yMax: number } | null
{
    let extent: { xMin: number; xMax: number; yMin: number; yMax: number } | null = null;
    for (const operation of operations)
    {
        for (const move of operation.moves)
        {
            if ((move.kind === "rapid" || move.kind === "linear" || move.kind === "arc") && move.x !== undefined && move.y !== undefined)
            {
                extent = extent
                    ? { xMin: Math.min(extent.xMin, move.x), xMax: Math.max(extent.xMax, move.x), yMin: Math.min(extent.yMin, move.y), yMax: Math.max(extent.yMax, move.y) }
                    : { xMin: move.x, xMax: move.x, yMin: move.y, yMax: move.y };
            }
        }
    }
    return extent;
}

/** Stands for the line count in the file header until the whole file is written. */
const LINE_COUNT_MARK = "\u0000lineCount\u0000";

/**
 * Lines of the profile written first, with values of the whole job: extent of the moves (X, Y and Z), estimated time
 * at the machine rapid speed, fastest cutting feed and spindle speed. They are written as they are, without numbering
 * or comment conversion, since controllers read them as given (Snapmaker ";Header Start" block).
 */
function writeFileHeader(writer: Writer, job: PostJob, profile: PostProfile, machine: MachineProfile): void
{
    const lines = profile.fileHeader ?? [];
    if (lines.length === 0)
    {
        return;
    }
    const n = (value: number, digits = profile.decimals.coordinates): string => writer.number(value, digits);
    const extent = movesExtent(job.operations) ?? { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
    let zMin = Infinity;
    let zMax = -Infinity;
    let seconds = 0;
    let workSpeed = 0;
    let spindle = 0;
    for (const operation of job.operations)
    {
        for (const move of operation.moves)
        {
            if ((move.kind === "rapid" || move.kind === "linear") && move.z !== undefined)
            {
                zMin = Math.min(zMin, move.z);
                zMax = Math.max(zMax, move.z);
            }
            if ((move.kind === "linear" || move.kind === "arc") && (move.kind === "arc" || move.x !== undefined || move.y !== undefined))
            {
                workSpeed = Math.max(workSpeed, move.feed);
            }
            if (move.kind === "spindle" && move.on)
            {
                spindle = Math.max(spindle, move.rpm ?? operation.tool.spindleSpeed);
            }
        }
        seconds += moveStatistics(operation.moves, machine.rapidFeed, { x: 0, y: 0, z: operation.tool.safeZ }).duration;
    }
    const values: Record<string, string> = {
        lineCount: LINE_COUNT_MARK,
        estimatedSeconds: String(Math.round(seconds)),
        xMin: n(extent.xMin),
        xMax: n(extent.xMax),
        yMin: n(extent.yMin),
        yMax: n(extent.yMax),
        zMin: n(Number.isFinite(zMin) ? zMin : 0),
        zMax: n(Number.isFinite(zMax) ? zMax : 0),
        workSpeed: n(workSpeed, profile.decimals.feed),
        rapidFeed: n(machine.rapidFeed, profile.decimals.feed),
        spindlePercent: String(Math.min(100, Math.round((spindle / Math.max(1, machine.maxSpindleSpeed)) * 100))),
        jobName: sanitizeComment(job.name),
        machineName: sanitizeComment(machine.name),
        version: job.version
    };
    for (const line of lines)
    {
        const filled = line.replace(/\{(\w+)\}/g, (match: string, name: string) => values[name] ?? match).trim();
        if (filled !== "")
        {
            writer.lines.push(filled);
        }
    }
}

/** Date written in the header, independent of the user's locale: 2026-10-28 14:05. */
function formatDate(date: Date): string
{
    const pad = (value: number): string => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * G-code of a job: a commented header (software, date, machine, every operation with its tool and parameters, extent),
 * the profile header, the moves of every operation, the profile footer (specification section 7).
 */
export function writeGcode(job: PostJob, profile: PostProfile, machine: MachineProfile): GcodeOutput
{
    const writer = new Writer(profile, machine.rapidFeed);
    writeFileHeader(writer, job, profile, machine);
    const n = (value: number, digits = profile.decimals.coordinates): string => writer.number(value, digits);
    const unit = profile.units === "inch" ? "in" : "mm";
    const toolNumbers = new Map<string, number>();
    for (const operation of job.operations)
    {
        if (!toolNumbers.has(operation.tool.id))
        {
            toolNumbers.set(operation.tool.id, toolNumbers.size + 1);
        }
    }

    writer.comment(`8-CAM ${job.version} - ${profile.name}`);
    writer.comment(`Job: ${job.name}`);
    for (const note of job.notes ?? [])
    {
        writer.comment(note);
    }
    writer.comment(`Date: ${formatDate(job.date)}`);
    writer.comment(`Machine: ${machine.name}, travel X${machine.travelX} Y${machine.travelY} Z${machine.travelZ} mm`);
    writer.comment(`Units: ${unit}`);
    const extent = movesExtent(job.operations);
    if (extent)
    {
        writer.comment(`X range: ${n(extent.xMin)} .. ${n(extent.xMax)} ${unit}`);
        writer.comment(`Y range: ${n(extent.yMin)} .. ${n(extent.yMax)} ${unit}`);
    }
    job.operations.forEach((operation, index) =>
    {
        const tool = operation.tool;
        writer.comment(`Operation ${index + 1}: ${operation.label}`);
        writer.comment(`  T${toolNumbers.get(tool.id) ?? 1} ${operation.toolLabel}, diameter ${n(tool.diameter)} ${unit}`);
        writer.comment(`  Feed XY ${n(tool.feedXY, profile.decimals.feed)}, Z ${n(tool.feedZ, profile.decimals.feed)} ${unit}/min, spindle ${tool.spindleSpeed} rpm`);
        writer.comment(`  Travel Z ${n(tool.travelZ)}, safe Z ${n(tool.safeZ)} ${unit}`);
    });
    writer.blank();

    const common: Record<string, string> = {
        date: formatDate(job.date),
        version: job.version,
        jobName: sanitizeComment(job.name),
        profileName: sanitizeComment(profile.name),
        machineName: sanitizeComment(machine.name),
        rapidFeed: n(machine.rapidFeed, profile.decimals.feed),
        safeZ: n(machine.safeZ)
    };
    writer.template(profile.header, common);

    let toolChanges = 0;
    let mountedTool: string | null = null;
    for (const operation of job.operations)
    {
        const tool = operation.tool;
        const toolNumber = toolNumbers.get(tool.id) ?? 1;
        const values: Record<string, string> = {
            ...common,
            toolNumber: String(toolNumber),
            toolId: sanitizeComment(tool.id),
            toolName: sanitizeComment(operation.toolLabel),
            toolDiameter: n(tool.diameter),
            spindleSpeed: String(Math.round(tool.spindleSpeed)),
            feedXY: n(tool.feedXY, profile.decimals.feed),
            feedZ: n(tool.feedZ, profile.decimals.feed),
            safeZ: n(Math.max(tool.safeZ, machine.safeZ)),
            travelZ: n(tool.travelZ),
            cutDepth: n(tool.cutDepth),
            message: sanitizeComment(`Change to tool T${toolNumber}: ${operation.toolLabel}`)
        };
        writer.blank();
        for (const move of operation.moves)
        {
            switch (move.kind)
            {
                case "comment":
                    writer.comment(move.text);
                    break;
                case "rapid":
                case "linear":
                    writer.move(move);
                    break;
                case "arc":
                    writer.arc(move);
                    break;
                case "toolChange":
                    // Consecutive operations of one tool (holes milled then cutout with the same mill): no change
                    if (move.toolId === mountedTool)
                    {
                        break;
                    }
                    writer.template(toolChanges === 0 ? profile.firstToolChange ?? profile.toolChange : profile.toolChange, values);
                    toolChanges++;
                    mountedTool = move.toolId;
                    break;
                case "spindle":
                    writer.template(move.on ? profile.spindleOn : profile.spindleOff,
                        move.on ? { ...values, spindleSpeed: String(Math.round(move.rpm ?? tool.spindleSpeed)) } : values);
                    break;
                case "dwell":
                    writer.template(profile.dwell, {
                        ...values,
                        seconds: String(Math.round(move.seconds * 1000) / 1000),
                        milliseconds: String(Math.round(move.seconds * 1000))
                    });
                    break;
            }
        }
    }
    writer.blank();
    writer.template(profile.footer, common);

    // The line count is known only now: it replaces its mark in the file header (same number of lines)
    const lineCount = String(writer.lines.length);
    for (let i = 0; i < writer.lines.length; i++)
    {
        writer.lines[i] = (writer.lines[i] ?? "").replace(LINE_COUNT_MARK, lineCount);
    }

    const forbidden: GcodeOutput["forbidden"] = [];
    writer.lines.forEach((line, index) =>
    {
        const code = line.replace(/\(.*?\)|;.*$/g, "").toUpperCase();
        for (const word of profile.forbidden)
        {
            if (new RegExp(`(^|\\s)${word.toUpperCase()}(?![0-9.])`).test(code))
            {
                forbidden.push({ word, line: index + 1 });
            }
        }
    });
    return { text: `${writer.lines.join("\n")}\n`, lineCount: writer.lines.length, forbidden };
}
