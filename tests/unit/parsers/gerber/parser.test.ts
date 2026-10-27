import { describe, expect, it } from "vitest";
import { buildGerberGeometry, parseGerber, type GerberDocument, type GraphicObject } from "@parsers/gerber/index";
import { bboxOfPolygons, DEFAULT_ARC_TOLERANCE, distance, totalArea, type Point, type Polygon } from "@core/geometry/index";
import { mmToInternal, toInternal } from "@core/units/index";

const MM = mmToInternal(1);

/** Coordinate in the 2.6 mm format used by the test files. */
function c(mm: number): string
{
    return String(Math.round(mm * 1e6));
}

function gerber(body: string, header = "%FSLAX26Y26*%\n%MOMM*%\n"): string
{
    return `${header}${body}\nM02*\n`;
}

function copperOf(document: GerberDocument): Polygon[]
{
    return buildGerberGeometry(document).copper;
}

function areaMm2(polygons: Polygon[]): number
{
    return totalArea(polygons) / (MM * MM);
}

function kinds(objects: GraphicObject[]): string[]
{
    return objects.map((object) => object.kind);
}

describe("Gerber parser: basics", () =>
{
    it("reads flashes and tracks with their apertures", () =>
    {
        const document = parseGerber(gerber(`%ADD10C,0.5*%
%ADD11R,1X2*%
D11*
X${c(5)}Y${c(5)}D03*
D10*
X0Y0D02*
X${c(10)}Y0D01*`));
        expect(document.warnings).toEqual([]);
        expect(document.unit).toBe("mm");
        expect(kinds(document.objects)).toEqual(["flash", "track"]);
        const flash = document.objects[0];
        expect(flash?.kind === "flash" && flash.point).toEqual({ x: 5 * MM, y: 5 * MM });
        expect(areaMm2(copperOf(document))).toBeCloseTo(2 + 10 * 0.5 + Math.PI * 0.25 ** 2, 2);
    });

    it("merges consecutive draws into one track and splits on D02 or aperture change", () =>
    {
        const document = parseGerber(gerber(`%ADD10C,0.2*%
%ADD11C,0.3*%
D10*
X0Y0D02*
X${c(1)}Y0D01*
X${c(1)}Y${c(1)}D01*
X${c(5)}Y${c(5)}D02*
X${c(6)}D01*
D11*
X${c(7)}D01*`));
        const tracks = document.objects.filter((object) => object.kind === "track");
        expect(tracks).toHaveLength(3);
        expect(tracks[0]?.kind === "track" && tracks[0].path).toHaveLength(3);
        expect(tracks[2]?.kind === "track" && tracks[2].aperture).toBe(11);
    });

    it("keeps the current point for missing coordinates", () =>
    {
        const document = parseGerber(gerber(`%ADD10C,0.2*%
D10*
X${c(1)}Y${c(2)}D02*
X${c(3)}D01*
Y${c(4)}D01*`));
        const track = document.objects[0];
        expect(track?.kind === "track" && track.path).toEqual([
            { x: MM, y: 2 * MM }, { x: 3 * MM, y: 2 * MM }, { x: 3 * MM, y: 4 * MM }
        ]);
    });

    it("decodes incremental and trailing zero formats", () =>
    {
        const incremental = parseGerber(gerber("%ADD10C,0.1*%\nD10*\nX1000000Y1000000D03*\nX1000000D03*",
            "%FSLIX26Y26*%\n%MOMM*%\n"));
        const points = incremental.objects.map((object) => object.kind === "flash" ? object.point : null);
        expect(points).toEqual([{ x: MM, y: MM }, { x: 2 * MM, y: MM }]);

        const trailing = parseGerber(gerber("%ADD10C,0.01*%\nD10*\nX15Y-0125D03*", "%FSTAX24Y24*%\n%MOIN*%\n"));
        const flash = trailing.objects[0];
        expect(flash?.kind === "flash" && flash.point).toEqual({ x: toInternal(15, "in"), y: toInternal(-1.25, "in") });
    });
});

