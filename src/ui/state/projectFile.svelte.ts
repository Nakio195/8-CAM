// Saving and opening a whole project (specification 6.9): source files, layer display, board thickness, tools, machine,
// operations and export settings in one JSON file. Opening it imports the files again and computes every operation.

import { mergeLibraries } from "@cam/tools/index";
import { APP_VERSION } from "@core/index";
import { looksLikeProject, parseProject, serializeProject, type ProjectFile, type ProjectFileError } from "@project/index";
import { isoNow } from "../files";
import { exportState } from "./export.svelte";
import { machineState } from "./machine.svelte";
import { machining } from "./machining.svelte";
import { project } from "./project.svelte";
import { toolLibrary } from "./tools.svelte";

/** Operation without its result: results are computed again when the project is opened. */
function withoutResult<Operation extends { result: unknown }>(operation: Operation): Omit<Operation, "result">
{
    return Object.fromEntries(Object.entries(operation).filter(([key]) => key !== "result")) as Omit<Operation, "result">;
}

/** Plain data of the project, as saved. */
export function projectSnapshot(): ProjectFile
{
    const snapshot = <T>(value: T): T => $state.snapshot(value) as T;
    const profile = machineState.activeProfile;
    return {
        format: "8cam-project",
        version: 1,
        savedAt: isoNow(),
        appVersion: APP_VERSION,
        thickness: project.thickness,
        layers: project.layers.map((layer) => ({
            id: layer.id,
            fileName: layer.file.fileName,
            source: layer.source,
            color: layer.color,
            visible: layer.visible,
            opacity: layer.opacity
        })),
        tools: snapshot(toolLibrary.tools),
        machine: snapshot(machineState.active),
        postProfile: profile.builtIn ? null : snapshot(profile),
        isolations: machining.operations.map((operation) => withoutResult(snapshot(operation))),
        drillings: machining.drillings.map((operation) => withoutResult(snapshot(operation))),
        cutouts: machining.cutouts.map((operation) => withoutResult(snapshot(operation))),
        setup: snapshot(exportState.setup),
        exportOptions: { split: exportState.split, name: exportState.name }
    };
}

export function projectText(): string
{
    return serializeProject(projectSnapshot());
}

/** Replaces the project with the one of a file. Returns an error code when the file cannot be read. */
export async function openProject(text: string): Promise<ProjectFileError | null>
{
    const parsed = parseProject(text);
    if ("error" in parsed)
    {
        return parsed.error;
    }
    const file = parsed.project;
    machining.clear();
    exportState.cancel();
    exportState.output = null;
    exportState.edited = {};
    project.clear();
    project.thickness = file.thickness;
    // Tools of the project replace those with the same id, so every operation finds the tool it was made with
    toolLibrary.replaceAll(mergeLibraries(toolLibrary.tools, file.tools));
    machineState.restore(file.machine, file.postProfile);
    exportState.setup = { ...file.setup };
    exportState.split = file.exportOptions.split;
    exportState.name = file.exportOptions.name;

    // Files are imported one after the other to keep their order in the stack
    const layerIds: Record<string, string> = {};
    for (const layer of file.layers)
    {
        const id = await project.importText(layer.fileName, layer.source);
        if (id)
        {
            layerIds[layer.id] = id;
            project.restoreDisplay(id, { color: layer.color, visible: layer.visible, opacity: layer.opacity });
        }
    }
    project.fit();
    machining.restore(file.isolations, file.drillings, file.cutouts, layerIds);
    return null;
}

/** Files chosen or dropped by the user: a project file is opened, anything else is imported into the project. */
export async function openFiles(files: Iterable<File>): Promise<ProjectFileError | null>
{
    const list = [...files];
    const first = list[0];
    if (list.length === 1 && first && /\.json$/i.test(first.name))
    {
        const text = await first.text();
        if (looksLikeProject(text))
        {
            return openProject(text);
        }
    }
    await project.importFiles(list);
    return null;
}
