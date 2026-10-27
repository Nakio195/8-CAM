import { describe, expect, it } from "vitest";
import { lexGerber } from "@parsers/gerber/lexer";
import { decodeCoordinate, decodeLength, defaultFormat, parseFormatSpecification } from "@parsers/gerber/format";
import { mmToInternal, toInternal } from "@core/units/index";

describe("Gerber lexer", () =>
{
    it("splits word and extended commands with their line numbers", () =>
    {
        const { commands, unterminated } = lexGerber("%FSLAX46Y46*%\r\n%MOMM*%\nG04 Hello world *\nD10*\nX100Y-200D01*\nM02*\n");
        expect(unterminated).toBeNull();
        expect(commands).toEqual([
            { kind: "extended", blocks: ["FSLAX46Y46"], line: 1 },
            { kind: "extended", blocks: ["MOMM"], line: 2 },
            { kind: "word", text: "G04 Hello world", line: 3 },
            { kind: "word", text: "D10", line: 4 },
            { kind: "word", text: "X100Y-200D01", line: 5 },
            { kind: "word", text: "M02", line: 6 }
        ]);
    });

    it("keeps multi-block extended commands and multi-line macros", () =>
    {
        const { commands } = lexGerber("%AMDONUT*\n1,1,$1,0,0*\n1,0,$2,0,0*%\n%FSLAX24Y24*MOIN*%");
        expect(commands[0]).toEqual({ kind: "extended", blocks: ["AMDONUT", "1,1,$1,0,0", "1,0,$2,0,0"], line: 1 });
        expect(commands[1]).toEqual({ kind: "extended", blocks: ["FSLAX24Y24", "MOIN"], line: 4 });
    });

    it("accepts several commands on one line and commands across lines", () =>
    {
        const { commands } = lexGerber("G01*X1Y1D02*X\n2Y2D01*");
        expect(commands.map((command) => command.kind === "word" ? command.text : "")).toEqual(
            ["G01", "X1Y1D02", "X2Y2D01"]);
        expect(commands[2]?.line).toBe(1);
    });

    it("keeps a last block without star before the closing percent", () =>
    {
        expect(lexGerber("%MOMM%").commands[0]).toEqual({ kind: "extended", blocks: ["MOMM"], line: 1 });
    });

    it("reports unterminated text", () =>
    {
        expect(lexGerber("D10*\nX1Y1D01").unterminated).toEqual({ text: "X1Y1D01", line: 2 });
        expect(lexGerber("%ADD10C,0.1*").unterminated).toEqual({ text: "ADD10C,0.1*", line: 1 });
        expect(lexGerber("   \n").unterminated).toBeNull();
    });

    it("ignores empty blocks", () =>
    {
        expect(lexGerber("**%%\n*").commands).toEqual([]);
    });
});

describe("coordinate format", () =>
{
    it("parses format specifications", () =>
    {
        expect(parseFormatSpecification("FSLAX46Y46")).toEqual(
            { zeroOmission: "leading", notation: "absolute", integerDigits: 4, decimalDigits: 6 });
        expect(parseFormatSpecification("FSTIX25Y25")).toEqual(
            { zeroOmission: "trailing", notation: "incremental", integerDigits: 2, decimalDigits: 5 });
        expect(parseFormatSpecification("FSLAN2X34Y34")?.decimalDigits).toBe(4);
        expect(parseFormatSpecification("FSAX24Y24")?.zeroOmission).toBe("leading");
        expect(parseFormatSpecification("FSLA")).toBeNull();
    });

    it("provides a default format per unit", () =>
    {
        expect(defaultFormat("in").decimalDigits).toBe(4);
        expect(defaultFormat("mm").decimalDigits).toBe(3);
    });

    it("decodes leading zero omission", () =>
    {
        const format = parseFormatSpecification("FSLAX45Y45");
        expect(format).not.toBeNull();
        if (format)
        {
            expect(decodeCoordinate("+452500", format, "mm")).toBe(mmToInternal(4.525));
            // 5 decimals: one unit of the last digit is 0.01 µm, one internal unit
            expect(decodeCoordinate("-1", format, "mm")).toBe(-1);
            expect(decodeCoordinate("0", format, "mm")).toBe(0);
        }
    });

    it("decodes trailing zero omission", () =>
    {
        const format = parseFormatSpecification("FSTAX24Y24");
        expect(format).not.toBeNull();
        if (format)
        {
            // "15" means 15.0000 inch with 2 integer digits, 4 decimals
            expect(decodeCoordinate("15", format, "in")).toBe(toInternal(15, "in"));
            expect(decodeCoordinate("-0125", format, "in")).toBe(toInternal(-1.25, "in"));
        }
    });

    it("decodes decimal numbers and rejects garbage", () =>
    {
        const format = defaultFormat("mm");
        expect(decodeCoordinate("1.5", format, "mm")).toBe(mmToInternal(1.5));
        expect(decodeCoordinate("1.2.3", format, "mm")).toBeNaN();
        expect(decodeCoordinate("12a", format, "mm")).toBeNaN();
        expect(decodeLength("0.254", "mm")).toBe(mmToInternal(0.254));
        expect(decodeLength("0.01", "in")).toBe(toInternal(0.01, "in"));
        expect(decodeLength("abc", "mm")).toBeNaN();
    });
});
