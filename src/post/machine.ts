// Machine profile (docs/architecture.md section 5.1): the travel and limits of the user's machine, never hard-coded.
// The safety checks of specification section 7 read it. It lives in post (not project) because those checks do.

export const MACHINE_FORMAT = "8cam-machine";
export const MACHINE_VERSION = 1;

export interface MachineProfile
{
    format: typeof MACHINE_FORMAT;
    version: typeof MACHINE_VERSION;
    id: string;
    name: string;
    /** Useful travel of each axis, mm. */
    travelX: number;
    travelY: number;
    travelZ: number;
    /** Lowest height the machine may use for tool changes and the end of the program, mm above the board. */
    safeZ: number;
    /** rpm. */
    maxSpindleSpeed: number;
    /** Lowest spindle speed the machine runs at, rpm (0: no minimum). Slower requests are raised by the firmware. */
    minSpindleSpeed: number;
    /** mm/min. */
    maxFeedXY: number;
    maxFeedZ: number;
    /** Speed of rapid moves, mm/min: used for time estimates and by controllers needing F on G0 (Marlin). */
    rapidFeed: number;
    /** Post-processor profile used by this machine. */
    postProfileId: string;
    /**
     * Pause: one file, the program pauses at each tool change. Separate files: one file per tool, the Z zero set again
     * with each tool before starting its file (machines that cannot set the zero during a pause, such as the Artisan).
     */
    toolChangeMode: ToolChangeMode;
}

export type ToolChangeMode = "pause" | "separateFiles";

/**
 * Small hobby milling machine with GRBL: the machine used when the site sets none (defaults.json), and the values given
 * to fields missing from older machine files. Values to be checked on each machine.
 */
export const DEFAULT_MACHINE: Readonly<MachineProfile> = {
    format: MACHINE_FORMAT,
    version: MACHINE_VERSION,
    id: "grbl-machine",
    name: "Fraiseuse GRBL",
    travelX: 300,
    travelY: 200,
    travelZ: 50,
    safeZ: 5,
    // The built-in corn cob mill runs at 12 000 rpm (specification 6.10)
    maxSpindleSpeed: 12_000,
    minSpindleSpeed: 0,
    maxFeedXY: 1500,
    maxFeedZ: 500,
    rapidFeed: 1000,
    postProfileId: "grbl-1.1",
    toolChangeMode: "pause"
};

/**
 * Snapmaker Artisan with its 200 W CNC module: 400 x 400 mm work area, spindle from 8 000 to 18 000 rpm (the firmware
 * raises slower requests to 8 000 rpm), 50 mm/s at most in wood. Z travel and rapid speed are cautious values to check
 * on the machine, the module and the spoil board taking part of the height.
 */
export const SNAPMAKER_ARTISAN: Readonly<MachineProfile> = {
    format: MACHINE_FORMAT,
    version: MACHINE_VERSION,
    id: "snapmaker-artisan",
    name: "Snapmaker Artisan",
    travelX: 400,
    travelY: 400,
    travelZ: 60,
    safeZ: 5,
    maxSpindleSpeed: 18_000,
    minSpindleSpeed: 8000,
    maxFeedXY: 3000,
    maxFeedZ: 600,
    rapidFeed: 3000,
    postProfileId: "snapmaker-artisan",
    // The Artisan screen offers no jog nor origin setting during a paused CNC job (docs/architecture.md 19.6)
    toolChangeMode: "separateFiles"
};

/** Machines the user can start from. */
export const MACHINE_PRESETS: readonly MachineProfile[] = [DEFAULT_MACHINE, SNAPMAKER_ARTISAN];

export type MachineIssueCode = "missingName" | "notPositive" | "safeAboveTravel" | "invalidFormat" | "minAboveMax" | "invalidToolChange";

export interface MachineIssue
{
    code: MachineIssueCode;
    field: keyof MachineProfile | "format";
}

const POSITIVE_FIELDS = ["travelX", "travelY", "travelZ", "safeZ", "maxSpindleSpeed", "maxFeedXY", "maxFeedZ", "rapidFeed"] as const;

export function validateMachine(machine: MachineProfile): MachineIssue[]
{
    const issues: MachineIssue[] = [];
    if (machine.format !== MACHINE_FORMAT || machine.version !== MACHINE_VERSION)
    {
        return [{ code: "invalidFormat", field: "format" }];
    }
    if (typeof machine.name !== "string" || machine.name.trim() === "")
    {
        issues.push({ code: "missingName", field: "name" });
    }
    for (const field of POSITIVE_FIELDS)
    {
        if (!Number.isFinite(machine[field]) || machine[field] <= 0)
        {
            issues.push({ code: "notPositive", field });
        }
    }
    if (machine.safeZ >= machine.travelZ)
    {
        issues.push({ code: "safeAboveTravel", field: "safeZ" });
    }
    if (machine.toolChangeMode !== "pause" && machine.toolChangeMode !== "separateFiles")
    {
        issues.push({ code: "invalidToolChange", field: "toolChangeMode" });
    }
    if (!Number.isFinite(machine.minSpindleSpeed) || machine.minSpindleSpeed < 0 || machine.minSpindleSpeed >= machine.maxSpindleSpeed)
    {
        issues.push({ code: "minAboveMax", field: "minSpindleSpeed" });
    }
    return issues;
}

export function exportMachine(machine: MachineProfile): string
{
    return `${JSON.stringify(machine, null, 2)}\n`;
}

/** Machine read from a JSON file; missing numbers take the default values so older files stay usable. */
export function importMachine(text: string): { machine: MachineProfile } | { issues: MachineIssue[] }
{
    let parsed: unknown;
    try
    {
        parsed = JSON.parse(text);
    }
    catch
    {
        return { issues: [{ code: "invalidFormat", field: "format" }] };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    {
        return { issues: [{ code: "invalidFormat", field: "format" }] };
    }
    const machine = { ...DEFAULT_MACHINE, ...(parsed as Partial<MachineProfile>) } as MachineProfile;
    const issues = validateMachine(machine);
    return issues.length > 0 ? { issues } : { machine };
}
