// Project file (specification 6.9: ".json" holding the source files, the parameters and the tools): everything needed to
// find the work again on another computer. Results are not saved: they are computed again when the project is opened.

import { readTool, validateTool, type Tool } from "@cam/tools/index";
import { importMachine, normalizeProfile, validateProfile, type JobSetup, type MachineProfile, type PostProfile } from "@post/index";
import { arrayOf, boolean, direction, integer, matches, number, oneOf, point, text, type Check } from "./checks";
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

export type ProjectFileError = "invalidJson" | "wrongFormat" | "unsupportedVersion" | "missingData" | "invalidSettings" | "invalidTools"
    | "invalidMachine" | "invalidPostProfile" | "invalidOperations";

// A project may come from anyone: every value is checked before it reaches the tools, the machine or the G-code.
// Limits are wide (they only refuse what no real board needs) and match those of the editors.
const ID = text(200);
const ISOLATION_PARAMS = { passes: integer(1, 20), overlap: number(0, 0.9), direction, combinePasses: boolean, extraOffset: number(0, 5) };
const DRILLING_PARAMS = { cycle: oneOf("simple", "peck"), peckDepth: number(0.01, 10), dwell: number(0, 60), depth: number(0.01, 20) };
const CUTOUT_PARAMS = {
    mode: oneOf("shape", "rectangle"),
    margin: number(0, 100),
    direction,
    depth: number(0.01, 20),
    thickness: number(0.1, 20),
    tabWidth: number(0, 50),
    tabHeight: number(0, 20)
};
const assignments: Check = (value) => typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length <= 1000 && Object.values(value).every((tool) => tool === null || ID(tool));
const CHECKS = {
    layer: { id: ID, fileName: text(500), source: (value: unknown) => typeof value === "string", color: text(50), visible: boolean, opacity: number(0, 1) },
    isolation: { id: ID, kind: oneOf("isolation"), layerId: ID, toolId: ID, params: (value: unknown) => matches(value, ISOLATION_PARAMS), visible: boolean },
    drilling: {
        id: ID,
        kind: oneOf("drilling"),
        layerIds: arrayOf(ID, 1000),
        assignments,
        params: (value: unknown) => matches(value, DRILLING_PARAMS),
        visible: boolean,
        showFileOrder: boolean
    },
    cutout: {
        id: ID,
        kind: oneOf("cutout"),
        outlineLayerId: (value: unknown) => value === null || ID(value),
        toolId: ID,
        params: (value: unknown) => matches(value, CUTOUT_PARAMS),
        tabCount: integer(0, 50),
        tabs: arrayOf(point, 200),
        visible: boolean
    },
    setup: { origin: oneOf("lowerLeft", "center", "gerber"), mirror: boolean },
    exportOptions: { split: boolean, name: text(200) }
} satisfies Record<string, Record<string, Check>>;

/** Tools of a project, each read and checked like an imported tool; null when one of them is not valid. */
function projectTools(values: readonly unknown[]): Tool[] | null
{
    const tools = values.map(readTool);
    return tools.every((tool): tool is Tool => tool !== null && validateTool(tool).length === 0) ? tools : null;
}

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
    if (!Array.isArray(project.layers) || !Array.isArray(project.tools) || !project.machine || !Array.isArray(project.isolations)
        || !Array.isArray(project.drillings) || !Array.isArray(project.cutouts) || typeof project.thickness !== "number")
    {
        return { error: "missingData" };
    }
    // Projects saved before these settings existed take their defaults
    const setup = project.setup ?? { origin: "lowerLeft", mirror: false };
    const exportOptions = project.exportOptions ?? { split: false, name: "" };
    if (!number(0.1, 20)(project.thickness) || !project.layers.every((layer) => matches(layer, CHECKS.layer))
        || !matches(setup, CHECKS.setup) || !matches(exportOptions, CHECKS.exportOptions))
    {
        return { error: "invalidSettings" };
    }
    const tools = projectTools(project.tools);
    if (!tools)
    {
        return { error: "invalidTools" };
    }
    const machine = importMachine(JSON.stringify(project.machine));
    if (!("machine" in machine))
    {
        return { error: "invalidMachine" };
    }
    const postProfile = project.postProfile ?? null;
    if (postProfile !== null && validateProfile(postProfile).length > 0)
    {
        return { error: "invalidPostProfile" };
    }
    if (!project.isolations.every((operation) => matches(operation, CHECKS.isolation))
        || !project.drillings.every((operation) => matches(operation, CHECKS.drilling))
        || !project.cutouts.every((operation) => matches(operation, CHECKS.cutout)))
    {
        return { error: "invalidOperations" };
    }
    return {
        project: {
            ...(project as ProjectFile),
            tools,
            machine: machine.machine,
            postProfile: postProfile ? normalizeProfile(postProfile) : null,
            setup,
            exportOptions
        }
    };
}
