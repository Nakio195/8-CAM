// Layer type detection: X2 .FileFunction attribute first, then the file name conventions of common CAD tools
// (KiCad, Eagle, EasyEDA, Altium, Proteus, Protel extensions).

import type { AttributeSet } from "./types";

export type LayerSide = "top" | "bottom" | "inner" | "none";

export type LayerKind =
    | "copper"
    | "outline"
    | "soldermask"
    | "silkscreen"
    | "paste"
    | "drill"
    | "other"
    | "unknown";

export interface LayerType
{
    kind: LayerKind;
    side: LayerSide;
    /** Where the information came from. */
    source: "x2" | "filename" | "none";
}

const UNKNOWN: LayerType = { kind: "unknown", side: "none", source: "none" };

function sideFromX2(value: string | undefined): LayerSide
{
    if (value === "Top")
    {
        return "top";
    }
    if (value === "Bot")
    {
        return "bottom";
    }
    if (value === "Inr")
    {
        return "inner";
    }
    return "none";
}

/** Reads %TF.FileFunction (Gerber specification 5.6.3). */
export function layerTypeFromAttributes(attributes: AttributeSet): LayerType | null
{
    const values = attributes[".FileFunction"];
    if (!values || values.length === 0)
    {
        return null;
    }
    const [functionName, ...rest] = values;
    switch (functionName)
    {
        case "Copper":
            // Copper,L<n>,Top|Inr|Bot[,type]
            return { kind: "copper", side: sideFromX2(rest[1]), source: "x2" };
        case "Profile":
            return { kind: "outline", side: "none", source: "x2" };
        case "Soldermask":
            return { kind: "soldermask", side: sideFromX2(rest[0]), source: "x2" };
        case "Legend":
            return { kind: "silkscreen", side: sideFromX2(rest[0]), source: "x2" };
        case "Paste":
            return { kind: "paste", side: sideFromX2(rest[0]), source: "x2" };
        case "Plated":
        case "NonPlated":
            return { kind: "drill", side: "none", source: "x2" };
        default:
            return { kind: "other", side: "none", source: "x2" };
    }
}

interface NameRule
{
    pattern: RegExp;
    kind: LayerKind;
    side: LayerSide;
}

// Checked in order: the first matching rule wins
const NAME_RULES: NameRule[] = [
    // Board outline
    { pattern: /(edge[._ -]?cuts|board[ _-]?(outline|edge)|outline|profile|contour|dimension|\.gko$|\.gm1$|\.gml$|\.gmp$|\.bor$|\.oln$)/i, kind: "outline", side: "none" },
    // Drill files exported as Gerber
    { pattern: /(drill|\.drl$|\.xln$|\.gd1$)/i, kind: "drill", side: "none" },
    // Solder mask
    { pattern: /(f[._]mask|top[ _-]?(solder[ _-]?)?(mask|resist)|\.gts$|\.stc$|\.smt$)/i, kind: "soldermask", side: "top" },
    { pattern: /(b[._]mask|bot(tom)?[ _-]?(solder[ _-]?)?(mask|resist)|\.gbs$|\.sts$|\.smb$)/i, kind: "soldermask", side: "bottom" },
    // Silkscreen / legend
    { pattern: /(f[._]silks?|top[ _-]?(silk|overlay|legend)|\.gto$|\.plc$|\.sst$)/i, kind: "silkscreen", side: "top" },
    { pattern: /(b[._]silks?|bot(tom)?[ _-]?(silk|overlay|legend)|\.gbo$|\.pls$|\.ssb$)/i, kind: "silkscreen", side: "bottom" },
    // Paste
    { pattern: /(f[._]paste|top[ _-]?paste|\.gtp$|\.crc$)/i, kind: "paste", side: "top" },
    { pattern: /(b[._]paste|bot(tom)?[ _-]?paste|\.gbp$|\.crs$)/i, kind: "paste", side: "bottom" },
    // Copper
    { pattern: /(f[._]cu|top[ _-]?(layer|copper)|copper[ _-]?top|\.gtl$|\.cmp$|\.top$)/i, kind: "copper", side: "top" },
    { pattern: /(b[._]cu|bot(tom)?[ _-]?(layer|copper)|copper[ _-]?bot(tom)?|\.gbl$|\.sol$|\.bot$)/i, kind: "copper", side: "bottom" },
    { pattern: /(in\d+[._]cu|inner|\.g\d+$|\.gp\d+$)/i, kind: "copper", side: "inner" }
];

export function layerTypeFromFileName(fileName: string): LayerType | null
{
    for (const rule of NAME_RULES)
    {
        if (rule.pattern.test(fileName))
        {
            return { kind: rule.kind, side: rule.side, source: "filename" };
        }
    }
    return null;
}

/** Best guess of the layer type; X2 attributes take precedence over the file name. */
export function detectLayerType(attributes: AttributeSet, fileName = ""): LayerType
{
    return layerTypeFromAttributes(attributes) ?? layerTypeFromFileName(fileName) ?? UNKNOWN;
}
