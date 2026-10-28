// Placement of the job on the machine (specification 6.9): which point of the board is the machine zero, and the
// mirror used to mill the bottom side of a board turned over. Applied to the moves just before writing G-code.

import type { Move } from "@cam/toolpath/index";

/** Lower left corner of the board (simplest to set on the machine), its centre, or the origin of the Gerber files. */
export type OriginChoice = "lowerLeft" | "center" | "gerber";

export interface JobSetup
{
    origin: OriginChoice;
    /** Mirror left to right, for the bottom side milled with the board turned over (seen from below). */
    mirror: boolean;
}

export const DEFAULT_SETUP: Readonly<JobSetup> = { origin: "lowerLeft", mirror: false };

/** Rectangle of the board in Gerber coordinates, mm. */
export interface BoardFrame
{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** x' = (mirror ? axis2 - x : x) - dx, y' = y - dy: Gerber millimetres to machine millimetres. */
export interface SetupTransform
{
    mirror: boolean;
    /** Twice the X of the vertical mirror axis. */
    axis2: number;
    dx: number;
    dy: number;
}

/**
 * Transform of a setup: the board is mirrored about its own vertical centre line (so it stays where it is), or about
 * the Gerber Y axis when the Gerber origin is kept; then the chosen origin moves to (0, 0).
 */
export function setupTransform(frame: BoardFrame, setup: JobSetup): SetupTransform
{
    const axis2 = setup.origin === "gerber" ? 0 : frame.minX + frame.maxX;
    const minX = setup.mirror ? axis2 - frame.maxX : frame.minX;
    const maxX = setup.mirror ? axis2 - frame.minX : frame.maxX;
    switch (setup.origin)
    {
        case "lowerLeft":
            return { mirror: setup.mirror, axis2, dx: minX, dy: frame.minY };
        case "center":
            return { mirror: setup.mirror, axis2, dx: (minX + maxX) / 2, dy: (frame.minY + frame.maxY) / 2 };
        case "gerber":
            return { mirror: setup.mirror, axis2, dx: 0, dy: 0 };
    }
}

export function transformPoint(point: { x: number; y: number }, transform: SetupTransform): { x: number; y: number }
{
    return { x: (transform.mirror ? transform.axis2 - point.x : point.x) - transform.dx, y: point.y - transform.dy };
}

/** Machine point back to Gerber coordinates (to draw the simulation over the board). */
export function inversePoint(point: { x: number; y: number }, transform: SetupTransform): { x: number; y: number }
{
    const x = point.x + transform.dx;
    return { x: transform.mirror ? transform.axis2 - x : x, y: point.y + transform.dy };
}

/** Moves placed on the machine. A mirror reverses arcs and the milling direction (climb becomes conventional). */
export function transformMoves(moves: readonly Move[], transform: SetupTransform): Move[]
{
    const x = (value: number): number => (transform.mirror ? transform.axis2 - value : value) - transform.dx;
    return moves.map((move): Move =>
    {
        switch (move.kind)
        {
            case "rapid":
            case "linear":
                return {
                    ...move,
                    ...(move.x !== undefined ? { x: x(move.x) } : {}),
                    ...(move.y !== undefined ? { y: move.y - transform.dy } : {})
                };
            case "arc":
                return { ...move, x: x(move.x), y: move.y - transform.dy, i: transform.mirror ? -move.i : move.i, cw: transform.mirror ? !move.cw : move.cw };
            default:
                return move;
        }
    });
}