describe("Gerber parser: arcs", () =>
{
    function arcTrack(body: string): Point[]
    {
        const document = parseGerber(gerber(`%ADD10C,0.1*%\nD10*\n${body}`));
        const track = document.objects.find((object) => object.kind === "track");
        return track?.kind === "track" ? track.path : [];
    }

    function maxRadiusError(path: Point[], center: Point, radius: number): number
    {
        return Math.max(...path.map((point) => Math.abs(distance(point, center) - radius)));
    }

    it("draws multi quadrant arcs with signed centre offsets", () =>
    {
        // Counter-clockwise half circle from (2, 0) to (-2, 0) around the origin
        const path = arcTrack(`G75*\nX${c(2)}Y0D02*\nG03X${c(-2)}Y0I${c(-2)}J0D01*`);
        expect(path[0]).toEqual({ x: 2 * MM, y: 0 });
        expect(path[path.length - 1]).toEqual({ x: -2 * MM, y: 0 });
        expect(path.every((point) => point.y >= 0)).toBe(true);
        expect(maxRadiusError(path, { x: 0, y: 0 }, 2 * MM)).toBeLessThanOrEqual(1);
    });

    it("draws full circles when start and end coincide in G75", () =>
    {
        const path = arcTrack(`G75*\nX${c(1)}Y0D02*\nG02X${c(1)}Y0I${c(-1)}J0D01*`);
        expect(path.length).toBeGreaterThan(20);
        expect(Math.min(...path.map((point) => point.x))).toBeLessThan(-0.99 * MM);
    });

    it("finds the centre of single quadrant arcs", () =>
    {
        // Clockwise quarter from (0, 1) to (1, 0) around the origin, unsigned offsets
        const path = arcTrack(`G74*\nX0Y${c(1)}D02*\nG02X${c(1)}Y0I0J${c(1)}D01*`);
        expect(maxRadiusError(path, { x: 0, y: 0 }, MM)).toBeLessThanOrEqual(DEFAULT_ARC_TOLERANCE);
        expect(path.length).toBeGreaterThan(3);
    });

    it("warns about arcs without quadrant mode and impossible single quadrant arcs", () =>
    {
        const document = parseGerber(gerber(`%ADD10C,0.1*%\nD10*\nX${c(1)}Y0D02*\nG03X0Y${c(1)}I${c(-1)}J0D01*`));
        expect(document.warnings.map((warning) => warning.code)).toEqual(["noQuadrantMode"]);

        const impossible = parseGerber(gerber(`%ADD10C,0.1*%\nD10*\nG74*\nX${c(1)}Y0D02*\nG03X${c(-1)}Y0I${c(1)}J0D01*`));
        expect(impossible.warnings.map((warning) => warning.code)).toEqual(["invalidArc"]);
    });
});

