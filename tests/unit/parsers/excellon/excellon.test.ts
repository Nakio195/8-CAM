import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    decodeExcellonNumber,
    defaultExcellonFormat,
    drillFromGerber,
    drillPolygons,
    drillSummary,
    guessZeros,
    looksLikeExcellon,
    parseExcellon,
    platingFromFileName,
    type DrillDocument
} from "@parsers/excellon/index";
import { buildGerberGeometry, parseGerber } from "@parsers/gerber/index";
import { differencePolygons, distance, geometryToSvg, totalArea, type Point } from "@core/geometry/index";
import { mmToInternal, toInternal } from "@core/units/index";

const MM = mmToInternal(1);
const FIXTURES = join(import.meta.dirname, "..", "..", "..", "fixtures");
const OUTPUT = join(import.meta.dirname, "..", "..", "..", "..", "test-output");

function fixture(name: string): string
{
    return readFileSync(join(FIXTURES, name), "utf8");
}

function codes(document: DrillDocument): string[]
{
    return document.warnings.map((warning) => warning.code);
}

function hitPoints(document: DrillDocument): Point[]
{
    return document.hits.map((hit) => hit.point);
}

describe("Excellon numbers", () =>
{
    it("decodes leading zeros kept (LZ), trailing zeros kept (TZ) and decimals", () =>
    {
        const lz = { integerDigits: 2, decimalDigits: 4, zeros: "leading" as const };
        const tz = { integerDigits: 2, decimalDigits: 4, zeros: "trailing" as const };
        expect(decodeExcellonNumber("010681", lz, "in")).toBe(toInternal(1.0681, "in"));
        // Trailing zeros dropped: "0125" is 01.25
        expect(decodeExcellonNumber("0125", lz, "in")).toBe(toInternal(1.25, "in"));
        expect(decodeExcellonNumber("3900", tz, "in")).toBe(toInternal(0.39, "in"));
        expect(decodeExcellonNumber("-125", tz, "in")).toBe(toInternal(-0.0125, "in"));
        expect(decodeExcellonNumber("12.7", tz, "mm")).toBe(mmToInternal(12.7));
        expect(decodeExcellonNumber("1.2.3", tz, "mm")).toBeNaN();
        expect(decodeExcellonNumber("abc", tz, "mm")).toBeNaN();
    });

    it("guesses zeros from the coordinates", () =>
    {
        expect(guessZeros(["012500", "-003000"])).toBe("leading");
        expect(guessZeros(["3900", "-1500"])).toBe("trailing");
        expect(guessZeros(["1.5", "2.0"])).toBeNull();
        expect(guessZeros(["0", "+0"])).toBeNull();
        expect(defaultExcellonFormat("mm")).toEqual({ integerDigits: 3, decimalDigits: 3, zeros: "leading" });
    });

    it("guesses plating from file names", () =>
    {
        expect(platingFromFileName("board-NPTH.drl")).toBe("nonPlated");
        expect(platingFromFileName("board-PTH.drl")).toBe("plated");
        expect(platingFromFileName("Drill TOP-BOT Plated.GBR")).toBe("plated");
        expect(platingFromFileName("NonPlated.txt")).toBe("nonPlated");
        expect(platingFromFileName("board.drl")).toBe("unknown");
    });
});

