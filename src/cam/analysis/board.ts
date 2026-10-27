// Board analysis (specification 6.10): minimum clearance with its location, minimum track width, hole sizes and
// board thickness. Copper analysis runs in the import worker; the board summary combines the layers of a project.

import type { Point, Polygon } from "@core/geometry/index";
import type { GerberDocument } from "@parsers/gerber/index";
import { findClearances, type ClearanceSpot } from "./clearance";

/** Gaps wider than this are not reported: no isolation tool is that wide (internal units: 2 mm). */
export const CLEARANCE_SEARCH_RADIUS = 200_000;

/** Default FR4 board thickness, mm (specification 6.10). */
export const DEFAULT_BOARD_THICKNESS = 1.6;

export interface TrackWidth
{
    /** Internal units. */
    width: number;
    /** A point of the thinnest track, to show it. */
    at: Point;
    aperture: number;
}

export interface CopperAnalysis
{
    /** Closest approaches between distinct copper features, tightest first, up to CLEARANCE_SEARCH_RADIUS. */
    spots: ClearanceSpot[];
    minTrack: TrackWidth | null;
}

/**
 * Thinnest track drawn in the file: circular apertures draw tracks of their diameter, rectangular ones of their
 * smaller side (scaled by %LS). Zero-width draws (outlines) are ignored.
 */
export function minimumTrackWidth(document: GerberDocument): TrackWidth | null
{
    let best: TrackWidth | null = null;
    for (const object of document.objects)
    {
        if (object.kind !== "track" || object.polarity !== "dark" || object.path.length < 2)
        {
            continue;
        }
        const template = document.apertures.get(object.aperture)?.template;
        let width = 0;
        if (template?.kind === "circle")
        {
            width = template.diameter;
        }
        else if (template?.kind === "rectangle" || template?.kind === "obround")
        {
            width = Math.min(template.width, template.height);
        }
        width *= object.transform.scale;
        if (width > 0 && (!best || width < best.width))
        {
            best = { width, at: object.path[0] as Point, aperture: object.aperture };
        }
    }
    return best;
}

export function analyzeCopper(copper: readonly Polygon[], document: GerberDocument | null): CopperAnalysis
{
    return {
        spots: findClearances(copper, CLEARANCE_SEARCH_RADIUS),
        minTrack: document ? minimumTrackWidth(document) : null
    };
}

export interface HoleSize
{
    /** Internal units. */
    diameter: number;
    count: number;
}

export interface BoardSpot extends ClearanceSpot
{
    /** Layer the spot belongs to. */
    layer: string;
}

export interface BoardSummary
{
    /** All clearance spots of the copper layers, tightest first. */
    spots: BoardSpot[];
    minClearance: BoardSpot | null;
    minTrack: (TrackWidth & { layer: string }) | null;
    /** Distinct hole diameters with their counts, smallest first (slots count as holes of the tool diameter). */
    holes: HoleSize[];
    smallestHole: number | null;
    largestHole: number | null;
    /** mm. */
    thickness: number;
}

export interface CopperLayerInput
{
    id: string;
    analysis: CopperAnalysis;
}

export interface DrillInput
{
    summary: readonly { diameter: number; hits: number; slots: number }[];
}

export function summarizeBoard(copper: readonly CopperLayerInput[], drills: readonly DrillInput[],
    thickness = DEFAULT_BOARD_THICKNESS): BoardSummary
{
    const spots = copper
        .flatMap((layer) => layer.analysis.spots.map((spot) => ({ ...spot, layer: layer.id })))
        .sort((first, second) => first.distance - second.distance);

    let minTrack: BoardSummary["minTrack"] = null;
    for (const layer of copper)
    {
        const track = layer.analysis.minTrack;
        if (track && (!minTrack || track.width < minTrack.width))
        {
            minTrack = { ...track, layer: layer.id };
        }
    }

    // Holes of the same size from several files (plated and non plated) are counted together
    const counts = new Map<number, number>();
    for (const drill of drills)
    {
        for (const entry of drill.summary)
        {
            const total = entry.hits + entry.slots;
            if (total > 0)
            {
                counts.set(entry.diameter, (counts.get(entry.diameter) ?? 0) + total);
            }
        }
    }
    const holes = [...counts.entries()]
        .map(([diameter, count]) => ({ diameter, count }))
        .sort((first, second) => first.diameter - second.diameter);

    return {
        spots,
        minClearance: spots[0] ?? null,
        minTrack,
        holes,
        smallestHole: holes[0]?.diameter ?? null,
        largestHole: holes[holes.length - 1]?.diameter ?? null,
        thickness
    };
}
