// Geometry primitives. Coordinates are integer internal units (see core/units), Y axis pointing up.
// The point shape matches Clipper2's Point64 so paths are handed to Clipper without copying.

export interface Point
{
    x: number;
    y: number;
}

/** Ordered list of points. Closed rings do not repeat their first point at the end. */
export type Path = Point[];

/**
 * Filled polygon with optional holes.
 * Normalised orientation: outer ring counter-clockwise (positive area), holes clockwise.
 */
export interface Polygon
{
    outer: Path;
    holes: Path[];
}

/** Open path (track centre line, toolpath). */
export type Polyline = Path;