describe("Excellon files", () =>
{
    it("reads a KiCad file with decimal coordinates, attributes and routed oval holes", () =>
    {
        const document = parseExcellon(`M48
; DRILL file {KiCad 8.0.4} date 27/10/2026
; FORMAT={-:-/ absolute / metric / decimal}
;#@! TF.FileFunction,MixedPlating,1,2
FMAT,2
METRIC
;#@! TA.AperFunction,Plated,PTH,ComponentDrill
T1C0.800
;#@! TA.AperFunction,NonPlated,NPTH,ComponentDrill
T2C1.000
%
G90
G05
T1
X12.7Y-3.4
X15.24Y-3.4
T2
G00X10.0Y5.0
M15
G01X12.0Y5.0
M16
G05
X20.0Y20.0
M30
`, { fileName: "board.drl" });
        expect(document.warnings).toEqual([]);
        expect(document.unit).toBe("mm");
        expect(document.formatOrigin).toBe("declared");
        expect(document.tools.get(1)).toMatchObject({ diameter: 0.8 * MM, plating: "plated" });
        expect(document.tools.get(2)).toMatchObject({ diameter: MM, plating: "nonPlated" });
        expect(hitPoints(document)).toEqual([
            { x: 12.7 * MM, y: -3.4 * MM }, { x: 15.24 * MM, y: -3.4 * MM }, { x: 20 * MM, y: 20 * MM }
        ]);
        expect(document.slots).toEqual([{ tool: 2, path: [{ x: 10 * MM, y: 5 * MM }, { x: 12 * MM, y: 5 * MM }], line: 19 }]);
    });

    it("reads an Altium file with FILE_FORMAT and TYPE comments", () =>
    {
        const document = parseExcellon(`M48
;Layer_Color=9474304
;FILE_FORMAT=2:5
INCH,LZ
;TYPE=PLATED
T1F00S00C0.03543
;TYPE=NON_PLATED
T2F00S00C0.12500
%
T01
X0125Y-005
T02
X01Y01
M30`);
        expect(document.warnings).toEqual([]);
        expect(document.format).toEqual({ integerDigits: 2, decimalDigits: 5, zeros: "leading" });
        expect(document.tools.get(1)?.plating).toBe("plated");
        expect(document.tools.get(2)?.plating).toBe("nonPlated");
        expect(hitPoints(document)).toEqual([
            { x: toInternal(1.25, "in"), y: toInternal(-0.5, "in") },
            { x: toInternal(1, "in"), y: toInternal(1, "in") }
        ]);
    });

    it("guesses the zeros of an Eagle file without declaration", () =>
    {
        const document = parseExcellon("M48\n;GenerationSoftware,Autodesk,EAGLE\nINCH\nT1C0.0236\n%\nG90\nT1\nX3900Y1500\nX12000Y1500\nM30\n");
        expect(document.formatOrigin).toBe("guessed");
        expect(document.format?.zeros).toBe("trailing");
        expect(codes(document)).toEqual(["formatGuessed"]);
        expect(hitPoints(document)).toEqual([
            { x: toInternal(0.39, "in"), y: toInternal(0.15, "in") },
            { x: toInternal(1.2, "in"), y: toInternal(0.15, "in") }
        ]);
    });

    it("lets the user force the format", () =>
    {
        const source = "M48\nINCH\nT1C0.02\n%\nT1\nX3900Y1500\nM30\n";
        const document = parseExcellon(source, { force: { zeros: "leading", integerDigits: 2, decimalDigits: 4, unit: "in" } });
        expect(document.formatOrigin).toBe("forced");
        // Leading zeros kept: "3900" is 39.00 inch
        expect(hitPoints(document)[0]).toEqual({ x: toInternal(39, "in"), y: toInternal(15, "in") });
        const metric = parseExcellon(source, { force: { unit: "mm" } });
        expect(metric.unit).toBe("mm");
        expect(metric.tools.get(1)?.diameter).toBe(mmToInternal(0.02));
    });

    it("reads G85 drilled slots, repeats, incremental mode and G93 offsets", () =>
    {
        const document = parseExcellon(`M48
METRIC,TZ
T1C1.0
%
T1
X1.0Y1.0G85X3.0Y1.0
Y2.0G85Y4.0
X0Y0
R3X1.5
G91
X1.0Y1.0
G90
G93X10.0Y20.0
X1.0Y1.0
M30`);
        expect(codes(document)).toEqual([]);
        expect(document.slots.map((slot) => slot.path)).toEqual([
            [{ x: MM, y: MM }, { x: 3 * MM, y: MM }],
            [{ x: 3 * MM, y: 2 * MM }, { x: 3 * MM, y: 4 * MM }]
        ]);
        expect(hitPoints(document)).toEqual([
            { x: 0, y: 0 },
            { x: 1.5 * MM, y: 0 }, { x: 3 * MM, y: 0 }, { x: 4.5 * MM, y: 0 },
            { x: 5.5 * MM, y: MM },
            { x: 11 * MM, y: 21 * MM }
        ]);
    });

    it("discretises routed arcs given by radius or centre", () =>
    {
        const document = parseExcellon(`M48
METRIC
T1C1.0
%
T1
G00X2.0Y0
M15
G03X0Y2.0A2.0
G03X-2.0Y0I0J-2.0
M16
G00X0Y0
M15
G03X1.0Y0A-0.4
G02X5.0Y0
M17
M30`);
        const [arc, invalid] = document.slots;
        expect(arc?.path[0]).toEqual({ x: 2 * MM, y: 0 });
        expect(arc?.path[arc.path.length - 1]).toEqual({ x: -2 * MM, y: 0 });
        const radii = (arc?.path ?? []).map((point) => distance(point, { x: 0, y: 0 }));
        expect(Math.max(...radii.map((radius) => Math.abs(radius - 2 * MM)))).toBeLessThanOrEqual(60);
        expect(arc?.path.slice(1, -1).every((point) => point.y > 0)).toBe(true);
        expect(invalid?.path).toHaveLength(3);
        expect(codes(document)).toEqual(["invalidArc", "invalidArc"]);
    });

    it("chooses the longer arc for a negative radius", () =>
    {
        const document = parseExcellon("M48\nMETRIC\nT1C1.0\n%\nT1\nG00X1.0Y0\nM15\nG03X0Y1.0A-1.0\nM16\nM30\n");
        const path = document.slots[0]?.path ?? [];
        // The longer counter-clockwise arc turns around (1, 1) and passes through (2, 1)
        expect(path.some((point) => point.x > 1.99 * MM)).toBe(true);
    });

    it("reports problems with line numbers and never throws", () =>
    {
        const document = parseExcellon(`M48
T1
T2C-1
T3C0.5
%
X1.0Y1.0
T9
X1.0Y1.0
T0
X1.0Y1.0
T3
X1.2.3Y1
Q12
M97,TEXT
R2X1.0
G85
X1.0Y1.0G85
`);
        expect(document.warnings.map((warning) => [warning.code, warning.line])).toEqual([
            ["invalidTool", 2],
            ["invalidTool", 3],
            ["missingUnits", 4],
            ["formatGuessed", 6],
            ["noToolSelected", 6],
            ["undefinedTool", 7],
            ["invalidCoordinate", 12],
            ["unknownCommand", 13],
            ["unsupportedCommand", 14],
            ["invalidSlot", 16],
            ["invalidSlot", 17],
            ["missingEndOfFile", 18]
        ]);
        let seed = 7;
        const random = (): number =>
        {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed / 2147483648;
        };
        const alphabet = "XYTGMCRAIJ0123456789.-+;%\n";
        for (let run = 0; run < 50; run++)
        {
            let text = "";
            for (let i = 0; i < 300; i++)
            {
                text += alphabet[Math.floor(random() * alphabet.length)];
            }
            expect(() => drillPolygons(parseExcellon(text))).not.toThrow();
        }
    });

    it("tells Excellon from Gerber", () =>
    {
        expect(looksLikeExcellon("M48\nMETRIC\n")).toBe(true);
        expect(looksLikeExcellon("; comment\nINCH,TZ\n")).toBe(true);
        expect(looksLikeExcellon("T1C0.8\nX1Y1\n")).toBe(true);
        expect(looksLikeExcellon("%FSLAX46Y46*%\n%MOMM*%\nM48")).toBe(false);
        expect(looksLikeExcellon("hello")).toBe(false);
    });
});

