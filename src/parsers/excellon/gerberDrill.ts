// Drill data written as Gerber X2 (%TF.FileFunction,Plated / NonPlated), as Proteus and some other tools do:
// each circular aperture is a tool, flashes are holes and draws are milled slots.

import type { GerberDocument } from "@parsers/gerber/index";
import { platingFromFileName } from "./parser";
import type { DrillDocument, DrillTool, Plating } from "./types";

function platingFromGerber(document: GerberDocument, fileName: string): Plating
{
    const fileFunction = document.fileAttributes[".FileFunction"]?.[0];
    if (fileFunction === "Plated")
    {
        return "plated";
    }
    if (fileFunction === "NonPlated")
    {
        return "nonPlated";
    }
    return platingFromFileName(fileName);
}

/** Converts a parsed Gerber drill file into drilling data; aperture codes become tool numbers. */
export function drillFromGerber(document: GerberDocument, fileName = ""): DrillDocument
{
    const plating = platingFromGerber(document, fileName);
    const result: DrillDocument = {
        source: "gerber",
        unit: document.unit,
        format: null,
        formatOrigin: null,
        tools: new Map<number, DrillTool>(),
        hits: [],
        slots: [],
        warnings: []
    };

    for (const aperture of document.apertures.values())
    {
        if (aperture.template.kind !== "circle" || aperture.template.diameter <= 0)
        {
            result.warnings.push({
                code: "nonCircularAperture",
                line: aperture.line,
                detail: `Aperture D${aperture.code} is not a circle and cannot be drilled: its objects are ignored`
            });
            continue;
        }
        result.tools.set(aperture.code, {
            number: aperture.code,
            diameter: aperture.template.diameter,
            plating,
            line: aperture.line
        });
    }

    for (const object of document.objects)
    {
        if (object.kind === "region" || object.polarity === "clear")
        {
            result.warnings.push({ code: "unsupportedCommand", line: object.line, detail: "Regions and clear objects are ignored in drill files" });
            continue;
        }
        if (!result.tools.has(object.aperture))
        {
            continue;
        }
        if (object.kind === "flash")
        {
            result.hits.push({ tool: object.aperture, point: object.point, line: object.line });
        }
        else
        {
            result.slots.push({ tool: object.aperture, path: object.path, line: object.line });
        }
    }
    return result;
}
