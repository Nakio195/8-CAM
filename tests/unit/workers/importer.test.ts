import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { forEachPackedRing, packedPointCount, packPolygons, rectanglePath, unpackPolygons, type Polygon } from "@core/geometry/index";
import { importFile } from "@workers/importer";
import { mmToInternal } from "@core/units/index";

const FIXTURES = join(import.meta.dirname, "..", "..", "fixtures");

function fixture(name: string): string
{
    return readFileSync(join(FIXTURES, name), "utf8");
}

describe("polygon packing", () =>
{
    it("round trips polygons with holes", () =>
    {
        const polygons: Polygon[] = [
            { outer: rectanglePath(0, 0, 10, 10), holes: [[...rectanglePath(2, 2, 4, 4)].reverse()] },
            { outer: rectanglePath(-1_000_000_000, -5, 1_000_000_000, 5), holes: [] }
        ];
        const packed = packPolygons(polygons);
        expect(packed).toBeInstanceOf(Int32Array);
        expect(unpackPolygons(packed)).toEqual(polygons);
        expect(packedPointCount(packed)).toBe(12);
        const rings: number[] = [];
        forEachPackedRing(packed, (_start, count) => rings.push(count));
        expect(rings).toEqual([4, 4, 4]);
        expect(unpackPolygons(packPolygons([]))).toEqual([]);
    });
});

describe("importer", () =>
{
    it("imports a Gerber copper layer", () =>
    {
        const stages = new Set<string>();
        const file = importFile("FTDI_Max - CADCAM Bottom Copper.GBR", fixture("proteus/ftdi-max-bottom-copper.gbr"), (stage) => stages.add(stage));
        expect(file.format).toBe("gerber");
        expect(file.layerType).toEqual({ kind: "copper", side: "bottom", source: "x2" });
        expect(file.drill).toBeNull();
        expect(file.warnings).toEqual([]);
        expect(file.stats.objects).toBe(96);
        expect(file.stats.points).toBe(packedPointCount(file.geometry));
        expect(file.bbox.minX).toBeLessThan(file.bbox.maxX);
        expect([...stages]).toEqual(["parsing", "building"]);
    });

    it("imports a Gerber drill file with its drilling data", () =>
    {
        const file = importFile("Drill Plated.GBR", fixture("proteus/ftdi-max-drill-plated.gbr"));
        expect(file.layerType.kind).toBe("drill");
        expect(file.drill?.hits).toHaveLength(41);
        expect(file.drill?.summary.map((entry) => entry.plating)).toEqual(["plated", "plated", "plated", "plated"]);
    });

    it("imports an Excellon file", () =>
    {
        const file = importFile("test.drl", fixture("flatcam/flatcam-test.drl"));
        expect(file.format).toBe("excellon");
        expect(file.layerType.kind).toBe("drill");
        expect(file.drill?.summary).toHaveLength(2);
        expect(file.stats.polygons).toBe(16);
        expect(file.drill?.hits[0]).toEqual({ tool: 1, x: 2712974, y: 2827020 });
        expect(mmToInternal(1.0681 * 25.4)).toBe(2712974);
    });
});

describe("display simplification", () =>
{
    it("drops points closer than the tolerance and keeps tiny shapes visible", async () =>
    {
        const { circlePath, simplifyPacked, distanceToRings } = await import("@core/geometry/index");
        const disc = { outer: circlePath({ x: 0, y: 0 }, 50_000), holes: [circlePath({ x: 0, y: 0 }, 100)] };
        const tiny = { outer: rectanglePath(1_000_000, 0, 1_000_010, 10), holes: [] };
        const packed = packPolygons([disc, tiny]);
        const simplified = simplifyPacked(packed, 5_000);
        const [simpleDisc, simpleTiny] = unpackPolygons(simplified);
        // About one point every 0.05 mm along a 3.14 mm circumference
        expect(simpleDisc?.outer.length).toBeLessThan(disc.outer.length);
        expect(simpleDisc?.outer.length).toBeLessThanOrEqual(Math.ceil((2 * Math.PI * 50_000) / 5_000) + 1);
        expect(simpleDisc?.outer.length).toBeGreaterThanOrEqual(8);
        // The tiny hole disappears, every kept point lies on the original circle
        expect(simpleDisc?.holes).toEqual([]);
        expect(Math.max(...(simpleDisc?.outer ?? []).map((point) => distanceToRings(point, [disc.outer])))).toBeLessThan(1);
        expect(simpleTiny?.outer).toHaveLength(4);
        expect(unpackPolygons(simplifyPacked(packed, 1))).toEqual(unpackPolygons(packed));
    });
});
