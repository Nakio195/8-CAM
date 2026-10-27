import { expect, it } from "vitest";
import {
    bboxOfPolygons,
    differencePolygons,
    offsetPolygons,
    rectanglePath,
    strokePolylines,
    unionPolygons,
    type Path,
    type Polygon
} from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";
import { buildGerberGeometry, parseGerber } from "@parsers/gerber/index";
import { createDenseBoard } from "./denseBoard";

// Target of specification section 8: parsing a 5 MB Gerber file in < 3 s
const MM = mmToInternal(1);
const TARGET_BYTES = 5 * 1024 * 1024;

/** Coordinates in the 4.6 mm format: internal units are 10 nm, the file unit is 1 nm. */
function coordinate(value: number): string
{
    return String(value * 10);
}

function regionCommands(contours: Path[]): string[]
{
    const lines = ["G36*"];
    for (const contour of contours)
    {
        const first = contour[0];
        if (!first)
        {
            continue;
        }
        lines.push(`X${coordinate(first.x)}Y${coordinate(first.y)}D02*`);
        for (const point of [...contour.slice(1), first])
        {
            lines.push(`X${coordinate(point.x)}Y${coordinate(point.y)}D01*`);
        }
    }
    lines.push("G37*");
    return lines;
}

/**
 * Dense board with a ground pour (as KiCad writes it: dark pour regions, then clear regions for its holes),
 * tiled side by side until the file reaches 5 MB.
 */
function createLargeGerber(): string
{
    const board = createDenseBoard();
    const tracks: Polygon[] = [];
    for (const [width, lines] of board.tracksByWidth)
    {
        tracks.push(...strokePolylines(lines, width));
    }
    const copper = unionPolygons([...board.pads, ...tracks]);
    const box = bboxOfPolygons(copper);
    const outline = { outer: rectanglePath(box.minX - MM, box.minY - MM, box.maxX + MM, box.maxY + MM), holes: [] };
    const pour = differencePolygons([outline], offsetPolygons(copper, 0.3 * MM));

    const tile: string[] = [];
    tile.push("%LPD*%", ...regionCommands(pour.map((polygon) => polygon.outer)));
    tile.push("%LPC*%", ...regionCommands(pour.flatMap((polygon) => polygon.holes)));
    tile.push("%LPD*%", "D11*");
    for (const pad of board.pads)
    {
        const xs = pad.outer.map((point) => point.x);
        const ys = pad.outer.map((point) => point.y);
        const x = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
        const y = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
        tile.push(`X${coordinate(x)}Y${coordinate(y)}D03*`);
    }
    for (const [width, lines] of board.tracksByWidth)
    {
        tile.push(width === 0.2 * MM ? "D10*" : "D12*");
        for (const line of lines)
        {
            line.forEach((point, index) => tile.push(`X${coordinate(point.x)}Y${coordinate(point.y)}D0${index === 0 ? 2 : 1}*`));
        }
    }
    const tileText = tile.join("\n");
    const header = "%FSLAX46Y46*%\n%MOMM*%\n%ADD10C,0.2*%\n%ADD11C,1*%\n%ADD12C,0.3*%\n";
    const copies = Math.ceil(TARGET_BYTES / tileText.length);
    const parts = [header];
    for (let i = 0; i < copies; i++)
    {
        // Each copy is shifted along X (110 mm) so every tile is separate geometry
        parts.push(tileText.replace(/X(-?\d+)/g, (_match, value: string) => `X${Number(value) + i * 110_000_000}`));
    }
    parts.push("M02*");
    return parts.join("\n");
}

it("parses a 5 MB Gerber file in less than 3 s", () =>
{
    const source = createLargeGerber();
    const sizeMb = source.length / (1024 * 1024);

    let start = performance.now();
    const document = parseGerber(source);
    const parseMs = performance.now() - start;

    start = performance.now();
    const geometry = buildGerberGeometry(document);
    const buildMs = performance.now() - start;

    console.table({
        "file size (MB)": sizeMb.toFixed(1),
        "graphics objects": document.objects.length,
        "parse (ms)": parseMs.toFixed(0),
        "copper polygons": geometry.copper.length,
        "copper union (ms)": buildMs.toFixed(0)
    });

    expect(sizeMb).toBeGreaterThanOrEqual(5);
    expect(document.warnings).toEqual([]);
    expect(parseMs).toBeLessThan(3000);
});
