// Tool library: built-in starting tools (specification 6.10) and JSON import / export.
// Persistence (IndexedDB) belongs to the user interface; this module only deals with data.

import type { Tool, ToolType, ToolUsage } from "./tool";

/** Common heights of the built-in tools, mm: above clamps between cuts, and well clear at tool changes. */
const TRAVEL_Z = 2;
const SAFE_Z = 15;
/** Assumed FR4 board thickness for the built-in cutout and drilling depths, mm. */
const BOARD_THICKNESS = 1.6;

function builtIn(id: string, type: ToolType, values: Partial<Tool> & { diameter: number; usages: ToolUsage[] }): Tool
{
    return {
        id,
        name: "",
        type,
        tipDiameter: 0,
        tipAngle: type === "drill" ? 118 : 0,
        cutDepth: 0.1,
        depthPerPass: 0.1,
        feedXY: 150,
        feedZ: 50,
        spindleSpeed: 10_000,
        travelZ: TRAVEL_Z,
        safeZ: SAFE_Z,
        builtIn: true,
        notes: "",
        ...values
    };
}

/**
 * Starting values for a 3018 CNC on FR4 (specification 6.10 table), clearly marked as to be validated on each machine.
 * V-bit depths: middle of the advised range (0.05 to 0.1 mm for the 20° one).
 */
export function defaultLibrary(): Tool[]
{
    // 1.6 + 0.1 is 1.7000000000000002 in floating point: rounded so the fields show 1.7
    const drillDepth = roundValue(BOARD_THICKNESS + 0.2);
    const cutoutDepth = roundValue(BOARD_THICKNESS + 0.1);
    return [
        builtIn("vbit-20-0.1", "vbit", {
            diameter: 3.175, tipDiameter: 0.1, tipAngle: 20, cutDepth: 0.075, depthPerPass: 0.075,
            feedXY: 120, feedZ: 50, usages: ["isolation"]
        }),
        builtIn("vbit-30-0.2", "vbit", {
            diameter: 3.175, tipDiameter: 0.2, tipAngle: 30, cutDepth: 0.1, depthPerPass: 0.1, usages: ["isolation"]
        }),
        builtIn("endmill-0.8", "endmill", {
            diameter: 0.8, cutDepth: 0.1, depthPerPass: 0.1, usages: ["isolation", "holeMilling"]
        }),
        builtIn("cornmill-1.5", "endmill", {
            diameter: 1.5, cutDepth: cutoutDepth, depthPerPass: 0.4, spindleSpeed: 12_000, usages: ["cutout", "holeMilling"]
        }),
        ...[0.6, 0.8, 1.0, 1.2].map((diameter) => builtIn(`drill-${diameter.toFixed(1)}`, "drill", {
            diameter, cutDepth: drillDepth, depthPerPass: drillDepth, feedXY: 0, feedZ: 60, usages: ["drilling"]
        }))
    ];
}

/** File format version of exported libraries. */
export const LIBRARY_FORMAT = "8cam-tools";
export const LIBRARY_VERSION = 1;

export interface LibraryFile
{
    format: typeof LIBRARY_FORMAT;
    version: number;
    tools: Tool[];
}

export function exportLibrary(tools: readonly Tool[]): string
{
    const file: LibraryFile = { format: LIBRARY_FORMAT, version: LIBRARY_VERSION, tools: [...tools] };
    return JSON.stringify(file, null, 2);
}

const TYPES: readonly ToolType[] = ["endmill", "vbit", "drill"];
const USAGES: readonly ToolUsage[] = ["isolation", "drilling", "holeMilling", "cutout"];
const NUMBER_FIELDS = [
    "diameter", "tipDiameter", "tipAngle", "cutDepth", "depthPerPass", "feedXY", "feedZ", "spindleSpeed", "travelZ", "safeZ"
] as const;

/** Tool values are kept to 6 decimals (1 nm): enough for any tool, and free of floating point leftovers. */
function roundValue(value: number): number
{
    return Math.round(value * 1e6) / 1e6;
}

/** The tool with its numbers rounded to 6 decimals (tools stored by earlier versions may hold 1.7000000000000002). */
export function cleanToolNumbers(tool: Tool): Tool
{
    const clean = { ...tool };
    for (const field of NUMBER_FIELDS)
    {
        clean[field] = roundValue(tool[field]);
    }
    return clean;
}

export type LibraryImportError = "notJson" | "wrongFormat" | "newerVersion" | "invalidTool";

