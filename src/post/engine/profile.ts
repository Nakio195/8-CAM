// Post-processor profile (specification 6.8): a JSON description of a controller dialect, interpreted by a single
// writer. Reference: FlatCAM preprocessors/*.py (one Python class per controller, with start_code, toolchange_code,
// spindle_code, dwell_code, end_code...), turned here into declarative data that users can edit, import and export.

export const PROFILE_FORMAT = "8cam-post";
export const PROFILE_VERSION = 1;

export type CommentStyle = "parentheses" | "semicolon" | "none";

/**
 * Template lines may hold variables in braces, replaced when writing: {date}, {version}, {jobName}, {profileName},
 * {machineName}, {toolNumber}, {toolId}, {toolName}, {toolDiameter}, {spindleSpeed}, {feedXY}, {feedZ}, {safeZ},
 * {travelZ}, {cutDepth}, {rapidFeed}, {seconds}, {milliseconds}, {message}. A line left empty is dropped.
 * The file header may also use values known once the whole file is written: {lineCount}, {estimatedSeconds},
 * {xMin}, {xMax}, {yMin}, {yMax}, {zMin}, {zMax}, {workSpeed} (fastest cutting feed), {spindlePercent} (fastest
 * spindle speed in % of the machine maximum).
 */
export type TemplateLines = string[];

export interface PostProfile
{
    format: typeof PROFILE_FORMAT;
    version: typeof PROFILE_VERSION;
    id: string;
    name: string;
    description: string;
    /** Built-in profiles are restored by "reset"; edited copies are the user's. */
    builtIn: boolean;
    units: "mm" | "inch";
    decimals: { coordinates: number; feed: number };
    lineNumbers: { enabled: boolean; start: number; step: number };
    comments: CommentStyle;
    /** Native: G2 / G3 with I J; linearize: arcs written as short G1 segments. */
    arcs: "native" | "linearize";
    /** Modal: F written only when it changes (GRBL, LinuxCNC); everyLine: on every feed move (Marlin). */
    feeds: "modal" | "everyLine";
    /** Rapid moves carry F{rapidFeed} (Marlin G0 uses the last feed otherwise). */
    rapidWithFeed: boolean;
    /** Words of each move kind. */
    commands: { rapid: string; linear: string; arcCW: string; arcCCW: string };
    /** After the descriptive comments: units, absolute mode, plane... */
    header: TemplateLines;
    /** Tool change sequence: M6 for a tool changer, or a pause for a manual change. */
    toolChange: TemplateLines;
    spindleOn: TemplateLines;
    spindleOff: TemplateLines;
    dwell: TemplateLines;
    footer: TemplateLines;
    /** Words the controller refuses: their presence in the output is reported as an error. */
    forbidden: string[];
    /**
     * Lines written first, before the descriptive comments, as they are (no comment conversion): metadata some
     * controllers read, such as the ";Header Start" block of Snapmaker screens. Optional: older profiles have none.
     */
    fileHeader?: TemplateLines;
    /** Extension of the files written, without the dot ("nc" when not given). */
    fileExtension?: string;
    /**
     * First tool change of a file, when it differs from the others: the first tool is mounted and the work origin set
     * before the file starts, so a pause there is useless (Snapmaker). The tool change sequence when not given.
     */
    firstToolChange?: TemplateLines;
}

/** Extension used when a profile does not give one. */
export const DEFAULT_FILE_EXTENSION = "nc";

/** The profile with its optional fields filled in. */
export function normalizeProfile(profile: PostProfile): PostProfile
{
    return { ...profile, fileHeader: profile.fileHeader ?? [], fileExtension: profile.fileExtension ?? DEFAULT_FILE_EXTENSION };
}

export type ProfileIssueCode =
    | "invalidJson"
    | "wrongFormat"
    | "unsupportedVersion"
    | "missingName"
    | "invalidDecimals"
    | "invalidLineNumbers"
    | "invalidCommand"
    | "invalidTemplate"
    | "invalidExtension";