describe("Gerber parser: regions", () =>
{
    it("builds regions with several contours and arcs", () =>
    {
        const document = parseGerber(gerber(`G36*
X0Y0D02*
X${c(2)}Y0D01*
X${c(2)}Y${c(2)}D01*
X0Y${c(2)}D01*
X0Y0D01*
X${c(5)}Y0D02*
G75*
G03X${c(5)}Y0I${c(1)}J0D01*
G01*
G37*`));
        expect(kinds(document.objects)).toEqual(["region"]);
        const region = document.objects[0];
        expect(region?.kind === "region" && region.contours).toHaveLength(2);
        expect(areaMm2(copperOf(document))).toBeCloseTo(4 + Math.PI, 2);
    });

    it("makes holes with cut-in contours", () =>
    {
        // Outer square 0..4, hole 1..3 reached through a zero width cut-in along y = 0..1
        const document = parseGerber(gerber(`G36*
X0Y0D02*
X${c(2)}Y0D01*
X${c(2)}Y${c(1)}D01*
X${c(1)}Y${c(1)}D01*
X${c(1)}Y${c(3)}D01*
X${c(3)}Y${c(3)}D01*
X${c(3)}Y${c(1)}D01*
X${c(2)}Y${c(1)}D01*
X${c(2)}Y0D01*
X${c(4)}Y0D01*
X${c(4)}Y${c(4)}D01*
X0Y${c(4)}D01*
X0Y0D01*
G37*`));
        const copper = copperOf(document);
        expect(copper).toHaveLength(1);
        expect(copper[0]?.holes).toHaveLength(1);
        expect(areaMm2(copper)).toBeCloseTo(12, 6);
    });

    it("reports invalid region content", () =>
    {
        const document = parseGerber(gerber(`%ADD10C,0.1*%\nD10*\nG36*\nX0Y0D02*\nX${c(1)}Y0D03*\nX${c(1)}Y0D01*\nG37*\nG37*`));
        expect(document.warnings.map((warning) => warning.code)).toEqual(["flashInRegion", "invalidRegion", "invalidRegion"]);
        expect(document.objects).toEqual([]);
    });

    it("closes a region left open at the end of the file", () =>
    {
        const document = parseGerber(`%FSLAX26Y26*%%MOMM*%G36*X0Y0D02*X${c(1)}Y0D01*X${c(1)}Y${c(1)}D01*X0Y0D01*`);
        expect(kinds(document.objects)).toEqual(["region"]);
        expect(document.warnings.map((warning) => warning.code)).toEqual(["invalidRegion", "missingEndOfFile"]);
    });
});

describe("Gerber parser: polarity and step and repeat", () =>
{
    it("subtracts clear objects in file order", () =>
    {
        const document = parseGerber(gerber(`%ADD10R,4X4*%
%ADD11R,2X2*%
%ADD12R,1X1*%
%LPD*%
D10*
X0Y0D03*
%LPC*%
D11*
X0Y0D03*
%LPD*%
D12*
X0Y0D03*`));
        expect(document.objects.map((object) => object.polarity)).toEqual(["dark", "clear", "dark"]);
        const copper = copperOf(document);
        // Square with a hole, and an island inside the hole
        expect(copper).toHaveLength(2);
        expect(areaMm2(copper)).toBeCloseTo(16 - 4 + 1, 6);
    });

    it("ignores clear objects on an empty image", () =>
    {
        const document = parseGerber(gerber("%ADD10C,1*%\n%LPC*%\nD10*\nX0Y0D03*"));
        expect(copperOf(document)).toEqual([]);
    });

    it("repeats blocks and keeps their polarity order", () =>
    {
        const document = parseGerber(gerber(`%ADD10R,1X1*%
%ADD11C,0.5*%
%SRX3Y2I2.5J4*%
D10*
X0Y0D03*
%LPC*%
D11*
X0Y0D03*
%LPD*%
%SR*%
D10*
X${c(20)}Y0D03*`));
        expect(document.objects).toHaveLength(13);
        const flashes = document.objects.filter((object) => object.kind === "flash" && object.polarity === "dark");
        const points = flashes.map((object) => object.kind === "flash" ? object.point : null);
        expect(points).toContainEqual({ x: 5 * MM, y: 4 * MM });
        expect(points).toContainEqual({ x: 20 * MM, y: 0 });
        expect(areaMm2(copperOf(document))).toBeCloseTo(7 - 6 * Math.PI * 0.0625, 2);
    });

    it("closes a step and repeat block left open and rejects invalid ones", () =>
    {
        const open = parseGerber(gerber("%ADD10C,1*%\n%SRX2Y1I5J0*%\nD10*\nX0Y0D03*"));
        expect(open.objects).toHaveLength(2);
        const invalid = parseGerber(gerber("%SRX0Y1I5J0*%\n%SRXAY*%"));
        expect(invalid.warnings.map((warning) => warning.code)).toEqual(["invalidStepRepeat", "invalidStepRepeat"]);
    });
});

