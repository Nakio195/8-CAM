// Thin wrapper around clipper2-ts: the rest of the code only sees our Polygon / Path types,
// so the library can be swapped for clipper2-wasm without touching callers (docs/architecture.md section 2.1).

import {
    booleanOpWithPolyTree,
    ClipperOffset,
    ClipType,
    EndType,
    FillRule,
    JoinType,
    PolyTree64,
    rectClip,
    type Paths64,
    type PolyPath64
} from "clipper2-ts";
import { DEFAULT_ARC_TOLERANCE } from "./arc";
import type { BBox } from "./bbox";
import { withOrientation } from "./path";
import type { Path, Polygon, Polyline } from "./types";

export type JoinStyle = "round" | "miter" | "square";
export type EndStyle = "round" | "square" | "butt";
export type FillStyle = "nonzero" | "evenodd";

export interface OffsetOptions
{
    /** Corner style. Round corners are the usual choice for isolation (FlatCAM default). */
    join?: JoinStyle;
    /** Maximum chord error on generated arcs, internal units. */
    arcTolerance?: number;
    /** Miter length limit, in multiples of the offset distance. */
    miterLimit?: number;
}

export interface StrokeOptions extends OffsetOptions
{
    end?: EndStyle;
}

const DEFAULT_MITER_LIMIT = 2;

const JOIN_TYPES: Record<JoinStyle, JoinType> = {
    round: JoinType.Round,
    miter: JoinType.Miter,
    square: JoinType.Square
};

const END_TYPES: Record<EndStyle, EndType> = {
    round: EndType.Round,
    square: EndType.Square,
    butt: EndType.Butt
};

const FILL_RULES: Record<FillStyle, FillRule> = {
    nonzero: FillRule.NonZero,
    evenodd: FillRule.EvenOdd
};

/** Flattens polygons into Clipper rings with outer rings counter-clockwise and holes clockwise. */
function toPaths(polygons: readonly Polygon[]): Paths64
{
    const paths: Paths64 = [];
    for (const polygon of polygons)
    {
        paths.push(withOrientation(polygon.outer, true));
        for (const hole of polygon.holes)
        {
            paths.push(withOrientation(hole, false));
        }
    }
    return paths;
}

/**
 * Converts a Clipper PolyTree to polygons with holes. Islands nested inside a hole become separate polygons.
 */
function collectPolygons(node: PolyPath64, output: Polygon[]): void
{
    for (let i = 0; i < node.count; i++)
    {
        const outerNode = node.child(i);
        const polygon: Polygon = { outer: outerNode.poly ?? [], holes: [] };
        for (let j = 0; j < outerNode.count; j++)
        {
            const holeNode = outerNode.child(j);
            polygon.holes.push(holeNode.poly ?? []);
            collectPolygons(holeNode, output);
        }
        output.push(polygon);
    }
}

function treeToPolygons(tree: PolyTree64): Polygon[]
{
    const polygons: Polygon[] = [];
    collectPolygons(tree, polygons);
    return polygons;
}

function booleanOperation(clipType: ClipType, subject: Paths64, clip: Paths64 | null, fillRule: FillRule): Polygon[]
{
    const tree = new PolyTree64();
    booleanOpWithPolyTree(clipType, subject, clip, tree, fillRule);
    return treeToPolygons(tree);
}

/** Merges overlapping polygons (Shapely unary_union equivalent). */
export function unionPolygons(polygons: readonly Polygon[]): Polygon[]
{
    return booleanOperation(ClipType.Union, toPaths(polygons), null, FillRule.NonZero);
}

/**
 * Builds polygons from raw closed rings of unknown orientation (Gerber regions, imported outlines).
 * With "evenodd", nested rings alternate between filled and empty; with "nonzero", orientation decides.
 */
export function polygonsFromRings(rings: readonly Path[], fill: FillStyle = "evenodd"): Polygon[]
{
    return booleanOperation(ClipType.Union, [...rings], null, FILL_RULES[fill]);
}

/** Subject minus clip (Gerber clear polarity, cutout gaps). */
export function differencePolygons(subject: readonly Polygon[], clip: readonly Polygon[]): Polygon[]
{
    return booleanOperation(ClipType.Difference, toPaths(subject), toPaths(clip), FillRule.NonZero);
}

/**
 * Part of the polygons inside an axis-aligned box. Linear in the number of points, much faster than a general
 * intersection: used to cut a huge polygon (a ground pour) down to the area that matters before other operations.
 */
export function clipToBox(polygons: readonly Polygon[], box: BBox): Polygon[]
{
    if (box.minX >= box.maxX || box.minY >= box.maxY)
    {
        return [];
    }
    const paths = rectClip({ left: box.minX, top: box.minY, right: box.maxX, bottom: box.maxY }, toPaths(polygons));
    // Rings keep their orientation, so the non-zero rule rebuilds outer rings and holes
    return booleanOperation(ClipType.Union, paths, null, FillRule.NonZero);
}

export function intersectPolygons(subject: readonly Polygon[], clip: readonly Polygon[]): Polygon[]
{
    return booleanOperation(ClipType.Intersection, toPaths(subject), toPaths(clip), FillRule.NonZero);
}

/**
 * Grows (delta > 0) or shrinks (delta < 0) polygons by delta internal units; holes move the other way.
 * Equivalent of Shapely buffer() used by FlatCAM (camlib.Geometry.isolation_geometry).
 * The result is already merged: overlapping grown shapes come out as one polygon.
 */
export function offsetPolygons(polygons: readonly Polygon[], delta: number, options: OffsetOptions = {}): Polygon[]
{
    if (delta === 0)
    {
        return unionPolygons(polygons);
    }
    const offset = new ClipperOffset(options.miterLimit ?? DEFAULT_MITER_LIMIT,
        options.arcTolerance ?? DEFAULT_ARC_TOLERANCE);
    offset.addPaths(toPaths(polygons), JOIN_TYPES[options.join ?? "round"], EndType.Polygon);
    const tree = new PolyTree64();
    offset.execute(delta, tree);
    return treeToPolygons(tree);
}

/**
 * Turns open paths into filled shapes of the given width (Gerber tracks drawn with a circular aperture).
 * A single-point path with round ends gives a disc.
 */
export function strokePolylines(lines: readonly Polyline[], width: number, options: StrokeOptions = {}): Polygon[]
{
    if (width <= 0 || lines.length === 0)
    {
        return [];
    }
    const offset = new ClipperOffset(options.miterLimit ?? DEFAULT_MITER_LIMIT,
        options.arcTolerance ?? DEFAULT_ARC_TOLERANCE);
    offset.addPaths([...lines], JOIN_TYPES[options.join ?? "round"], END_TYPES[options.end ?? "round"]);
    const tree = new PolyTree64();
    offset.execute(width / 2, tree);
    return treeToPolygons(tree);
}

/** All rings of the polygons (outer rings then holes), e.g. to turn an offset outline into toolpaths. */
export function polygonRings(polygons: readonly Polygon[]): Path[]
{
    return polygons.flatMap((polygon) => [polygon.outer, ...polygon.holes]);
}
