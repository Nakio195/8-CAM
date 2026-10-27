// Project layers: one per imported file, with display settings. Pure functions returning new arrays,
// so the user interface can keep them in reactive state and undo / redo can come later (J10).
// The array order is the drawing order: the first layer is drawn first, i.e. below the others.

import { emptyBBox, isEmptyBBox, mergeBBoxes, type BBox } from "@core/geometry/index";
import type { LayerKind, LayerSide, LayerType } from "@parsers/gerber/index";
import type { ImportedFile } from "./importedFile";

export interface ProjectLayer
{
    id: string;
    name: string;
    file: ImportedFile;
    color: string;
    visible: boolean;
    opacity: number;
}

// Brand colours (specification section 6.13): front copper red, back copper co-working purple,
// drills PRO yellow, outline pink, solder mask training green
const COLORS: Record<LayerKind, string> = {
    copper: "#eb0a4b",
    outline: "#faa0cd",
    drill: "#ffe600",
    soldermask: "#1ebe96",
    silkscreen: "#e4dfe3",
    paste: "#fdebf5",
    other: "#ebe7f8",
    unknown: "#ebe7f8"
};

const SIDE_COLORS: Partial<Record<LayerSide, string>> = {
    bottom: "#7d64d2",
    inner: "#faa0cd"
};

/** Lower ranks are drawn first: back copper under front copper, drills and outline on top. */
const RANKS: Record<LayerKind, number> = {
    soldermask: 0,
    paste: 0,
    other: 0,
    unknown: 0,
    copper: 1,
    silkscreen: 3,
    outline: 4,
    drill: 5
};

export function defaultLayerColor(type: LayerType): string
{
    if (type.kind === "copper")
    {
        return SIDE_COLORS[type.side] ?? COLORS.copper;
    }
    return COLORS[type.kind];
}

function rank(type: LayerType): number
{
    const base = RANKS[type.kind];
    // Front copper above back copper
    return type.kind === "copper" && type.side === "top" ? base + 0.5 : base;
}

/** Display name: the file name without the long CAD prefix kept by some tools. */
export function layerName(fileName: string): string
{
    const base = fileName.replace(/^.*[\\/]/, "");
    const proteus = /^.* - CADCAM (.+)$/.exec(base);
    return proteus ? (proteus[1] as string) : base;
}

export function createLayer(file: ImportedFile, id: string): ProjectLayer
{
    return {
        id,
        name: layerName(file.fileName),
        file,
        color: defaultLayerColor(file.layerType),
        // Solder mask and paste layers are rarely useful for milling: hidden at first
        visible: file.layerType.kind !== "soldermask" && file.layerType.kind !== "paste",
        opacity: 1
    };
}

/** Inserts a layer at its natural place in the stack (after the layers of the same or lower rank). */
export function addLayer(layers: readonly ProjectLayer[], layer: ProjectLayer): ProjectLayer[]
{
    const layerRank = rank(layer.file.layerType);
    const index = layers.findIndex((other) => rank(other.file.layerType) > layerRank);
    const result = [...layers];
    result.splice(index === -1 ? result.length : index, 0, layer);
    return result;
}

export function removeLayer(layers: readonly ProjectLayer[], id: string): ProjectLayer[]
{
    return layers.filter((layer) => layer.id !== id);
}

export function updateLayer(layers: readonly ProjectLayer[], id: string,
    changes: Partial<Pick<ProjectLayer, "name" | "color" | "visible" | "opacity">>): ProjectLayer[]
{
    return layers.map((layer) => (layer.id === id ? { ...layer, ...changes } : layer));
}

/** Moves a layer one step up (drawn later, above) or down in the stack. */
export function moveLayer(layers: readonly ProjectLayer[], id: string, direction: "up" | "down"): ProjectLayer[]
{
    const index = layers.findIndex((layer) => layer.id === id);
    const target = direction === "up" ? index + 1 : index - 1;
    if (index === -1 || target < 0 || target >= layers.length)
    {
        return [...layers];
    }
    const result = [...layers];
    [result[index], result[target]] = [result[target] as ProjectLayer, result[index] as ProjectLayer];
    return result;
}

/** Bounding box of the layers (only the visible ones by default); empty when there is nothing to show. */
export function layersBBox(layers: readonly ProjectLayer[], visibleOnly = true): BBox
{
    let box = emptyBBox();
    for (const layer of layers)
    {
        if ((!visibleOnly || layer.visible) && !isEmptyBBox(layer.file.bbox))
        {
            box = mergeBBoxes(box, layer.file.bbox);
        }
    }
    return box;
}
