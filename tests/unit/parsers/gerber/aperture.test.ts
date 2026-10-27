import { describe, expect, it } from "vitest";
import { lexGerber } from "@parsers/gerber/lexer";
import {
    evaluateApertureMacro,
    evaluateExpression,
    MacroSyntaxError,
    parseApertureMacro,
    parseExpression,
    type ApertureMacro
} from "@parsers/gerber/macro";
import {
    apertureShape,
    macroShape,
    parseApertureDefinition,
    strokeWidth,
    type ApertureTemplate
} from "@parsers/gerber/aperture";
import { bboxOfPolygons, DEFAULT_ARC_TOLERANCE, totalArea, type Polygon } from "@core/geometry/index";
import { mmToInternal, toInternal } from "@core/units/index";

const MM = mmToInternal(1);
const NO_MACROS = new Map<string, ApertureMacro>();

function macroFrom(source: string): ApertureMacro
{
    const command = lexGerber(source).commands[0];
    if (command?.kind !== "extended")
    {
        throw new Error("Expected an extended command");
    }
    return parseApertureMacro(command.blocks);
}

function shape(template: ApertureTemplate): Polygon[]
{
    return apertureShape(template, NO_MACROS, { unit: "mm" }).polygons;
}

/** Area tolerance for shapes with rounded parts of total perimeter length perimeter. */
function expectArea(polygons: Polygon[], expectedMm2: number, roundPerimeterMm = 0): void
{
    const expected = expectedMm2 * MM * MM;
    const slack = roundPerimeterMm * MM * (DEFAULT_ARC_TOLERANCE + 1) + 10 * MM;
    expect(Math.abs(totalArea(polygons) - expected)).toBeLessThanOrEqual(slack);
}

describe("macro expressions", () =>
{
    const variables = new Map([[1, 2], [2, 10]]);

    it("follows arithmetic precedence with x as multiplication", () =>
    {
        expect(evaluateExpression(parseExpression("$1x2+$2/2"), variables)).toBe(9);
        expect(evaluateExpression(parseExpression("$1X3-1"), variables)).toBe(5);
        expect(evaluateExpression(parseExpression("-(1+2)x3"), variables)).toBe(-9);
        expect(evaluateExpression(parseExpression("+.5"), variables)).toBe(0.5);
        expect(evaluateExpression(parseExpression("--1"), variables)).toBe(1);
        expect(evaluateExpression(parseExpression("1e-1"), variables)).toBeCloseTo(0.1);
    });

    it("treats undefined variables and division by zero as 0", () =>
    {
        expect(evaluateExpression(parseExpression("$9+1"), variables)).toBe(1);
        expect(evaluateExpression(parseExpression("1/0"), variables)).toBe(0);
    });

    it("rejects invalid expressions", () =>
    {
        expect(() => parseExpression("1+")).toThrow(MacroSyntaxError);
        expect(() => parseExpression("(1+2")).toThrow(MacroSyntaxError);
        expect(() => parseExpression("1 2")).toThrow(MacroSyntaxError);
        expect(() => parseExpression("abc")).toThrow(MacroSyntaxError);
    });
});

