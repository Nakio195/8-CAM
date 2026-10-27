// Minimal SVG export of geometry, used for visual checks of parsers and toolpaths (and later illustrations).
// Coordinates are written in millimetres with the Y axis pointing up, like the board.

import { internalToMm, mmToInternal } from "@core/units/index";
import { bboxOfPaths, inflateBBox, isEmptyBBox } from "./bbox";
import type { Path, Polygon } from "./types";

export interface SvgLayer
{
    polygons?: readonly Polygon[];
    polylines?: readonly Path[];
    fill?: string;
    stroke?: string;
    /** Stroke width in millimetres. */
    strokeWidth?: number;
    opacity?: number;
}

export interface SvgOptions
{
    /** Margin around the drawing, in millimetres. */
    margin?: number;
    background?: string;
}

const DECIMALS = 4;

function formatNumber(value: number): string
{
    return Number(internalToMm(value).toFixed(DECIMALS)).toString();
}

function ringData(path: Path, closed: boolean): string
{
    if (path.length === 0)
    {
        return "";
    }
    const commands = path.map((point, index) => `${index === 0 ? "M" : "L"}${formatNumber(point.x)} ${formatNumber(point.y)}`);
    return commands.join("") + (closed ? "Z" : "");
}

export function polygonsToPathData(polygons: readonly Polygon[]): string
{
    return polygons.map((polygon) => [polygon.outer, ...polygon.holes].map((ring) => ringData(ring, true)).join("")).join("");
}

export function geometryToSvg(layers: readonly SvgLayer[], options: SvgOptions = {}): string
{
    const paths = layers.flatMap((layer) => [
        ...(layer.polygons ?? []).map((polygon) => polygon.outer),
        ...(layer.polylines ?? [])
    ]);
    let box = bboxOfPaths(paths);
    if (isEmptyBBox(box))
    {
        box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    box = inflateBBox(box, mmToInternal(options.margin ?? 1));
    const width = formatNumber(box.maxX - box.minX);
    const height = formatNumber(box.maxY - box.minY);

    const body: string[] = [];
    if (options.background)
    {
        body.push(`<rect x="${formatNumber(box.minX)}" y="${formatNumber(box.minY)}" width="${width}" height="${height}" fill="${options.background}"/>`);
    }
    for (const layer of layers)
    {
        const stroke = layer.stroke ? ` stroke="${layer.stroke}" stroke-width="${layer.strokeWidth ?? 0.05}" stroke-linejoin="round" stroke-linecap="round"` : "";
        const opacity = layer.opacity === undefined ? "" : ` opacity="${layer.opacity}"`;
        if (layer.polygons && layer.polygons.length > 0)
        {
            body.push(`<path d="${polygonsToPathData(layer.polygons)}" fill="${layer.fill ?? "none"}" fill-rule="evenodd"${stroke}${opacity}/>`);
        }
        if (layer.polylines && layer.polylines.length > 0)
        {
            const data = layer.polylines.map((line) => ringData(line, false)).join("");
            body.push(`<path d="${data}" fill="none"${stroke}${opacity}/>`);
        }
    }
    // The group flips Y so the board is not drawn upside down
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" `
        + `viewBox="${formatNumber(box.minX)} ${formatNumber(-box.maxY)} ${width} ${height}">`
        + `<g transform="scale(1,-1)">${body.join("")}</g></svg>`;
}
