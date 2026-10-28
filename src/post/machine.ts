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
    /** mm/min. */
    maxFeedXY: number;
    maxFeedZ: number;
    /** Speed of rapid moves, mm/min: used for time estimates and by controllers needing F on G0 (Marlin). */
    rapidFeed: number;
    /** Post-processor profile used by this machine. */
    postProfileId: string;
}

/** CNC 3018 with GRBL: the machine of 8 Fablab Drôme, values to be checked on each machine. */
export const DEFAULT_MACHINE: Readonly<MachineProfile> = {
    format: MACHINE_FORMAT,
    version: MACHINE_VERSION,
    id: "cnc-3018",
    name: "CNC 3018",
    travelX: 300,
    travelY: 180,
    travelZ: 45,
    safeZ: 5,
    // The built-in corn cob mill runs at 12 000 rpm (specification 6.10)
    maxSpindleSpeed: 12_000,
    maxFeedXY: 1500,
    maxFeedZ: 500,
    rapidFeed: 1000,
    postProfileId: "grbl-1.1"
};

export type MachineIssueCode = "missingName" | "notPositive" | "safeAboveTravel" | "invalidFormat";

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