export type LibraryImport = { tools: Tool[]; skipped: number } | { error: LibraryImportError };

/** Tool read from a file, or null when a field is missing or not a number. Always the user's own (not built-in). */
export function readTool(value: unknown): Tool | null
{
    if (typeof value !== "object" || value === null)
    {
        return null;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.length === 0 || !TYPES.includes(record.type as ToolType))
    {
        return null;
    }
    const numbers: Partial<Record<(typeof NUMBER_FIELDS)[number], number>> = {};
    for (const field of NUMBER_FIELDS)
    {
        const number = record[field];
        if (typeof number !== "number" || !Number.isFinite(number))
        {
            return null;
        }
        numbers[field] = roundValue(number);
    }
    const usages = Array.isArray(record.usages)
        ? record.usages.filter((usage): usage is ToolUsage => USAGES.includes(usage as ToolUsage))
        : [];
    return {
        id: record.id,
        name: typeof record.name === "string" ? record.name : "",
        type: record.type as ToolType,
        diameter: numbers.diameter ?? 0,
        tipDiameter: numbers.tipDiameter ?? 0,
        tipAngle: numbers.tipAngle ?? 0,
        cutDepth: numbers.cutDepth ?? 0,
        depthPerPass: numbers.depthPerPass ?? 0,
        feedXY: numbers.feedXY ?? 0,
        feedZ: numbers.feedZ ?? 0,
        spindleSpeed: numbers.spindleSpeed ?? 0,
        travelZ: numbers.travelZ ?? 0,
        safeZ: numbers.safeZ ?? 0,
        usages,
        // An imported tool is the user's own, even if it came from a built-in one
        builtIn: false,
        notes: typeof record.notes === "string" ? record.notes : ""
    };
}

/** Reads an exported library. Invalid tools are skipped and counted; a file that is not a library is rejected. */
export function importLibrary(text: string): LibraryImport
{
    let data: unknown;
    try
    {
        data = JSON.parse(text);
    }
    catch
    {
        return { error: "notJson" };
    }
    if (typeof data !== "object" || data === null || (data as Partial<LibraryFile>).format !== LIBRARY_FORMAT
        || !Array.isArray((data as Partial<LibraryFile>).tools))
    {
        return { error: "wrongFormat" };
    }
    const file = data as LibraryFile;
    if (typeof file.version !== "number" || file.version > LIBRARY_VERSION)
    {
        return { error: "newerVersion" };
    }
    const tools = file.tools.map(readTool);
    const valid = tools.filter((tool): tool is Tool => tool !== null);
    if (valid.length === 0 && tools.length > 0)
    {
        return { error: "invalidTool" };
    }
    return { tools: valid, skipped: tools.length - valid.length };
}

/** Adds imported tools to a library: a tool with the same id replaces the existing one. */
export function mergeLibraries(current: readonly Tool[], incoming: readonly Tool[]): Tool[]
{
    const ids = new Set(incoming.map((tool) => tool.id));
    return [...current.filter((tool) => !ids.has(tool.id)), ...incoming];
}

/** Same cutting values and description (the id and the built-in mark aside). */
function sameTool(a: Tool, b: Tool): boolean
{
    const values = (tool: Tool): string => JSON.stringify({ ...tool, id: "", builtIn: false, usages: [...tool.usages].sort() });
    return values(a) === values(b);
}

/**
 * Tools of an opened project added to the library without changing any tool already there: a tool identical to the
 * library one with the same id is that tool, any other is added under a new id. Returns the id each project tool has
 * in the library.
 */
export function addProjectTools(current: readonly Tool[], incoming: readonly Tool[], newId: () => string): { tools: Tool[]; ids: Record<string, string>; added: number }
{
    const tools = [...current];
    const ids: Record<string, string> = {};
    let added = 0;
    for (const tool of incoming)
    {
        const existing = current.find((entry) => entry.id === tool.id);
        if (existing && sameTool(existing, tool))
        {
            ids[tool.id] = existing.id;
            continue;
        }
        const id = existing ? newId() : tool.id;
        tools.push({ ...tool, id, builtIn: false });
        ids[tool.id] = id;
        added++;
    }
    return { tools, ids, added };
}

/** Copy of a tool with a new id, editable by the user. */
export function duplicateTool(tool: Tool, id: string): Tool
{
    return { ...tool, id, builtIn: false, usages: [...tool.usages] };
}
