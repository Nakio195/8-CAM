// Cutting tool model (specification 6.3). User parameters are kept in millimetres, mm/min and rpm, as typed;
// they are converted to internal units only when toolpaths are computed.
// Reference: FlatCAM appDatabase.py (tool database) and ToolIsolation.current_vbit_parameters (V-bit width).

export type ToolType = "endmill" | "vbit" | "drill";

/** What a tool is meant for; used to filter recommendations and shown on the tool card. */
export type ToolUsage = "isolation" | "drilling" | "holeMilling" | "cutout";

export interface Tool
{
    id: string;
    /** Free name; empty for built-in tools, whose label is generated from their parameters in the user's language. */
    name: string;
    type: ToolType;
    /** Body (or shank cutting) diameter, mm. For a V-bit, the widest width the cone can cut. */
    diameter: number;
    /** V-bit only: width of the flat at the tip, mm. */
    tipDiameter: number;
    /** V-bit: cone angle, degrees. Drill: point angle (118° for usual twist drills). */
    tipAngle: number;
    /** Total depth below the copper surface, mm (positive). */
    cutDepth: number;
    /** Depth removed at each pass, mm (positive); equal to cutDepth for a single pass. */
    depthPerPass: number;
    /** Feed rates, mm/min. */
    feedXY: number;
    feedZ: number;
    /** Spindle speed, rpm. */
    spindleSpeed: number;
    /** Travel height between cuts and safe height (start, end, tool changes), mm above the surface. */
    travelZ: number;
    safeZ: number;
    usages: ToolUsage[];
    /** Built-in starting values for a hobby CNC on FR4: to be validated on each machine (specification 6.10). */
    builtIn: boolean;
    notes: string;
}

/** Problems found in a tool definition; codes are translated by the user interface. */
export type ToolIssueCode =
    | "diameterNotPositive"
    | "tipLargerThanDiameter"
    | "tipAngleOutOfRange"
    | "depthNotPositive"
    | "depthPerPassNotPositive"
    | "depthPerPassAboveDepth"
    | "feedNotPositive"
    | "spindleNotPositive"
    | "safeBelowTravel"
    | "travelNotPositive";

export interface ToolIssue
{
    code: ToolIssueCode;
    field: keyof Tool;
}

/**
 * Width cut by the tool at its cutting depth (specification 6.4).
 * V-bit: tip + 2 · depth · tan(angle / 2), limited to the body diameter. Other tools: their diameter.
 */
export function effectiveWidth(tool: Pick<Tool, "type" | "diameter" | "tipDiameter" | "tipAngle">, depth: number): number
{
    if (tool.type !== "vbit")
    {
        return tool.diameter;
    }
    const halfAngle = (tool.tipAngle / 2) * (Math.PI / 180);
    const width = tool.tipDiameter + 2 * Math.max(0, depth) * Math.tan(halfAngle);
    return tool.diameter > 0 ? Math.min(width, tool.diameter) : width;
}

/** Width cut at the tool's own cutting depth. */
export function toolWidth(tool: Tool): number
{
    return effectiveWidth(tool, tool.cutDepth);
}

/** Number of depth passes needed to reach depth with the tool's depth per pass. */
export function passCount(depth: number, depthPerPass: number): number
{
    if (depth <= 0 || depthPerPass <= 0)
    {
        return 1;
    }
    // A tiny tolerance avoids an extra pass for exact multiples such as 1.2 / 0.4
    return Math.max(1, Math.ceil(depth / depthPerPass - 1e-9));
}

/** Depth of each pass, shallowest first, the last one reaching depth exactly (FlatCAM camlib.calculate_depths). */
export function passDepths(depth: number, depthPerPass: number): number[]
{
    const count = passCount(depth, depthPerPass);
    const depths: number[] = [];
    for (let i = 1; i < count; i++)
    {
        depths.push(i * depthPerPass);
    }
    depths.push(depth);
    return depths;
}

/** Checks a tool for impossible or inconsistent values; an empty list means the tool can be used. */
export function validateTool(tool: Tool): ToolIssue[]
{
    const issues: ToolIssue[] = [];
    if (!(tool.diameter > 0))
    {
        issues.push({ code: "diameterNotPositive", field: "diameter" });
    }
    if (tool.type === "vbit")
    {
        if (tool.tipDiameter < 0 || tool.tipDiameter > tool.diameter)
        {
            issues.push({ code: "tipLargerThanDiameter", field: "tipDiameter" });
        }
        if (!(tool.tipAngle > 0 && tool.tipAngle < 180))
        {
            issues.push({ code: "tipAngleOutOfRange", field: "tipAngle" });
        }
    }
    if (!(tool.cutDepth > 0))
    {
        issues.push({ code: "depthNotPositive", field: "cutDepth" });
    }
    if (!(tool.depthPerPass > 0))
    {
        issues.push({ code: "depthPerPassNotPositive", field: "depthPerPass" });
    }
    else if (tool.depthPerPass > tool.cutDepth + 1e-9)
    {
        issues.push({ code: "depthPerPassAboveDepth", field: "depthPerPass" });
    }
    if (!(tool.feedZ > 0) || (tool.type !== "drill" && !(tool.feedXY > 0)))
    {
        issues.push({ code: "feedNotPositive", field: tool.feedZ > 0 ? "feedXY" : "feedZ" });
    }
    if (!(tool.spindleSpeed > 0))
    {
        issues.push({ code: "spindleNotPositive", field: "spindleSpeed" });
    }
    if (!(tool.travelZ > 0))
    {
        issues.push({ code: "travelNotPositive", field: "travelZ" });
    }
    if (tool.safeZ < tool.travelZ)
    {
        issues.push({ code: "safeBelowTravel", field: "safeZ" });
    }
    return issues;
}