describe("Gerber parser: apertures in tracks and transforms", () =>
{
    it("sweeps rectangular apertures along segments", () =>
    {
        const document = parseGerber(gerber(`%ADD10R,1X0.5*%\nD10*\nX0Y0D02*\nX${c(10)}Y0D01*`));
        expect(areaMm2(copperOf(document))).toBeCloseTo(11 * 0.5, 6);
    });

    it("flashes macro apertures and draws zero length tracks as a flash", () =>
    {
        const document = parseGerber(gerber(`%AMBOX*21,1,$1,$2,0,0,0*%
%ADD10BOX,2X1*%
%ADD11R,1X1*%
D10*
X0Y0D03*
D11*
X${c(10)}Y0D02*
X${c(10)}Y0D01*`));
        const copper = copperOf(document);
        expect(areaMm2(copper)).toBeCloseTo(3, 6);
    });

    it("applies aperture mirroring, rotation and scaling to flashes", () =>
    {
        const document = parseGerber(gerber(`%ADD10R,2X1*%
D10*
%LR90*%
X0Y0D03*
%LR0*%
%LS2*%
X${c(10)}Y0D03*
%LS1*%
%LMXY*%
X${c(20)}Y0D03*`));
        const shapes = buildGerberGeometry(document).copper.map((polygon) => bboxOfPolygons([polygon]));
        const sizes = shapes.map((box) => [(box.maxX - box.minX) / MM, (box.maxY - box.minY) / MM]);
        expect(sizes).toContainEqual([1, 2]);
        expect(sizes).toContainEqual([4, 2]);
        expect(sizes).toContainEqual([2, 1]);
    });

    it("scales circular track widths", () =>
    {
        const document = parseGerber(gerber(`%ADD10C,0.1*%\n%LS2*%\nD10*\nX0Y0D02*\nX${c(10)}Y0D01*`));
        expect(areaMm2(copperOf(document))).toBeCloseTo(10 * 0.2 + Math.PI * 0.01, 3);
    });

    it("rejects invalid transforms", () =>
    {
        const document = parseGerber(gerber("%LMZ*%\n%LRabc*%\n%LS0*%"));
        expect(document.warnings.map((warning) => warning.code)).toEqual(["unknownCommand", "unknownCommand", "unknownCommand"]);
    });
});

describe("Gerber parser: X2 attributes", () =>
{
    it("keeps file, aperture and object attributes", () =>
    {
        const document = parseGerber(gerber(`%TF.FileFunction,Copper,L2,Bot*%
%TF.ProjectId,My Board,1234*%
%TA.AperFunction,SMDPad,CuDef*%
%ADD10C,1*%
%TD.AperFunction*%
%ADD11C,0.2*%
%TO.N,GND*%
%TO.C,R1*%
D10*
X0Y0D03*
%TD.C*%
X${c(5)}Y0D03*
%TD*%
D11*
X0Y0D02*
X${c(1)}Y0D01*`));
        expect(document.warnings).toEqual([]);
        expect(document.fileAttributes[".FileFunction"]).toEqual(["Copper", "L2", "Bot"]);
        expect(document.fileAttributes[".ProjectId"]).toEqual(["My Board", "1234"]);
        expect(document.apertures.get(10)?.attributes).toEqual({ ".AperFunction": ["SMDPad", "CuDef"] });
        expect(document.apertures.get(11)?.attributes).toEqual({});
        expect(document.objects.map((object) => object.attributes)).toEqual([
            { ".N": ["GND"], ".C": ["R1"] },
            { ".N": ["GND"] },
            {}
        ]);
    });

    it("reports attributes without names and unknown attribute commands", () =>
    {
        const document = parseGerber(gerber("%TF*%\n%TX.Foo*%"));
        expect(document.warnings.map((warning) => warning.code)).toEqual(["invalidAttribute", "unknownCommand"]);
    });
});

