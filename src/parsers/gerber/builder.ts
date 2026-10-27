// Builds the final copper geometry of a parsed Gerber document: unified polygons with holes.
// Objects are processed in file order: consecutive objects of the same polarity are merged in one batch,
// dark batches are added to the image and clear batches erase it (FlatCAM ParseGerber.py does the same
// with Shapely union / difference on 'solid' and 'clear' geometry).

import {
    bboxIntersects,
    bboxOfPolygons,
    compose,
    convexHull,
    differencePolygons,
    DEFAULT_ARC_TOLERANCE,
    IDENTITY,
    mirroring,
    rotation,
    scaling,
    strokePolylines,
    transformPolygons,
    translatePolygons,
    unionPolygons,
    withOrientation,
    type Path,
    type Point,
    type Polygon,
    type Transform
} from "@core/geometry/index";
import { apertureShape, strokeWidth } from "./aperture";
import type {
    ApertureTransform,
    FlashObject,
    GerberDocument,
    GerberWarning,
    Polarity,
    TrackObject
} from "./types";

export interface GerberBuildOptions
{
    arcTolerance?: number;
    onProgress?: (fraction: number) => void;
}

export interface GerberGeometry
{
    /** Unified copper (dark minus clear areas). */
    copper: Polygon[];
    warnings: GerberWarning[];
}

interface Batch
{
    polarity: Polarity;
    shapes: Polygon[];
    /** Track centre lines drawn with circular apertures, by stroke width. */
    strokes: Map<number, Path[]>;
}

const PROGRESS_STEP = 2000;

/** Transform of %LM / %LR / %LS: mirror first, then rotate, then scale (Gerber specification 4.9). */
function apertureMatrix(transform: ApertureTransform): Transform
{
    let matrix = IDENTITY;
    if (transform.mirrorX || transform.mirrorY)
    {
        // LMX mirrors along the X axis, i.e. flips X coordinates
        matrix = compose(matrix, mirroring(transform.mirrorX, transform.mirrorY));
    }
    if (transform.rotation !== 0)
    {
        matrix = compose(matrix, rotation(transform.rotation));
    }
    if (transform.scale !== 1)
    {
        matrix = compose(matrix, scaling(transform.scale));
    }
    return matrix;
}

function isDefaultTransform(transform: ApertureTransform): boolean
{
    return !transform.mirrorX && !transform.mirrorY && transform.rotation === 0 && transform.scale === 1;
}

/** Removes consecutive duplicate points (zero length draws). */
function withoutDuplicates(path: Path): Path
{
    const result: Path = [];
    for (const point of path)
    {
        const last = result[result.length - 1];
        if (!last || last.x !== point.x || last.y !== point.y)
        {
            result.push(point);
        }
    }
    return result;
}

class GerberBuilder
{
    private mDocument: GerberDocument;
    private mArcTolerance: number;
    private mShapeCache = new Map<string, Polygon[]>();
    private mWarnings: GerberWarning[] = [];
    private mReportedApertures = new Set<number>();
    private mImage: Polygon[] = [];

    constructor(document: GerberDocument, options: GerberBuildOptions)
    {
        this.mDocument = document;
        this.mArcTolerance = options.arcTolerance ?? DEFAULT_ARC_TOLERANCE;
    }

    public build(onProgress?: (fraction: number) => void): GerberGeometry
    {
        const objects = this.mDocument.objects;
        let batch: Batch | null = null;
        for (let i = 0; i < objects.length; i++)
        {
            const object = objects[i];
            if (!object)
            {
                continue;
            }
            if (!batch || batch.polarity !== object.polarity)
            {
                if (batch)
                {
                    this.flush(batch);
                }
                batch = { polarity: object.polarity, shapes: [], strokes: new Map() };
            }
            switch (object.kind)
            {
                case "flash":
                    this.addFlash(object, batch);
                    break;
                case "track":
                    this.addTrack(object, batch);
                    break;
                case "region":
                    for (const contour of object.contours)
                    {
                        batch.shapes.push({ outer: withOrientation(contour, true), holes: [] });
                    }
                    break;
            }
            if (onProgress && i % PROGRESS_STEP === 0)
            {
                // Collecting shapes is quick: the unions done in flush() take most of the time
                onProgress(0.2 * (i / objects.length));
            }
        }
        if (batch)
        {
            this.flush(batch);
        }
        onProgress?.(1);
        return { copper: this.mImage, warnings: this.mWarnings };
    }