export interface ProfileIssue
{
    code: ProfileIssueCode;
    field: string;
}

const TEMPLATE_FIELDS = ["header", "toolChange", "spindleOn", "spindleOff", "dwell", "footer"] as const;

function isStringArray(value: unknown): value is string[]
{
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Checks a profile (typed or freshly parsed); an empty list means it can be used. */
export function validateProfile(value: unknown): ProfileIssue[]
{
    const issues: ProfileIssue[] = [];
    const profile = value as Partial<PostProfile> | null;
    if (!profile || typeof profile !== "object")
    {
        return [{ code: "wrongFormat", field: "format" }];
    }
    if (profile.format !== PROFILE_FORMAT)
    {
        return [{ code: "wrongFormat", field: "format" }];
    }
    if (profile.version !== PROFILE_VERSION)
    {
        return [{ code: "unsupportedVersion", field: "version" }];
    }
    if (typeof profile.name !== "string" || profile.name.trim() === "" || typeof profile.id !== "string" || profile.id === "")
    {
        issues.push({ code: "missingName", field: "name" });
    }
    const decimals = profile.decimals;
    if (!decimals || ![decimals.coordinates, decimals.feed].every((digits) => Number.isInteger(digits) && digits >= 0 && digits <= 6))
    {
        issues.push({ code: "invalidDecimals", field: "decimals" });
    }
    const numbers = profile.lineNumbers;
    if (!numbers || typeof numbers.enabled !== "boolean" || !Number.isInteger(numbers.start) || numbers.start < 0
        || !Number.isInteger(numbers.step) || numbers.step < 1)
    {
        issues.push({ code: "invalidLineNumbers", field: "lineNumbers" });
    }
    const commands = profile.commands;
    if (!commands || ![commands.rapid, commands.linear, commands.arcCW, commands.arcCCW].every((word) => typeof word === "string" && /^[A-Z]\d+(\.\d+)?$/i.test(word)))
    {
        issues.push({ code: "invalidCommand", field: "commands" });
    }
    for (const field of TEMPLATE_FIELDS)
    {
        if (!isStringArray(profile[field]))
        {
            issues.push({ code: "invalidTemplate", field });
        }
    }
    if (!isStringArray(profile.forbidden))
    {
        issues.push({ code: "invalidTemplate", field: "forbidden" });
    }
    if (profile.fileHeader !== undefined && !isStringArray(profile.fileHeader))
    {
        issues.push({ code: "invalidTemplate", field: "fileHeader" });
    }
    if (profile.firstToolChange !== undefined && !isStringArray(profile.firstToolChange))
    {
        issues.push({ code: "invalidTemplate", field: "firstToolChange" });
    }
    if (profile.fileExtension !== undefined && !/^[a-z0-9]{1,5}$/i.test(String(profile.fileExtension)))
    {
        issues.push({ code: "invalidExtension", field: "fileExtension" });
    }
    if (!["parentheses", "semicolon", "none"].includes(String(profile.comments)) || !["mm", "inch"].includes(String(profile.units))
        || !["native", "linearize"].includes(String(profile.arcs)) || !["modal", "everyLine"].includes(String(profile.feeds))
        || typeof profile.rapidWithFeed !== "boolean")
    {
        issues.push({ code: "invalidTemplate", field: "options" });
    }
    return issues;
}

/** Profile as a JSON file. */
export function exportProfile(profile: PostProfile): string
{
    return `${JSON.stringify({ ...profile, builtIn: false }, null, 2)}\n`;
}

/** Profile read from a JSON file, or the problems found in it. An imported profile is always the user's. */
export function importProfile(text: string): { profile: PostProfile } | { issues: ProfileIssue[] }
{
    let parsed: unknown;
    try
    {
        parsed = JSON.parse(text);
    }
    catch
    {
        return { issues: [{ code: "invalidJson", field: "format" }] };
    }
    const issues = validateProfile(parsed);
    if (issues.length > 0)
    {
        return { issues };
    }
    return { profile: normalizeProfile({ ...(parsed as PostProfile), builtIn: false }) };
}
