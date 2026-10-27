// Conversions between millimetres, inches and internal integer units.
//
// All geometry is stored in integer internal units so that Clipper2 works on exact coordinates
// (docs/architecture.md section 2.1). Conversion to millimetres only happens at the boundaries:
// import, display and G-code export.

export type LengthUnit = "mm" | "in";

/** One internal unit is 10 nm: 100 000 units per millimetre. */
export const INTERNAL_UNITS_PER_MM = 100_000;

export const MM_PER_INCH = 25.4;

/**
 * Largest coordinate accepted by the geometry core, in internal units (10 m).
 * clipper2-ts requires coordinates and their intermediate products to stay within the safe integer range.
 */
export const MAX_INTERNAL_COORDINATE = 10_000 * INTERNAL_UNITS_PER_MM;

export function mmToInternal(mm: number): number
{
    return Math.round(mm * INTERNAL_UNITS_PER_MM);
}

export function internalToMm(value: number): number
{
    return value / INTERNAL_UNITS_PER_MM;
}

export function inchToMm(inch: number): number
{
    return inch * MM_PER_INCH;
}

export function mmToInch(mm: number): number
{
    return mm / MM_PER_INCH;
}

/** Converts a length expressed in the given unit to internal units. */
export function toInternal(value: number, unit: LengthUnit): number
{
    return mmToInternal(unit === "in" ? inchToMm(value) : value);
}

/** Converts internal units to a length expressed in the given unit. */
export function fromInternal(value: number, unit: LengthUnit): number
{
    const mm = internalToMm(value);
    return unit === "in" ? mmToInch(mm) : mm;
}

/** Converts a length between two units without going through internal units (no rounding). */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number
{
    if (from === to)
    {
        return value;
    }
    return from === "in" ? inchToMm(value) : mmToInch(value);
}

export function isValidInternalCoordinate(value: number): boolean
{
    return Number.isSafeInteger(value) && Math.abs(value) <= MAX_INTERNAL_COORDINATE;
}

/** Throws a RangeError when a coordinate is not an integer or lies outside the supported range. */
export function assertInternalCoordinate(value: number): void
{
    if (!isValidInternalCoordinate(value))
    {
        throw new RangeError(`Internal coordinate out of range or not an integer: ${value}`);
    }
}
