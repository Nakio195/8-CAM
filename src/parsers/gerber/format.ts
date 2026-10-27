// Coordinate format (%FS) and coordinate number decoding.
// Reference: FlatCAM appParsers/ParseGerber.py fmt_re and parse_gerber_number().

import { toInternal, type LengthUnit } from "@core/units/index";

export type ZeroOmission = "leading" | "trailing";
export type CoordinateNotation = "absolute" | "incremental";

export interface CoordinateFormat
{
    zeroOmission: ZeroOmission;
    notation: CoordinateNotation;
    integerDigits: number;
    decimalDigits: number;
}

// "FSLAX46Y46", also tolerating the old N/G/D/M sequence fields and missing zero / notation letters
const FORMAT_RE = /^FS([LTD])?([AI])?(?:N\d+)?(?:G\d+)?(?:D\d+)?(?:M\d+)?X(\d)(\d)Y(\d)(\d)/;

/** Parses the body of a %FS command, or returns null when it cannot be read. */
export function parseFormatSpecification(block: string): CoordinateFormat | null
{
    const match = FORMAT_RE.exec(block);
    if (!match)
    {
        return null;
    }
    return {
        // "D" (explicit decimal point, obsolete) behaves like leading zero omission for plain integers
        zeroOmission: match[1] === "T" ? "trailing" : "leading",
        notation: match[2] === "I" ? "incremental" : "absolute",
        integerDigits: Number(match[3]),
        decimalDigits: Number(match[4])
    };
}

/** Fallback when a file has no %FS command, chosen by unit like most CAD tools: 2.4 in inch, 3.3 in mm. */
export function defaultFormat(unit: LengthUnit): CoordinateFormat
{
    return {
        zeroOmission: "leading",
        notation: "absolute",
        integerDigits: unit === "in" ? 2 : 3,
        decimalDigits: unit === "in" ? 4 : 3
    };
}

/**
 * Decodes a coordinate value ("-12345", "+0045", "1.25") into internal units.
 * Returns NaN when the text is not a number.
 */
export function decodeCoordinate(text: string, format: CoordinateFormat, unit: LengthUnit): number
{
    if (text.includes("."))
    {
        // Some generators write decimal numbers despite the format specification
        const value = Number(text);
        return Number.isFinite(value) ? toInternal(value, unit) : Number.NaN;
    }
    const match = /^([+-]?)(\d+)$/.exec(text);
    if (!match)
    {
        return Number.NaN;
    }
    let digits = match[2] as string;
    if (format.zeroOmission === "trailing")
    {
        digits = digits.padEnd(format.integerDigits + format.decimalDigits, "0");
    }
    const value = Number(digits) / 10 ** format.decimalDigits;
    return toInternal(match[1] === "-" ? -value : value, unit);
}

/** Decodes a decimal number in file units (aperture sizes, step and repeat distances). */
export function decodeLength(text: string, unit: LengthUnit): number
{
    const value = Number(text);
    return Number.isFinite(value) ? toInternal(value, unit) : Number.NaN;
}