describe("macro definitions", () =>
{
    it("parses comments, assignments and primitives", () =>
    {
        const macro = macroFrom("%AMTEST*0 comment, with commas*$3=$1+$2*1,1,$3,0,0*%");
        expect(macro.name).toBe("TEST");
        expect(macro.statements.map((statement) => statement.kind)).toEqual(["assignment", "primitive"]);
        expect(evaluateApertureMacro(macro, [1, 2])).toEqual([{ code: 1, modifiers: [1, 3, 0, 0] }]);
    });

    it("rejects unnamed macros and invalid primitives", () =>
    {
        expect(() => parseApertureMacro(["AM"])).toThrow(MacroSyntaxError);
        expect(() => parseApertureMacro(["AMX", "a,1"])).toThrow(MacroSyntaxError);
    });

    it("builds the KiCad RoundRect macro", () =>
    {
        const macro = macroFrom(`%AMRoundRect*
0 Rectangle with rounded corners*
4,1,4,$2,$3,$4,$5,$6,$7,$8,$9,$2,$3,0*
1,1,$1+$1,$2,$3*
1,1,$1+$1,$4,$5*
1,1,$1+$1,$6,$7*
1,1,$1+$1,$8,$9*
20,1,$1+$1,$2,$3,$4,$5,0*
20,1,$1+$1,$4,$5,$6,$7,0*
20,1,$1+$1,$6,$7,$8,$9,0*
20,1,$1+$1,$8,$9,$2,$3,0*%`);
        const result = macroShape(macro, [0.25, -0.5, -0.3, 0.5, -0.3, 0.5, 0.3, -0.5, 0.3], { unit: "mm" });
        expect(result.warnings).toEqual([]);
        expect(result.polygons).toHaveLength(1);
        // Rounded rectangle 1.5 x 1.1 mm with 0.25 mm corners
        expectArea(result.polygons, 1.5 * 1.1 - (4 - Math.PI) * 0.25 ** 2, 2 * Math.PI * 0.25);
        expect(bboxOfPolygons(result.polygons)).toEqual({ minX: -0.75 * MM, minY: -mmToInternal(0.55), maxX: 0.75 * MM, maxY: mmToInternal(0.55) });
    });

    it("erases with exposure off and rotates primitives", () =>
    {
        const donut = macroFrom("%AMDONUT*1,1,$1,0,0*1,0,$2,0,0*%");
        const ring = macroShape(donut, [2, 1], { unit: "mm" });
        expect(ring.polygons[0]?.holes).toHaveLength(1);
        expectArea(ring.polygons, Math.PI * (1 - 0.25), 3 * Math.PI);

        const line = macroFrom("%AMLINE*20,1,0.2,0,0,1,0,90*%");
        expect(bboxOfPolygons(macroShape(line, [], { unit: "mm" }).polygons))
            .toEqual({ minX: -0.1 * MM, minY: 0, maxX: 0.1 * MM, maxY: MM });
    });

    it("builds centre lines, lower-left lines, outlines and polygons", () =>
    {
        const macro = macroFrom("%AMALL*21,1,2,1,5,0,0*22,1,1,1,-5,-5,0*4,1,3,10,0,11,0,10,1,10,0,0*5,1,6,-10,0,2,0*%");
        const result = macroShape(macro, [], { unit: "mm" });
        expect(result.polygons).toHaveLength(4);
        const hexagon = 6 * (Math.sqrt(3) / 4) * 1 ** 2;
        expectArea(result.polygons, 2 + 1 + 0.5 + hexagon);
    });

    it("builds thermals and moirés", () =>
    {
        const thermal = macroFrom("%AMTH*7,0,0,2,1,0.2,45*%");
        const result = macroShape(thermal, [], { unit: "mm" });
        expect(result.polygons).toHaveLength(4);
        const annulus = Math.PI * (1 - 0.25);
        expectArea(result.polygons, annulus - 4 * 0.2 * 0.5, 3 * Math.PI);

        const moire = macroFrom("%AMMO*6,0,0,4,0.2,0.3,2,0.1,5,0*%");
        expect(macroShape(moire, [], { unit: "mm" }).polygons.length).toBeGreaterThan(0);
    });

    it("converts inch macros and reports unsupported content", () =>
    {
        const macro = macroFrom("%AMIN*21,1,0.1,0.1,0,0,0*9,1,2*4,1,3,0,0*5,1,2,0,0,1,0*%");
        const result = macroShape(macro, [], { unit: "in" });
        expect(totalArea(result.polygons)).toBe(toInternal(0.1, "in") ** 2);
        expect(result.warnings).toHaveLength(3);
    });
});

