// Real files: parsing, layer detection, comparison with FlatCAM Plus and SVG check renders.
// The SVG files are written to test-output/ (not versioned) for a visual check.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGerberGeometry, detectLayerType, parseGerber } from "@parsers/gerber/index";
import { distanceToRings, geometryToSvg, polygonRings, type SvgLayer } from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";
import { flatcamCutPaths } from "../../../helpers/flatcam";

const FIXTURES = join(import.meta.dirname, "..", "..", "..", "fixtures");
const OUTPUT = join(import.meta.dirname, "..", "..", "..", "..", "test-output");

function fixture(name: string): string
{
    return readFileSync(join(FIXTURES, name), "utf8");
}

function writeSvg(name: string, layers: SvgLayer[]): void
{
    mkdirSync(OUTPUT, { recursive: true });
    writeFileSync(join(OUTPUT, name), geometryToSvg(layers, { margin: 1, background: "#2a1727" }));
}

describe("Proteus FTDI_Max bottom copper", () =>
{
    const document = parseGerber(fixture("proteus/ftdi-max-bottom-copper.gbr"));
    const copper = buildGerberGeometry(document).copper;

    it("parses without warnings", () =>
    {
        expect(document.warnings).toEqual([]);
        expect(document.unit).toBe("mm");
        expect(document.objects).toHaveLength(96);
        expect(document.apertures.size).toBe(9);
        expect(copper.length).toBeGreaterThan(30);
    });

    it("detects the bottom copper layer from X2 attributes", () =>
    {
        expect(detectLayerType(document.fileAttributes, "FTDI_Max - CADCAM Bottom Copper.GBR"))
            .toEqual({ kind: "copper", side: "bottom", source: "x2" });
        expect(document.apertures.get(13)?.attributes[".AperFunction"]).toEqual(["SMDPad", "CuDef"]);
    });

    it("matches the copper used by FlatCAM Plus for its isolation G-code", () =>
    {
        // First depth pass of the FlatCAM job (Z -0.1, tool 0.2072 mm)
        const cuts = flatcamCutPaths(fixture("proteus/ftdi-max-bottom-copper.flatcam-iso.cnc"), -0.15);
        const points = cuts.flat();
        expect(points.length).toBeGreaterThan(1000);
        const rings = polygonRings(copper);
        const distances = points.map((point) => distanceToRings(point, rings));
        const minimum = Math.min(...distances);
        const maximum = Math.max(...distances);
        // Every FlatCAM path point lies at the same distance from our copper: the geometries are equivalent.
        // The measured distance (0.1536 mm) is the tool radius 0.1036 mm plus 0.05 mm set in the FlatCAM job.
        expect(maximum - minimum).toBeLessThan(mmToInternal(0.002));
        expect(minimum).toBeGreaterThan(mmToInternal(0.1525));
        expect(maximum).toBeLessThan(mmToInternal(0.1545));

        writeSvg("ftdi-max-bottom-copper.svg", [
            { polygons: copper, fill: "#eb0a4b" },
            { polylines: cuts, stroke: "#1ebe96", strokeWidth: 0.03 }
        ]);
    });
});

describe("FlatCAM sample file", () =>
{
    it("parses the old style FlatCAM export", () =>
    {
        const document = parseGerber(fixture("flatcam/flatcam-test.gbr"));
        // %IN and %LN are obsolete and reported, nothing else
        expect(document.warnings.map((warning) => warning.code)).toEqual(["deprecatedCommand", "deprecatedCommand"]);
        const copper = buildGerberGeometry(document).copper;
        expect(copper.length).toBeGreaterThan(0);
        writeSvg("flatcam-test.svg", [{ polygons: copper, fill: "#eb0a4b" }]);
    });
});
