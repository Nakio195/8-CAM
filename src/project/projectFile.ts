// Project file (specification 6.9: ".json" holding the source files, the parameters and the tools): everything needed to
// find the work again on another computer. Results are not saved: they are computed again when the project is opened.

import type { Tool } from "@cam/tools/index";
import type { JobSetup, MachineProfile, PostProfile } from "@post/index";
import type { CutoutOperation, DrillingOperation, IsolationOperation } from "./operations";

export const PROJECT_FORMAT = "8cam-project";
export const PROJECT_VERSION = 1;

export interface ProjectFileLayer
{
    id: string;
    fileName: string;
    /** Content of the file as imported. */
    source: string;
    color: string;
    visible: boolean;
    opacity: number;
}

export interface ProjectFile
{
    format: typeof PROJECT_FORMAT;
    version: typeof PROJECT_VERSION;
    /** ISO date. */
    savedAt: string;
    appVersion: string;
    /** Board thickness, mm. */
    thickness: number;
    layers: ProjectFileLayer[];
    /** Tool library at the time of saving, so every operation finds its tool. */
    tools: Tool[];
    machine: MachineProfile;
    /** The post-processor of the machine when it is the user's own (built-in ones are always there). */
    postProfile: PostProfile | null;
    isolations: Omit<IsolationOperation, "result">[];
    drillings: Omit<DrillingOperation, "result">[];
    cutouts: Omit<CutoutOperation, "result">[];
    setup: JobSetup;
    exportOptions: { split: boolean; name: string };
}

export type ProjectFileError = "invalidJson" | "wrongFormat" | "unsupportedVersion" | "missingData";

export function serializeProject(project: ProjectFile): string
{
    return `${JSON.stringify(project)}\n`;
}

/** Quick test, before parsing a whole file: does this text look like an 8-CAM project? */
export function looksLikeProject(text: string): boolean
{
    return /^\s*\{/.test(text) && text.slice(0, 200).includes(`"${PROJECT_FORMAT}"`);
}

export function parseProject(text: string): { project: ProjectFile } | { error: ProjectFileError }
{
    let parsed: unknown;
    try
    {
        parsed = JSON.parse(text);
    }
    catch
    {
        return { error: "invalidJson" };
    }
    const project = parsed as Partial<ProjectFile> | null;
    if (!project || typeof project !== "object" || project.format !== PROJECT_FORMAT)
    {
        return { error: "wrongFormat" };
    }
    if (project.version !== PROJECT_VERSION)
    {
        return { error: "unsupportedVersion" };
    }
    const layersOk = Array.isArray(project.layers) && project.layers.every((layer) =>
        typeof layer.fileName === "string" && typeof layer.source === "string" && typeof layer.id === "string");
    if (!layersOk || !Array.isArray(project.tools) || !project.machine || !Array.isArray(project.isolations)
        || !Array.isArray(project.drillings) || !Array.isArray(project.cutouts) || typeof project.thickness !== "number")
    {
        return { error: "missingData" };
    }
    return {
        project: {
            ...(project as ProjectFile),
            setup: project.setup ?? { origin: "lowerLeft", mirror: false },
            exportOptions: project.exportOptions ?? { split: false, name: "" },
            postProfile: project.postProfile ?? null
        }
    };
}
