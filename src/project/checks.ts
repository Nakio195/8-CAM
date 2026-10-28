// Small value checks for data read from files (project, site defaults): nothing read from outside is trusted.

export type Check = (value: unknown) => boolean;

export const number = (min: number, max: number): Check => (value) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
export const integer = (min: number, max: number): Check => (value) => number(min, max)(value) && Number.isInteger(value);
export const oneOf = (...choices: readonly string[]): Check => (value) => typeof value === "string" && choices.includes(value);
export const text = (maxLength: number): Check => (value) => typeof value === "string" && value.length <= maxLength;
export const boolean: Check = (value) => typeof value === "boolean";
export const direction = oneOf("climb", "conventional");
export const point: Check = (value) => typeof value === "object" && value !== null
    && Number.isFinite((value as { x?: unknown }).x) && Number.isFinite((value as { y?: unknown }).y);

/** True when the value is an object whose listed fields all pass their check. */
export function matches(value: unknown, checks: Readonly<Record<string, Check>>): boolean
{
    return typeof value === "object" && value !== null && !Array.isArray(value)
        && Object.entries(checks).every(([field, check]) => check((value as Record<string, unknown>)[field]));
}

/** True when the value is an array of at most maxLength entries, each passing the check. */
export function arrayOf(check: Check, maxLength: number): Check
{
    return (value) => Array.isArray(value) && value.length <= maxLength && value.every(check);
}
