// Machine-independent toolpath (specification 6.7): every operation produces a list of moves, translated into G-code
// by a post-processor (src/post). Coordinates in millimetres, Z = 0 at the copper surface, positive upwards.

export type Move =
    | { kind: "rapid"; x?: number; y?: number; z?: number }
    | { kind: "linear"; x?: number; y?: number; z?: number; feed: number }
    | { kind: "arc"; cw: boolean; x: number; y: number; i: number; j: number; feed: number }
    | { kind: "toolChange"; toolId: string }
    | { kind: "spindle"; on: boolean; rpm?: number }
    | { kind: "dwell"; seconds: number }
    | { kind: "comment"; text: string };

export interface MachinePosition
{
    x: number;
    y: number;
    z: number;
}

/**
 * Rapid speed assumed for time estimates when no machine profile is given (the user interface passes the rapid speed
 * of the active machine): a cautious value for a 3018 CNC, mm/min, the same in XY and Z.
 */
export const DEFAULT_RAPID_FEED = 1000;

export interface MoveStatistics
{
    /** Length cut at feed rate, mm. */
    cutLength: number;
    /** Length of rapid moves, mm. */
    rapidLength: number;
    /** Estimated duration, seconds (no acceleration model). */
    duration: number;
    plunges: number;
}

/** Walks the moves to measure cut and rapid lengths and estimate the machining time. */
export function moveStatistics(moves: readonly Move[], rapidFeed = DEFAULT_RAPID_FEED,
    start: MachinePosition = { x: 0, y: 0, z: 0 }): MoveStatistics
{
    let position = { ...start };
    let cutLength = 0;
    let rapidLength = 0;
    let minutes = 0;
    let plunges = 0;
    for (const move of moves)
    {
        if (move.kind === "rapid" || move.kind === "linear")
        {
            const next = { x: move.x ?? position.x, y: move.y ?? position.y, z: move.z ?? position.z };
            const length = Math.hypot(next.x - position.x, next.y - position.y, next.z - position.z);
            if (move.kind === "rapid")
            {
                rapidLength += length;
                minutes += length / rapidFeed;
            }
            else
            {
                cutLength += length;
                minutes += move.feed > 0 ? length / move.feed : 0;
                if (next.z < position.z && next.x === position.x && next.y === position.y)
                {
                    plunges++;
                }
            }
            position = next;
        }
        else if (move.kind === "arc")
        {
            const centre = { x: position.x + move.i, y: position.y + move.j };
            const radius = Math.hypot(move.i, move.j);
            let sweep = Math.atan2(move.y - centre.y, move.x - centre.x) - Math.atan2(position.y - centre.y, position.x - centre.x);
            if (move.cw && sweep >= 0)
            {
                sweep -= 2 * Math.PI;
            }
            else if (!move.cw && sweep <= 0)
            {
                sweep += 2 * Math.PI;
            }
            const length = Math.abs(sweep) * radius;
            cutLength += length;
            minutes += move.feed > 0 ? length / move.feed : 0;
            position = { ...position, x: move.x, y: move.y };
        }
        else if (move.kind === "dwell")
        {
            minutes += move.seconds / 60;
        }
    }
    return { cutLength, rapidLength, duration: minutes * 60, plunges };
}

/** A rapid move that goes sideways while the tool is below this height (mm) is unsafe (specification section 7). */
export interface SafetyIssue
{
    index: number;
    reason: "rapidBelowTravel" | "rapidIntoMaterial" | "toolChangeBelowSafe" | "endBelowSafe";
}

/**
 * Machine safety rules of section 7 applied to a move list: horizontal rapids only at or above travelZ, never a rapid
 * downwards below the surface, tool changes and the end of the program at safeZ or above.
 */
export function checkMoves(moves: readonly Move[], travelZ: number, safeZ: number,
    start: MachinePosition = { x: 0, y: 0, z: safeZ }): SafetyIssue[]
{
    const issues: SafetyIssue[] = [];
    let position = { ...start };
    const tolerance = 1e-9;
    moves.forEach((move, index) =>
    {
        if (move.kind === "rapid")
        {
            const next = { x: move.x ?? position.x, y: move.y ?? position.y, z: move.z ?? position.z };
            const horizontal = next.x !== position.x || next.y !== position.y;
            if (horizontal && Math.min(position.z, next.z) < travelZ - tolerance)
            {
                issues.push({ index, reason: "rapidBelowTravel" });
            }
            if (next.z < -tolerance)
            {
                issues.push({ index, reason: "rapidIntoMaterial" });
            }
            position = next;
        }
        else if (move.kind === "linear")
        {
            position = { x: move.x ?? position.x, y: move.y ?? position.y, z: move.z ?? position.z };
        }
        else if (move.kind === "arc")
        {
            position = { ...position, x: move.x, y: move.y };
        }
        else if (move.kind === "toolChange" && position.z < safeZ - tolerance)
        {
            issues.push({ index, reason: "toolChangeBelowSafe" });
        }
    });
    if (position.z < safeZ - tolerance)
    {
        issues.push({ index: moves.length, reason: "endBelowSafe" });
    }
    return issues;
}
