// Default settings of new operations, and the machine of a first visit, for every user of the site. The maintainer sets them in public/defaults.json,
// read when the application starts: changing a value on the server needs no new build. A setting missing or invalid
// in the file keeps the value built into the code, and is reported in the browser console.

import { DEFAULT_CUTOUT, type CutoutParams } from "@cam/cutout/index";
import { DEFAULT_DRILLING, type DrillingParams } from "@cam/drilling/index";
import { DEFAULT_ISOLATION, type IsolationParams } from "@cam/isolation/index";
import { importMachine, type MachineProfile } from "@post/index";
import { boolean, direction, integer, number, oneOf, type Check } from "./checks";

/** Settings that do not depend on the board: depths follow its thickness, layers and tools the project. */
export interface AppDefaults
{
    isolation: Pick<IsolationParams, "passes" | "overlap" | "direction" | "combinePasses" | "extraOffset">;
    drilling: Pick<DrillingParams, "cycle" | "peckDepth" | "dwell">;
    cutout: Pick<CutoutParams, "mode" | "direction" | "tabWidth" | "tabHeight"> & { tabCount: number };
    /**
     * Machine of a user who has none stored yet (first visit), same fields as a machine file (.8cam-machine.json).
     * Null: the built-in CNC 3018. Users keep the machines they already have.
     */
    machine: MachineProfile | null;
}

export const BUILT_IN_DEFAULTS: Readonly<AppDefaults> = {
    isolation: {
        passes: DEFAULT_ISOLATION.passes,
        overlap: DEFAULT_ISOLATION.overlap,
        direction: DEFAULT_ISOLATION.direction,
        combinePasses: DEFAULT_ISOLATION.combinePasses,
        extraOffset: DEFAULT_ISOLATION.extraOffset
    },
    drilling: { cycle: DEFAULT_DRILLING.cycle, peckDepth: DEFAULT_DRILLING.peckDepth, dwell: DEFAULT_DRILLING.dwell },
    cutout: {
        mode: DEFAULT_CUTOUT.mode,
        direction: DEFAULT_CUTOUT.direction,
        tabWidth: DEFAULT_CUTOUT.tabWidth,
        tabHeight: DEFAULT_CUTOUT.tabHeight,
        tabCount: 4
    },
    machine: null
};

/** Values accepted for each setting of the file. */
const CHECKS: { [Kind in "isolation" | "drilling" | "cutout"]: Record<keyof AppDefaults[Kind], Check> } = {
    isolation: { passes: integer(1, 20), overlap: number(0, 0.9), direction, combinePasses: boolean, extraOffset: number(0, 5) },
    drilling: { cycle: oneOf("simple", "peck"), peckDepth: number(0.01, 10), dwell: number(0, 60) },
    cutout: { mode: oneOf("shape", "rectangle"), direction, tabWidth: number(0, 50), tabHeight: number(0, 10), tabCount: integer(0, 50) }
};

/**
 * Defaults of the file over the built-in ones. Issues name each setting left at its built-in value: "cutout.tabCount",
 * or the whole file when it cannot be read. Keys starting with "$" are comments.
 */
export function parseAppDefaults(text: string): { defaults: AppDefaults; issues: string[] }
{
    const defaults = structuredClone(BUILT_IN_DEFAULTS) as AppDefaults;
    const issues: string[] = [];
    let data: unknown;
    try
    {
        data = JSON.parse(text);
    }
    catch
    {
        return { defaults, issues: ["file: not valid JSON"] };
    }
    if (typeof data !== "object" || data === null || Array.isArray(data))
    {
        return { defaults, issues: ["file: not an object"] };
    }
    for (const [kind, values] of Object.entries(data as Record<string, unknown>))
    {
        if (kind.startsWith("$"))
        {
            continue;
        }
        if (kind === "machine")
        {
            const result = importMachine(JSON.stringify(values));
            if ("machine" in result)
            {
                defaults.machine = result.machine;
            }
            else
            {
                issues.push(`machine: ${result.issues.map((issue) => `${issue.field} ${issue.code}`).join(", ")}`);
            }
            continue;
        }
        if (!(kind in CHECKS))
        {
            issues.push(`${kind}: unknown operation`);
            continue;
        }
        const checks = CHECKS[kind as keyof typeof CHECKS] as Record<string, Check>;
        const target = defaults[kind as keyof typeof CHECKS] as Record<string, unknown>;
        for (const [field, value] of Object.entries(typeof values === "object" && values !== null ? values : {}))
        {
            const check = checks[field];
            if (field.startsWith("$"))
            {
                continue;
            }
            if (!check)
            {
                issues.push(`${kind}.${field}: unknown setting`);
            }
            else if (!check(value))
            {
                issues.push(`${kind}.${field}: invalid value ${JSON.stringify(value)}`);
            }
            else
            {
                target[field] = value;
            }
        }
    }
    return { defaults, issues };
}
