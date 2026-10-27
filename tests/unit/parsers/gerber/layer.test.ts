import { describe, expect, it } from "vitest";
import { detectLayerType, layerTypeFromAttributes, layerTypeFromFileName } from "@parsers/gerber/layer";

describe("layer type detection", () =>
{
    it("reads X2 file functions", () =>
    {
        const cases: [string[], string, string][] = [
            [["Copper", "L1", "Top"], "copper", "top"],
            [["Copper", "L2", "Bot"], "copper", "bottom"],
            [["Copper", "L3", "Inr", "Plane"], "copper", "inner"],
            [["Profile", "NP"], "outline", "none"],
            [["Soldermask", "Top"], "soldermask", "top"],
            [["Legend", "Bot"], "silkscreen", "bottom"],
            [["Paste", "Top"], "paste", "top"],
            [["Plated", "1", "2", "PTH"], "drill", "none"],
            [["NonPlated", "1", "2", "NPTH"], "drill", "none"],
            [["Other", "Comment"], "other", "none"],
            [["Copper", "L1", "Weird"], "copper", "none"]
        ];
        for (const [values, kind, side] of cases)
        {
            expect(layerTypeFromAttributes({ ".FileFunction": values })).toEqual({ kind, side, source: "x2" });
        }
        expect(layerTypeFromAttributes({})).toBeNull();
        expect(layerTypeFromAttributes({ ".FileFunction": [] })).toBeNull();
    });

    it("recognises the file names of common CAD tools", () =>
    {
        const cases: [string, string, string][] = [
            ["board-F_Cu.gbr", "copper", "top"],
            ["board-B_Cu.gbr", "copper", "bottom"],
            ["board-In1_Cu.gbr", "copper", "inner"],
            ["board-Edge_Cuts.gm1", "outline", "none"],
            ["Gerber_TopLayer.GTL", "copper", "top"],
            ["Gerber_BottomLayer.GBL", "copper", "bottom"],
            ["Gerber_BoardOutline.GKO", "outline", "none"],
            ["FTDI_Max - CADCAM Bottom Copper.GBR", "copper", "bottom"],
            ["FTDI_Max - CADCAM Top Copper.GBR", "copper", "top"],
            ["FTDI_Max - CADCAM Drill TOP-BOT Plated.GBR", "drill", "none"],
            ["project.cmp", "copper", "top"],
            ["project.sol", "copper", "bottom"],
            ["board.GTS", "soldermask", "top"],
            ["board-B_Mask.gbr", "soldermask", "bottom"],
            ["board-F_Silkscreen.gbr", "silkscreen", "top"],
            ["board.GBO", "silkscreen", "bottom"],
            ["board-F_Paste.gbr", "paste", "top"],
            ["board.GBP", "paste", "bottom"],
            ["board.G2", "copper", "inner"]
        ];
        for (const [name, kind, side] of cases)
        {
            expect(layerTypeFromFileName(name), name).toEqual({ kind, side, source: "filename" });
        }
        expect(layerTypeFromFileName("readme.txt")).toBeNull();
    });

    it("prefers X2 attributes over the file name", () =>
    {
        expect(detectLayerType({ ".FileFunction": ["Copper", "L2", "Bot"] }, "top.gtl").side).toBe("bottom");
        expect(detectLayerType({}, "top.gtl")).toEqual({ kind: "copper", side: "top", source: "filename" });
        expect(detectLayerType({})).toEqual({ kind: "unknown", side: "none", source: "none" });
    });
});