describe("standard apertures", () =>
{
    it("parses definitions in file units", () =>
    {
        expect(parseApertureDefinition("ADD10C,0.4", "mm")).toEqual(
            { code: 10, template: { kind: "circle", diameter: 0.4 * MM, hole: null } });
        expect(parseApertureDefinition("ADD11R,0.05X0.1X0.02", "in")).toEqual({
            code: 11,
            template: { kind: "rectangle", width: toInternal(0.05, "in"), height: toInternal(0.1, "in"),
                hole: { kind: "round", diameter: toInternal(0.02, "in") } }
        });
        expect(parseApertureDefinition("ADD12P,1X6X30", "mm")).toEqual({
            code: 12, template: { kind: "polygon", diameter: MM, vertices: 6, rotation: 30, hole: null }
        });
        expect(parseApertureDefinition("ADD13RoundRect,0.25X-0.5", "mm")).toEqual({
            code: 13, template: { kind: "macro", name: "RoundRect", parameters: [0.25, -0.5] }
        });
        expect(parseApertureDefinition("ADD14C,1X0.5X0.2", "mm")).toMatchObject({
            template: { hole: { kind: "rectangular", width: 0.5 * MM, height: 0.2 * MM } }
        });
        expect(parseApertureDefinition("ADD15MACRO", "mm")).toEqual(
            { code: 15, template: { kind: "macro", name: "MACRO", parameters: [] } });
    });

    it("reports invalid definitions", () =>
    {
        expect(parseApertureDefinition("ADDC,1", "mm")).toHaveProperty("error");
        expect(parseApertureDefinition("ADD10C,abc", "mm")).toHaveProperty("error");
    });

    it("builds circles, rectangles, obrounds and polygons", () =>
    {
        expectArea(shape({ kind: "circle", diameter: 2 * MM, hole: null }), Math.PI, 2 * Math.PI);
        expectArea(shape({ kind: "rectangle", width: 2 * MM, height: MM, hole: null }), 2);
        expectArea(shape({ kind: "obround", width: 3 * MM, height: MM, hole: null }), 2 + Math.PI / 4, Math.PI);
        expectArea(shape({ kind: "obround", width: MM, height: 3 * MM, hole: null }), 2 + Math.PI / 4, Math.PI);
        expectArea(shape({ kind: "obround", width: MM, height: MM, hole: null }), Math.PI / 4, Math.PI);
        expectArea(shape({ kind: "polygon", diameter: 2 * MM, vertices: 4, rotation: 0, hole: null }), 2);
    });

    it("keeps holes as part of the flash", () =>
    {
        const pad = shape({ kind: "rectangle", width: 2 * MM, height: 2 * MM, hole: { kind: "round", diameter: MM } });
        expect(pad[0]?.holes).toHaveLength(1);
        expectArea(pad, 4 - Math.PI / 4, Math.PI);
        const square = shape({ kind: "circle", diameter: 2 * MM, hole: { kind: "rectangular", width: MM, height: MM } });
        expectArea(square, Math.PI - 1, 2 * Math.PI);
    });

    it("ignores empty sizes and reports bad apertures", () =>
    {
        expect(shape({ kind: "circle", diameter: 0, hole: null })).toEqual([]);
        expect(shape({ kind: "rectangle", width: 0, height: MM, hole: null })).toEqual([]);
        expect(shape({ kind: "obround", width: MM, height: 0, hole: null })).toEqual([]);
        const triangle = apertureShape({ kind: "polygon", diameter: MM, vertices: 2, rotation: 0, hole: null }, NO_MACROS, { unit: "mm" });
        expect(triangle.warnings).toHaveLength(1);
        const missing = apertureShape({ kind: "macro", name: "NOPE", parameters: [] }, NO_MACROS, { unit: "mm" });
        expect(missing.warnings[0]).toContain("NOPE");
    });

    it("only strokes tracks with circles", () =>
    {
        expect(strokeWidth({ kind: "circle", diameter: 5, hole: null })).toBe(5);
        expect(strokeWidth({ kind: "rectangle", width: 5, height: 5, hole: null })).toBeNull();
    });
});
