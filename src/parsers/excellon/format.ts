// Excellon number formats. Reference: FlatCAM appParsers/ParseExcellon.py parse_number().
// Careful: Excellon "LZ" means leading zeros are KEPT (trailing ones omitted), the opposite of Gerber's %FSL.

import { toInternal, type LengthUnit } from "@core/units/index";
import type { ExcellonFormat, ExcellonZeros } from "./types";

/** Digits most CAD tools use when the file does not say: 2.4 in inch, 3.3 in millimetres. */
export function defaultExcellonFormat(unit: LengthUnit, zeros: ExcellonZeros = "leading"): ExcellonFormat
{
    return unit === "in"
        ? { integerDigits: 2, decimalDigits: 4, zeros }
        : { integerDigits: 3, decimalDigits: 3, zeros };
}

/**
 * Decodes a coordinate ("012500", "-125", "1.25") into internal units; NaN when it is not a number.
 * With leading zeros kept, the integer part is the first integerDigits digits;
 * with trailing zeros kept, the decimal part is the last decimalDigits digits.
 */
export function decodeExcellonNumber(text: string, format: ExcellonFormat, unit: LengthUnit): number
{
    if (text.includes("."))
    {
        const value = Number(text);
        return text.length > 0 && Number.isFinite(value) ? toInternal(value, unit) : Number.NaN;
    }
    const match = /^([+-]?)(\d+)$/.exec(text);
    if (!match)
    {
        return Number.NaN;
    }
    const digits = match[2] as string;
    const value = format.zeros === "leading"
        ? Number(digits) / 10 ** (digits.length - format.integerDigits)
        : Number(digits) / 10 ** format.decimalDigits;
    return toInternal(match[1] === "-" ? -value : value, unit);
}

/**
 * Guesses which zeros are written from the coordinates of a file that does not declare it:
 * a number like "012500" can only come from a file keeping leading zeros.
 * Returns null when nothing can be concluded (only decimal numbers and zeros).
 */
export function guessZeros(numbers: readonly string[]): ExcellonZeros | null
{
    let integerNumbers = 0;
    for (const text of numbers)
    {
        const digits = text.replace(/^[+-]/, "");
        // Decimal numbers and zeros read the same with any convention
        if (digits.includes(".") || !/[1-9]/.test(digits))
        {
            continue;
        }
        integerNumbers++;
        if (digits.length > 1 && digits.startsWith("0"))
        {
            return "leading";
        }
    }
    return integerNumbers > 0 ? "trailing" : null;
}
