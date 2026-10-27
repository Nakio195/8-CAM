import type { Path, Point } from "./types";

/**
 * Default maximum distance between a true arc and its chords: 50 internal units = 0.5 µm,
 * below the 1 µm precision target of the specification (section 8).
 * FlatCAM uses a fixed number of steps per circle instead (camlib.arc, steps_per_circ);
 * a chord tolerance keeps small pads and large arcs equally accurate.
 */
export const DEFAULT_ARC_TOLERANCE = 50;

/** Even a tiny circle is drawn with at least this many segments. */
export const MIN_SEGMENTS_PER_CIRCLE = 8;

const TWO_PI = 2 * Math.PI;

/** Number of chords needed so that an arc of the given radius and sweep stays within tolerance. */
export function arcSegmentCount(radius: number, sweep: number, tolerance = DEFAULT_ARC_TOLERANCE): number
{
    const absSweep = Math.abs(sweep);
    if (radius <= 0 || absSweep === 0)
    {
        return 1;
    }
    let step = TWO_PI / MIN_SEGMENTS_PER_CIRCLE;
    if (tolerance < radius)
    {
        // Sagitta of a chord spanning angle a: r * (1 - cos(a / 2))
        step = Math.min(step, 2 * Math.acos(1 - tolerance / radius));
    }
    // The small epsilon avoids an extra segment when the sweep is an exact multiple of the step
    return Math.max(1, Math.ceil(absSweep / step - 1e-9));
}

/**
 * Points of an arc from startAngle, sweeping by sweep radians (positive = counter-clockwise),
 * including both end points, rounded to integer coordinates.
 */
export function arcPoints(center: Point, radius: number, startAngle: number, sweep: number,
    tolerance = DEFAULT_ARC_TOLERANCE): Path
{
    const segments = arcSegmentCount(radius, sweep, tolerance);
    const points: Path = [];
    for (let i = 0; i <= segments; i++)
    {
        const angle = startAngle + (sweep * i) / segments;
        points.push({
            x: Math.round(center.x + radius * Math.cos(angle)),
            y: Math.round(center.y + radius * Math.sin(angle))
        });
    }
    return points;
}

/** Full circle as a counter-clockwise closed ring, vertices on the circle. */
export function circlePath(center: Point, radius: number, tolerance = DEFAULT_ARC_TOLERANCE): Path
{
    const points = arcPoints(center, radius, 0, TWO_PI, tolerance);
    // The last point duplicates the first one: closed rings do not repeat it
    points.pop();
    return points;
}

/**
 * Signed sweep from start to end around center (positive = counter-clockwise).
 * When start and end coincide the result is a full turn if fullCircle is true, zero otherwise.
 */
export function arcSweep(start: Point, end: Point, center: Point, clockwise: boolean, fullCircle = true): number
{
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    let sweep = endAngle - startAngle;
    if (start.x === end.x && start.y === end.y)
    {
        if (!fullCircle)
        {
            return 0;
        }
        return clockwise ? -TWO_PI : TWO_PI;
    }
    if (clockwise && sweep >= 0)
    {
        sweep -= TWO_PI;
    }
    else if (!clockwise && sweep <= 0)
    {
        sweep += TWO_PI;
    }
    return sweep;
}

/**
 * Discretises a circular arc going from start to end around center, as in Gerber G02 / G03.
 * The first and last points are exactly start and end. When the start and end radii differ slightly
 * (rounding in the source file) the radius is interpolated along the arc.
 */
export function arcBetween(start: Point, end: Point, center: Point, clockwise: boolean,
    tolerance = DEFAULT_ARC_TOLERANCE, fullCircle = true): Path
{
    const sweep = arcSweep(start, end, center, clockwise, fullCircle);
    if (sweep === 0)
    {
        return [{ ...start }, { ...end }];
    }
    const startRadius = Math.hypot(start.x - center.x, start.y - center.y);
    const endRadius = Math.hypot(end.x - center.x, end.y - center.y);
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const segments = arcSegmentCount(Math.max(startRadius, endRadius), sweep, tolerance);

    const points: Path = [{ ...start }];
    for (let i = 1; i < segments; i++)
    {
        const ratio = i / segments;
        const angle = startAngle + sweep * ratio;
        const radius = startRadius + (endRadius - startRadius) * ratio;
        points.push({
            x: Math.round(center.x + radius * Math.cos(angle)),
            y: Math.round(center.y + radius * Math.sin(angle))
        });
    }
    points.push({ ...end });
    return points;
}
