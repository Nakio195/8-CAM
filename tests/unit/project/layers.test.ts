import { describe, expect, it } from "vitest";
import {
    addLayer,
    createLayer,
    defaultLayerColor,
    layerName,
    layersBBox,
    moveLayer,
    removeLayer,
    updateLayer,
    type ImportedFile,
    type ProjectLayer
} from "@project/index";
import { isEmptyBBox } from "@core/geometry/index";
import type { LayerKind, LayerSide } from "@parsers/gerber/index";

function file(kind: LayerKind, side: LayerSide = "none", name = `${kind}-${side}.gbr`, minX = 0): ImportedFile
{
    return {
        fileName: name,
        format: "gerber",
        layerType: { kind, side, source: "x2" },
        unit: "mm",
        geometry: new Int32Array([0]),
        bbox: { minX, minY: 0, maxX: minX + 10, maxY: 10 },
        drill: null,
        analysis: null,
        warnings: [],
        stats: { objects: 0, polygons: 0, points: 0, parseMs: 0, buildMs: 0, analysisMs: 0 }
    };
}

function ids(layers: ProjectLayer[]): string[]
{
    return layers.map((layer) => layer.id);
}

describe("project layers", () =>
{
    it("uses the brand colours per layer type", () =>
    {
        expect(defaultLayerColor({ kind: "copper", side: "top", source: "x2" })).toBe("#eb0a4b");
        expect(defaultLayerColor({ kind: "copper", side: "bottom", source: "x2" })).toBe("#7d64d2");
        expect(defaultLayerColor({ kind: "drill", side: "none", source: "x2" })).toBe("#ffe600");
        expect(defaultLayerColor({ kind: "unknown", side: "none", source: "none" })).toBe("#ebe7f8");
    });

    it("shortens Proteus file names", () =>
    {
        expect(layerName("C:\\boards\\FTDI_Max - CADCAM Bottom Copper.GBR")).toBe("Bottom Copper.GBR");
        expect(layerName("board-F_Cu.gbr")).toBe("board-F_Cu.gbr");
    });

    it("hides solder mask and paste layers at first", () =>
    {
        expect(createLayer(file("soldermask", "top"), "a").visible).toBe(false);
        expect(createLayer(file("copper", "top"), "b").visible).toBe(true);
    });

    it("stacks layers in a natural order whatever the import order", () =>
    {
        let layers: ProjectLayer[] = [];
        layers = addLayer(layers, createLayer(file("drill"), "drill"));
        layers = addLayer(layers, createLayer(file("copper", "top"), "top"));
        layers = addLayer(layers, createLayer(file("outline"), "outline"));
        layers = addLayer(layers, createLayer(file("copper", "bottom"), "bottom"));
        layers = addLayer(layers, createLayer(file("soldermask", "top"), "mask"));
        expect(ids(layers)).toEqual(["mask", "bottom", "top", "outline", "drill"]);
    });

    it("moves, updates and removes layers without mutating the input", () =>
    {
        const layers = [createLayer(file("copper", "bottom"), "a"), createLayer(file("drill"), "b")];
        expect(ids(moveLayer(layers, "a", "up"))).toEqual(["b", "a"]);
        expect(ids(moveLayer(layers, "b", "down"))).toEqual(["b", "a"]);
        expect(ids(moveLayer(layers, "b", "up"))).toEqual(["a", "b"]);
        expect(ids(moveLayer(layers, "missing", "up"))).toEqual(["a", "b"]);
        const hidden = updateLayer(layers, "a", { visible: false, color: "#000000" });
        expect(hidden[0]).toMatchObject({ visible: false, color: "#000000" });
        expect(layers[0]?.visible).toBe(true);
        expect(ids(removeLayer(layers, "a"))).toEqual(["b"]);
    });

    it("computes the bounding box of visible layers", () =>
    {
        const layers = [
            createLayer(file("copper", "top", "a.gbr", 0), "a"),
            { ...createLayer(file("drill", "none", "b.drl", 100), "b"), visible: false }
        ];
        expect(layersBBox(layers)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
        expect(layersBBox(layers, false).maxX).toBe(110);
        expect(isEmptyBBox(layersBBox([]))).toBe(true);
    });
});
