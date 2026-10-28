// Settings the user chose as defaults for new operations ("use as default" on an operation card). Only the settings
// that do not depend on the board are kept: depths follow the board thickness, layers and tools the project.

import type { CutoutParams } from "@cam/cutout/index";
import type { DrillingParams } from "@cam/drilling/index";
import type { IsolationParams } from "@cam/isolation/index";

export type IsolationDefaults = Pick<IsolationParams, "passes" | "overlap" | "direction" | "combinePasses" | "extraOffset">;
export type DrillingDefaults = Pick<DrillingParams, "cycle" | "peckDepth" | "dwell">;
export type CutoutDefaults = Pick<CutoutParams, "mode" | "direction" | "tabWidth" | "tabHeight"> & { tabCount: number };

export interface OperationDefaults
{
    isolation?: Partial<IsolationDefaults>;
    drilling?: Partial<DrillingDefaults>;
    cutout?: Partial<CutoutDefaults>;
}

export type DefaultsKind = keyof OperationDefaults;

type Check = (value: unknown) => boolean;

const number = (min: number, max: number): Check => (value) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const oneOf = (...choices: readonly string[]): Check => (value) => typeof value === "string" && choices.includes(value);
const boolean: Check = (value) => typeof value === "boolean";
const direction = oneOf("climb", "conventional");

/** Settings kept for each kind, with the values accepted when reading them back. */
const FIELDS: { [Kind in DefaultsKind]: Record<keyof NonNullable<OperationDefaults[Kind]>, Check> } = {
    isolation: { passes: number(1, 20), overlap: number(0, 0.9), direction, combinePasses: boolean, extraOffset: number(0, 5) },
    drilling: { cycle: oneOf("simple", "peck"), peckDepth: number(0.01, 10), dwell: number(0, 60) },
    cutout: { mode: oneOf("shape", "rectangle"), direction, tabWidth: number(0, 50), tabHeight: number(0, 10), tabCount: number(0, 50) }
};

/** The settings of an operation kept as defaults, taken from its values. */
export function pickDefaults<Kind extends DefaultsKind>(kind: Kind, settings: object): NonNullable<OperationDefaults[Kind]>
{
    const values = settings as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const [field, check] of Object.entries(FIELDS[kind]) as [string, Check][])
    {
        if (check(values[field]))
        {
            picked[field] = values[field];
        }
    }
    return picked as NonNullable<OperationDefaults[Kind]>;
}

/** Defaults read back from storage: unknown or invalid settings are dropped, never trusted. */
export function parseDefaults(text: string | null): OperationDefaults
{
    let data: unknown;
    try
    {
        data = text ? JSON.parse(text) : null;
    }
    catch
    {
        return {};
    }
    if (typeof data !== "object" || data === null)
    {
        return {};
    }
    const result: OperationDefaults = {};
    for (const kind of Object.keys(FIELDS) as DefaultsKind[])
    {
        const values = (data as Record<string, unknown>)[kind];
        if (typeof values === "object" && values !== null)
        {
            const picked = pickDefaults(kind, values);
            if (Object.keys(picked).length > 0)
            {
                result[kind] = picked as never;
            }
        }
    }
    return result;
}

/** True when the operation already has the defaults of its kind (nothing to save). */
export function sameAsDefaults(kind: DefaultsKind, values: object, defaults: OperationDefaults): boolean
{
    const stored = defaults[kind] as Record<string, unknown> | undefined;
    const picked = pickDefaults(kind, values) as Record<string, unknown>;
    return stored !== undefined && Object.keys(FIELDS[kind]).every((field) => stored[field] === picked[field]);
}
