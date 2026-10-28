// G-code export, run in the CAM worker (pure function, also usable in tests): moves of every operation placed on the
// machine (origin, mirror), written with the profile of the machine, checked, and read back for the simulation.

import { segmentsToMoves, type Move } from "@cam/toolpath/index";
import { unpackPolygons } from "@core/geometry/index";
import {
    checkGcode,
    checkJob,
    DEFAULT_FILE_EXTENSION,
    inversePoint,
    movesExtent,
    readGcode,
    sanitizeComment,
    setupTransform,
    transformMoves,
    writeGcode,
    type PostJob,
    type PostOperation,
    type SetupTransform
} from "@post/index";
import type { Backplot, ExportFile, ExportOutput, ExportRequestData } from "@project/export";

const ARC_STEPS = 24;

/** Moves of an operation in Gerber millimetres, in the milling direction chosen before any mirror. */
function operationMoves(operation: ExportRequestData["operations"][number], mirror: boolean): Move[]
{
    if (operation.moves)
    {
        return operation.moves;
    }
    const loops = operation.loops ? unpackPolygons(operation.loops) : [];
    // A mirror reverses every loop: reversing them first keeps climb and conventional milling as chosen
    const segments = loops.map((polygon) => ({ points: mirror ? [...polygon.outer].reverse() : polygon.outer, closed: true }));
    return segmentsToMoves(segments, { ...operation.tool, toolId: operation.tool.id }, operation.label);
}

/** Durations follow moveStatistics: rapids at the machine rapid speed, cuts at their feed, dwells as written. */
function backplotOf(texts: readonly string[], transform: SetupTransform, rapidFeed: number, startZ: number): Backplot
{
    const points: number[] = [];
    const kinds: number[] = [];
    const times: number[] = [];
    const fileStarts: number[] = [];
    let position = { x: 0, y: 0, z: startZ };
    let time = 0;
    const push = (next: { x: number; y: number; z: number }, kind: number, feed: number): void =>
    {
        const length = Math.hypot(next.x - position.x, next.y - position.y, next.z - position.z);
        time += feed > 0 ? (length / feed) * 60 : 0;
        const board = inversePoint(next, transform);
        points.push(board.x, board.y, next.z);
        kinds.push(kind);
        times.push(time);
        position = next;
    };
    for (const text of texts)
    {
        fileStarts.push(kinds.length);
        for (const move of readGcode(text).moves)
        {
            if (move.kind === "rapid" || move.kind === "linear")
            {
                const next = { x: move.x ?? position.x, y: move.y ?? position.y, z: move.z ?? position.z };
                push(next, move.kind === "rapid" ? 0 : 1, move.kind === "rapid" ? rapidFeed : move.feed);
            }
            else if (move.kind === "arc")
            {
                const centre = { x: position.x + move.i, y: position.y + move.j };
                const radius = Math.hypot(move.i, move.j);
                const start = Math.atan2(position.y - centre.y, position.x - centre.x);
                let sweep = Math.atan2(move.y - centre.y, move.x - centre.x) - start;
                if (move.cw && sweep >= 0)
                {
                    sweep -= 2 * Math.PI;
                }
                else if (!move.cw && sweep <= 0)
                {
                    sweep += 2 * Math.PI;
                }
                for (let i = 1; i <= ARC_STEPS; i++)
                {
                    const angle = start + (sweep * i) / ARC_STEPS;
                    push(i === ARC_STEPS ? { x: move.x, y: move.y, z: position.z } : { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle), z: position.z }, 1, move.feed);
                }
            }
            else if (move.kind === "dwell")
            {
                time += move.seconds;
            }
        }
    }
    return { points: Float64Array.from(points), kinds: Uint8Array.from(kinds), times: Float64Array.from(times), fileStarts };
}