describe("drill fixtures", () =>
{
    it("reads the FlatCAM Excellon example", () =>
    {
        const document = parseExcellon(fixture("flatcam/flatcam-test.drl"));
        expect(document.warnings).toEqual([]);
        expect(document.unit).toBe("in");
        expect(document.format).toEqual({ integerDigits: 2, decimalDigits: 4, zeros: "leading" });
        expect(drillSummary(document)).toEqual([
            { tool: 1, diameter: toInternal(0.022, "in"), hits: 8, slots: 0 },
            { tool: 2, diameter: toInternal(0.0354, "in"), hits: 8, slots: 0 }
        ]);
        expect(document.hits[0]?.point).toEqual({ x: toInternal(1.0681, "in"), y: toInternal(1.113, "in") });
    });

    it("converts the Proteus Gerber drill files", () =>
    {
        const plated = parseGerber(fixture("proteus/ftdi-max-drill-plated.gbr"));
        const document = drillFromGerber(plated, "FTDI_Max - CADCAM Drill TOP-BOT Plated.GBR");
        expect(document.warnings).toEqual([]);
        expect(document.source).toBe("gerber");
        expect(drillSummary(document).map((entry) => [entry.diameter / MM, entry.hits])).toEqual([
            [0.762, 3], [0.762, 9], [1.016, 27], [3, 2]
        ]);
        expect([...document.tools.values()].every((tool) => tool.plating === "plated")).toBe(true);

        const filled = drillFromGerber(parseGerber(fixture("proteus/ftdi-max-drill-filled-plated.gbr")));
        expect(filled.hits).toEqual([]);
        expect(filled.warnings).toEqual([]);
    });

    it("places every Proteus hole inside a copper pad", () =>
    {
        const copper = buildGerberGeometry(parseGerber(fixture("proteus/ftdi-max-bottom-copper.gbr"))).copper;
        const drills = drillFromGerber(parseGerber(fixture("proteus/ftdi-max-drill-plated.gbr")));
        const holes = drillPolygons(drills);
        // Nothing of the holes lies outside the copper: the two files share the same origin and units
        expect(totalArea(differencePolygons(holes, copper))).toBe(0);
        mkdirSync(OUTPUT, { recursive: true });
        writeFileSync(join(OUTPUT, "ftdi-max-copper-and-drills.svg"), geometryToSvg([
            { polygons: copper, fill: "#eb0a4b" },
            { polygons: holes, fill: "#ffe600" }
        ], { background: "#2a1727" }));
    });

    it("converts Gerber drill slots and ignores non circular apertures and regions", () =>
    {
        const gerber = parseGerber(`%TF.FileFunction,NonPlated,1,2,NPTH*%
%FSLAX26Y26*%
%MOMM*%
%ADD10C,1*%
%ADD11R,1X1*%
D10*
X0Y0D02*
X2000000Y0D01*
D11*
X0Y0D03*
G36*
X0Y0D02*
X1000000Y0D01*
X1000000Y1000000D01*
G37*
M02*`);
        const document = drillFromGerber(gerber);
        expect(document.tools.get(10)?.plating).toBe("nonPlated");
        expect(document.slots).toHaveLength(1);
        expect(document.hits).toHaveLength(0);
        expect(codes(document)).toEqual(["nonCircularAperture", "unsupportedCommand"]);
        expect(drillPolygons(document)).toHaveLength(1);
        expect(drillFromGerber(parseGerber("%FSLAX26Y26*%%MOMM*%%ADD10C,1*%M02*"), "x-NPTH.gbr").tools.get(10)?.plating).toBe("nonPlated");
    });
});
