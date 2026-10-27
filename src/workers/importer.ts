// Import of one file, run inside the import worker (pure function, also usable in tests).

import { bboxOfPolygons, packedPointCount, packPolygons, type Polygon } from "@core/geometry/index";
import type { LengthUnit } from "@core/units/index";
import {
    drillFromGerber,
    drillPolygons,
    drillSummary,
    looksLikeExcellon,
    parseExcellon,
    type DrillDocument
} from "@parsers/excellon/index";
import { buildGerberGeometry, detectLayerType, parseGerber, type LayerType } from "@parsers/gerber/index";
import type { FileFormat, ImportedDrill, ImportedFile, ImportWarning } from "@project/importedFile";
import type { ImportStage } from "./protocol";

export type ProgressCallback = (stage: ImportStage, fraction: number) => void;

interface ImportParts
{
    format: FileFormat;
    layerType: LayerType;
    unit: LengthUnit;
    polygons: Polygon[];
    drill: DrillDocument | null;
    warnings: ImportWarning[];
    objects: number;
    parseMs: number;
    buildMs: number;
}

function toImportedDrill(document: DrillDocument): ImportedDrill
{
    return {
        tools: [...document.tools.values()],
        hits: document.hits.map((hit) => ({ tool: hit.tool, x: hit.point.x, y: hit.point.y })),
        slots: document.slots.map((slot) => ({ tool: slot.tool, path: slot.path })),
        summary: drillSummary(document).map((entry) => ({
            ...entry,
            plating: document.tools.get(entry.tool)?.plating ?? "unknown"
        }))
    };
}

function assemble(fileName: string, parts: ImportParts): ImportedFile
{
    const geometry = packPolygons(parts.polygons);
    return {
        fileName,
        format: parts.format,
        layerType: parts.layerType,
        unit: parts.unit,
        geometry,
        bbox: bboxOfPolygons(parts.polygons),
        drill: parts.drill ? toImportedDrill(parts.drill) : null,
        warnings: parts.warnings,
        stats: {
            objects: parts.objects,
            polygons: parts.polygons.length,
            points: packedPointCount(geometry),
            parseMs: parts.parseMs,
            buildMs: parts.buildMs
        }
    };
}

/** Detects the format, parses the file and builds its geometry. Never throws on file content. */
export function importFile(fileName: string, text: string, onProgress: ProgressCallback = () => undefined): ImportedFile
{
    const start = performance.now();
    if (looksLikeExcellon(text))
    {
        onProgress("parsing", 0);
        const document = parseExcellon(text, { fileName });
        const parsed = performance.now();
        onProgress("building", 0);
        const holes = drillPolygons(document);
        onProgress("building", 1);
        return assemble(fileName, {
            format: "excellon",
            layerType: { kind: "drill", side: "none", source: "none" },
            unit: document.unit,
            polygons: holes,
            drill: document,
            warnings: document.warnings,
            objects: document.hits.length + document.slots.length,
            parseMs: parsed - start,
            buildMs: performance.now() - parsed
        });
    }

    const document = parseGerber(text, { onProgress: (fraction) => onProgress("parsing", fraction) });
    const parsed = performance.now();
    const layerType = detectLayerType(document.fileAttributes, fileName);
    const geometry = buildGerberGeometry(document, { onProgress: (fraction) => onProgress("building", fraction) });
    const built = performance.now();
    const warnings: ImportWarning[] = [...document.warnings, ...geometry.warnings];
    const drill = layerType.kind === "drill" ? drillFromGerber(document, fileName) : null;
    if (drill)
    {
        warnings.push(...drill.warnings);
    }
    return assemble(fileName, {
        format: "gerber",
        layerType,
        unit: document.unit,
        polygons: geometry.copper,
        drill,
        warnings,
        objects: document.objects.length,
        parseMs: parsed - start,
        buildMs: built - parsed
    });
}