/** Plain ASCII for file names: "V-bit 30° pointe 0,2 mm" gives "V-bit_30deg_pointe_0-2_mm". */
export function fileNamePart(text: string): string
{
    return sanitizeComment(text).replace(/,/g, "-").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Files to write: one; one per operation; or, when the machine sets the Z zero again with each tool (separate files),
 * one per tool, consecutive operations of a tool together, each file saying which tool to mount and which zero to set.
 */
function fileGroups(request: ExportRequestData, operations: PostOperation[]): { name: string; operations: PostOperation[]; notes?: string[] }[]
{
    if (request.machine.toolChangeMode === "separateFiles")
    {
        const groups: PostOperation[][] = [];
        for (const operation of operations)
        {
            const last = groups[groups.length - 1];
            if (last && last[0]?.tool.id === operation.tool.id)
            {
                last.push(operation);
            }
            else
            {
                groups.push([operation]);
            }
        }
        return groups.map((group, index) =>
        {
            const first = group[0] as PostOperation;
            return {
                // Every kind of operation of the file in its name: "Drilling_Cutout" for holes milled then the cutout
                name: `${request.name}-${index + 1}-${[...new Set(group.map((operation) => operation.label.split(" ")[0] ?? ""))].join("_")}-${first.toolLabel}`,
                operations: group,
                notes: [
                    `File ${index + 1} of ${groups.length}: ${group.map((operation) => operation.label).join(", ")}`,
                    `Mount ${first.toolLabel}`,
                    index === 0
                        ? "Set the work origin X, Y and Z with this tool before starting"
                        : "Keep the X and Y origin, set the Z zero again on the board surface with this tool"
                ]
            };
        });
    }
    return request.split
        ? operations.map((operation, index) => ({ name: `${request.name}-${index + 1}-${operation.label}`, operations: [operation] }))
        : [{ name: request.name, operations }];
}

export function runExport(request: ExportRequestData): ExportOutput
{
    const start = performance.now();
    const transform = setupTransform(request.frame, request.setup);
    const operations: PostOperation[] = request.operations.map((operation) => ({
        label: operation.label,
        tool: operation.tool,
        toolLabel: operation.toolLabel,
        moves: transformMoves(operationMoves(operation, request.setup.mirror), transform)
    }));
    const date = new Date(request.date);
    const groups = fileGroups(request, operations);

    const files: ExportFile[] = [];
    const forbidden: ExportOutput["forbidden"] = [];
    const textIssues = new Set<ExportOutput["textIssues"][number]>();
    for (const group of groups)
    {
        const job: PostJob = { name: group.name, operations: group.operations, date, version: request.version, notes: group.notes };
        const output = writeGcode(job, request.profile, request.machine);
        const fileName = `${fileNamePart(group.name)}.${request.profile.fileExtension ?? DEFAULT_FILE_EXTENSION}`;
        for (const entry of output.forbidden)
        {
            forbidden.push({ file: fileName, ...entry });
        }
        const travelZ = Math.min(...group.operations.map((operation) => operation.tool.travelZ));
        const safeZ = Math.max(...group.operations.map((operation) => operation.tool.safeZ));
        for (const issue of checkGcode(output.text, travelZ, safeZ))
        {
            textIssues.add(issue.reason);
        }
        files.push({ name: fileName, text: output.text, lineCount: output.lineCount, duration: 0 });
    }

    const startZ = Math.max(...request.operations.map((operation) => operation.tool.safeZ), request.machine.safeZ);
    const backplot = backplotOf(files.map((file) => file.text), transform, request.machine.rapidFeed, startZ);
    // Duration of each file from the simulation times
    files.forEach((file, index) =>
    {
        const first = backplot.fileStarts[index] ?? 0;
        const next = backplot.fileStarts[index + 1] ?? backplot.kinds.length;
        const before = first > 0 ? (backplot.times[first - 1] ?? 0) : 0;
        file.duration = next > first ? (backplot.times[next - 1] ?? 0) - before : 0;
    });
    return {
        files,
        issues: checkJob({ name: request.name, operations, date, version: request.version }, request.machine),
        textIssues: [...textIssues],
        forbidden,
        backplot,
        extent: movesExtent(operations),
        computeMs: performance.now() - start
    };
}