    private warnAperture(code: number, line: number, detail: string): void
    {
        if (!this.mReportedApertures.has(code))
        {
            this.mReportedApertures.add(code);
            this.mWarnings.push({ code: "apertureShape", line, detail });
        }
    }

    /** Shape of an aperture with its transform, centred on the origin; null when the aperture is undefined. */
    private shapeOf(code: number, transform: ApertureTransform, line: number): Polygon[] | null
    {
        const key = `${code}|${transform.mirrorX}|${transform.mirrorY}|${transform.rotation}|${transform.scale}`;
        const cached = this.mShapeCache.get(key);
        if (cached)
        {
            return cached;
        }
        const aperture = this.mDocument.apertures.get(code);
        if (!aperture)
        {
            this.warnAperture(code, line, `Aperture D${code} is not defined: its objects are ignored`);
            return null;
        }
        const result = apertureShape(aperture.template, this.mDocument.macros,
            { unit: this.mDocument.unit, arcTolerance: this.mArcTolerance });
        for (const warning of result.warnings)
        {
            this.mWarnings.push({ code: "apertureShape", line: aperture.line, detail: warning });
        }
        const shape = isDefaultTransform(transform) ? result.polygons : transformPolygons(result.polygons, apertureMatrix(transform));
        this.mShapeCache.set(key, shape);
        return shape;
    }

    private addFlash(flash: FlashObject, batch: Batch): void
    {
        const shape = this.shapeOf(flash.aperture, flash.transform, flash.line);
        if (shape && shape.length > 0)
        {
            batch.shapes.push(...translatePolygons(shape, flash.point.x, flash.point.y));
        }
    }

    private addTrack(track: TrackObject, batch: Batch): void
    {
        const aperture = this.mDocument.apertures.get(track.aperture);
        const path = withoutDuplicates(track.path);
        if (!aperture)
        {
            this.shapeOf(track.aperture, track.transform, track.line);
            return;
        }
        const width = strokeWidth(aperture.template);
        if (width !== null)
        {
            const scaled = width * track.transform.scale;
            if (scaled > 0)
            {
                const lines = batch.strokes.get(scaled) ?? [];
                lines.push(path);
                batch.strokes.set(scaled, lines);
            }
            return;
        }

        // Other apertures: sweep the shape along each segment (exact Minkowski sum for convex shapes)
        const shape = this.shapeOf(track.aperture, track.transform, track.line);
        if (!shape || shape.length === 0)
        {
            return;
        }
        if (aperture.template.kind === "macro" || aperture.template.hole)
        {
            this.warnAperture(track.aperture, track.line,
                `Aperture D${track.aperture} is not a plain circle or rectangle: tracks use its convex outline`);
        }
        const outline = shape.flatMap((polygon) => polygon.outer);
        if (path.length === 1)
        {
            const point = path[0] as Point;
            batch.shapes.push(...translatePolygons(shape, point.x, point.y));
            return;
        }
        for (let i = 1; i < path.length; i++)
        {
            const from = path[i - 1] as Point;
            const to = path[i] as Point;
            const points = outline.map((point) => ({ x: point.x + from.x, y: point.y + from.y }));
            for (const point of outline)
            {
                points.push({ x: point.x + to.x, y: point.y + to.y });
            }
            batch.shapes.push({ outer: convexHull(points), holes: [] });
        }
    }

    private flush(batch: Batch): void
    {
        const shapes = batch.shapes;
        for (const [width, lines] of batch.strokes)
        {
            shapes.push(...strokePolylines(lines, width, { arcTolerance: this.mArcTolerance }));
        }
        if (shapes.length === 0)
        {
            return;
        }
        // Only the part of the image the batch can touch is recomputed: step and repeat copies and separate
        // areas of the board are not merged again at every polarity change
        const batchBox = bboxOfPolygons(shapes);
        const touched: Polygon[] = [];
        const untouched: Polygon[] = [];
        for (const polygon of this.mImage)
        {
            (bboxIntersects(bboxOfPolygons([polygon]), batchBox) ? touched : untouched).push(polygon);
        }
        if (batch.polarity === "dark")
        {
            this.mImage = untouched.concat(unionPolygons(touched.length === 0 ? shapes : [...touched, ...shapes]));
        }
        else if (touched.length > 0)
        {
            this.mImage = untouched.concat(differencePolygons(touched, shapes));
        }
    }
}

/** Builds the copper image of a parsed document. This is the expensive step: run it in a worker. */
export function buildGerberGeometry(document: GerberDocument, options: GerberBuildOptions = {}): GerberGeometry
{
    return new GerberBuilder(document, options).build(options.onProgress);
}