describe("Gerber parser: obsolete commands and errors", () =>
{
    it("reads the FlatCAM / Eagle style with G54, D1 / D2 and G70 / G71", () =>
    {
        const document = parseGerber("G04 old style*\nG71*\n%FSLAX53Y53*%\n%ADD13C,0.8*%\nG90*\nG54D13*\nX20779Y24462D2*\nY27002D1*\nX18229D1*\nM02*\n");
        expect(document.unit).toBe("mm");
        expect(document.warnings).toEqual([]);
        const track = document.objects[0];
        expect(track?.kind === "track" && track.path).toHaveLength(3);
    });

    it("repeats the previous operation for coordinates alone", () =>
    {
        const document = parseGerber(gerber(`%ADD10C,1*%\nD10*\nX0Y0D03*\nX${c(5)}Y0*\nX${c(9)}Y0*`));
        expect(kinds(document.objects)).toEqual(["flash", "flash", "flash"]);
        expect(document.warnings.map((warning) => warning.code)).toEqual(["deprecatedCommand"]);
    });

    it("assumes defaults when units and format are missing", () =>
    {
        const document = parseGerber("%ADD10C,0.01*%\nD10*\nX15000Y0D03*\nM02*\n");
        expect(document.unit).toBe("in");
        expect(document.warnings.map((warning) => warning.code)).toEqual(["missingUnits", "missingFormat"]);
        const flash = document.objects[0];
        expect(flash?.kind === "flash" && flash.point.x).toBe(toInternal(1.5, "in"));
    });

    it("reports problems with their line numbers and never throws", () =>
    {
        const document = parseGerber(`%FSLAX26Y26*%
%MOMM*%
%ADD10C,abc*%
%ADD11UNKNOWN*%
%AMBAD*1,(1*%
D99*
X0Y0D03*
Q123*
X1.2.3Y0D01*
G04 comment*
%FSXX*%
%MOCM*%
%LPX*%
%IPNEG*%
%ABD12*%
%OFA0B0*%
%XX*%
G99*
M05*
D07*
M00*
G10*
%G04 comment*%
%IPPOS*%
M02*
D10*
`);
        const codes = document.warnings.map((warning) => [warning.code, warning.line]);
        expect(codes).toEqual([
            ["invalidAperture", 3],
            ["invalidAperture", 4],
            ["invalidMacro", 5],
            ["undefinedAperture", 6],
            ["unknownCommand", 8],
            ["invalidCoordinate", 9],
            ["invalidFormat", 11],
            ["invalidFormat", 12],
            ["unknownCommand", 13],
            ["negativeImage", 14],
            ["unsupportedCommand", 15],
            ["deprecatedCommand", 16],
            ["unknownCommand", 17],
            ["unsupportedCommand", 18],
            ["unsupportedCommand", 19],
            ["unknownCommand", 20],
            ["deprecatedCommand", 21],
            ["contentAfterEndOfFile", 26]
        ]);
        expect(document.imagePolarity).toBe("negative");
        const geometry = buildGerberGeometry(document);
        expect(geometry.warnings.map((warning) => warning.code)).toEqual(["apertureShape"]);
    });

    it("ignores operations before any aperture and unterminated commands", () =>
    {
        const document = parseGerber("%FSLAX26Y26*%%MOMM*%X0Y0D03*X1Y1D03*X5");
        expect(document.objects).toEqual([]);
        expect(document.warnings.map((warning) => warning.code)).toEqual(
            ["noApertureSelected", "unterminatedCommand", "missingEndOfFile"]);
    });

    it("survives random content", () =>
    {
        let seed = 42;
        const random = (): number =>
        {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed / 2147483648;
        };
        const alphabet = "%*XYIJDGM0123456789+-.,AFSLTRCOP$\n ";
        for (let run = 0; run < 50; run++)
        {
            let text = "";
            for (let i = 0; i < 400; i++)
            {
                text += alphabet[Math.floor(random() * alphabet.length)];
            }
            expect(() => buildGerberGeometry(parseGerber(text))).not.toThrow();
        }
    });

    it("reports progress", () =>
    {
        const fractions: number[] = [];
        const document = parseGerber(gerber("%ADD10C,1*%\nD10*\nX0Y0D03*"), { onProgress: (fraction) => fractions.push(fraction) });
        buildGerberGeometry(document, { onProgress: (fraction) => fractions.push(fraction) });
        expect(fractions[0]).toBe(0);
        expect(fractions.filter((fraction) => fraction === 1)).toHaveLength(2);
    });
});
