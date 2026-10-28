import { describe, expect, it } from "vitest";
import { DEFAULT_ISOLATION } from "@cam/isolation/index";
import { defaultLibrary } from "@cam/tools/index";
import { DEFAULT_MACHINE, DEFAULT_SETUP } from "@post/index";
import { looksLikeProject, parseProject, serializeProject, type ProjectFile } from "@project/index";

const PROJECT: ProjectFile = {
    format: "8cam-project",
    version: 1,
    savedAt: "2026-10-28T10:00:00.000Z",
    appVersion: "0.0.1",
    thickness: 1.6,
    layers: [{ id: "layer-1", fileName: "Bottom Copper.GBR", source: "%FSLAX45Y45*%\nM02*\n", color: "#7d64d2", visible: true, opacity: 0.85 }],
    tools: defaultLibrary(),
    machine: DEFAULT_MACHINE,
    postProfile: null,
    isolations: [{ id: "isolation-1", kind: "isolation", layerId: "layer-1", toolId: "vbit-30-0.2", params: DEFAULT_ISOLATION, visible: true }],
    drillings: [],
    cutouts: [],
    setup: { ...DEFAULT_SETUP, mirror: true },
    exportOptions: { split: true, name: "FTDI" }
};

describe("project file", () =>
{
    it("survives a save and an open", () =>
    {
        const text = serializeProject(PROJECT);
        expect(looksLikeProject(text)).toBe(true);
        expect(parseProject(text)).toEqual({ project: PROJECT });
    });

    it("fills settings missing from older files and refuses what is not a project", () =>
    {
        const older = Object.fromEntries(Object.entries(PROJECT).filter(([key]) => key !== "setup" && key !== "exportOptions"));
        expect(parseProject(JSON.stringify(older))).toEqual({ project: { ...PROJECT, setup: DEFAULT_SETUP, exportOptions: { split: false, name: "" } } });
        expect(parseProject("{")).toEqual({ error: "invalidJson" });
        expect(parseProject("{\"format\":\"8cam-tools\"}")).toEqual({ error: "wrongFormat" });
        expect(parseProject(JSON.stringify({ ...PROJECT, version: 2 }))).toEqual({ error: "unsupportedVersion" });
        expect(parseProject(JSON.stringify({ ...PROJECT, layers: [{ fileName: "a" }] }))).toEqual({ error: "missingData" });
        expect(looksLikeProject("{\"format\":\"8cam-machine\"}")).toBe(false);
    });
});
