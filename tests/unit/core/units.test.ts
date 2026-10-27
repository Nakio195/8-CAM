import { describe, expect, it } from "vitest";
import {
    assertInternalCoordinate,
    convertLength,
    fromInternal,
    inchToMm,
    INTERNAL_UNITS_PER_MM,
    internalToMm,
    isValidInternalCoordinate,
    MAX_INTERNAL_COORDINATE,
    mmToInch,
    mmToInternal,
    toInternal
} from "@core/units/index";

describe("units", () =>
{
    it("uses 10 nm internal units", () =>
    {
        expect(mmToInternal(1)).toBe(INTERNAL_UNITS_PER_MM);
        expect(mmToInternal(0.00001)).toBe(1);
        expect(internalToMm(250_000)).toBe(2.5);
    });

    it("rounds to the nearest internal unit", () =>
    {
        expect(mmToInternal(0.1 + 0.2)).toBe(30_000);
        expect(mmToInternal(0.000014)).toBe(1);
        expect(mmToInternal(-0.000016)).toBe(-2);
        expect(Number.isInteger(mmToInternal(1.2345678))).toBe(true);
    });

    it("converts inches exactly", () =>
    {
        expect(inchToMm(1)).toBe(25.4);
        expect(mmToInch(25.4)).toBe(1);
        expect(toInternal(0.1, "in")).toBe(254_000);
        expect(toInternal(1.6, "mm")).toBe(160_000);
        expect(fromInternal(254_000, "in")).toBeCloseTo(0.1, 12);
        expect(fromInternal(160_000, "mm")).toBe(1.6);
    });

    it("converts between units without rounding", () =>
    {
        expect(convertLength(2, "mm", "mm")).toBe(2);
        expect(convertLength(2, "in", "mm")).toBe(50.8);
        expect(convertLength(50.8, "mm", "in")).toBe(2);
    });

    it("keeps a round trip error below 1 µm (specification section 8)", () =>
    {
        for (const mm of [0.0001, 0.123456, 12.7, 99.99999, 1234.56789])
        {
            expect(Math.abs(internalToMm(mmToInternal(mm)) - mm)).toBeLessThan(0.001);
        }
    });

    it("validates the coordinate range", () =>
    {
        expect(isValidInternalCoordinate(0)).toBe(true);
        expect(isValidInternalCoordinate(MAX_INTERNAL_COORDINATE)).toBe(true);
        expect(isValidInternalCoordinate(-MAX_INTERNAL_COORDINATE - 1)).toBe(false);
        expect(isValidInternalCoordinate(1.5)).toBe(false);
        expect(isValidInternalCoordinate(Number.NaN)).toBe(false);
        expect(() => assertInternalCoordinate(12)).not.toThrow();
        expect(() => assertInternalCoordinate(0.5)).toThrow(RangeError);
    });
});
