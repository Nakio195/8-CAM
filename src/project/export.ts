// G-code export of a project: what the CAM worker needs and what it gives back (files, checks, simulation).

import type { Move, SafetyIssue } from "@cam/toolpath/index";
import type { Tool } from "@cam/tools/index";
import type { PackedPolygons } from "@core/geometry/index";
import type { BoardFrame, JobIssue, JobSetup, MachineProfile, PostProfile } from "@post/index";

/** One operation to export: isolation loops in cutting order (closed, internal units) or ready moves (mm). */
export interface ExportOperationData
{
    label: string;
    toolLabel: string;
    tool: Tool;
    loops?: PackedPolygons;
    moves?: Move[];
}

export interface ExportRequestData
{
    /** Base of the file names, without extension. */
    name: string;
    /** Date written in the headers, ms since 1970. */
    date: number;
    version: string;
    operations: ExportOperationData[];
    profile: PostProfile;
    machine: MachineProfile;
    setup: JobSetup;
    /** Board rectangle (Gerber mm) the origin is taken from. */
    frame: BoardFrame;
    /** One file per operation (a tool change by hand between files) instead of one file. */
    split: boolean;
}

export interface ExportFile
{
    name: string;
    text: string;
    lineCount: number;
    /** Estimated machining time, seconds. */
    duration: number;
}

/**
 * Tool path of the written G-code, read back and placed over the board (Gerber mm), for the simulation:
 * point i ends a move of kind i, reached at time i.
 */
export interface Backplot
{
    /** x, y, z of each point. */
    points: Float64Array;
    /** 0: rapid, 1: cut, for the move ending at each point. */
    kinds: Uint8Array;
    /** Seconds from the start when each point is reached. */
    times: Float64Array;
    /** Index of the first point of each file. */
    fileStarts: number[];
}

export interface ExportOutput
{
    files: ExportFile[];
    /** Checks of the job against the machine (section 7). */
    issues: JobIssue[];
    /** Safety rules broken in the written text, read back (none expected). */
    textIssues: SafetyIssue["reason"][];
    forbidden: { file: string; word: string; line: number }[];
    backplot: Backplot;
    /** Extent of the moves on the machine, mm. */
    extent: { xMin: number; xMax: number; yMin: number; yMax: number } | null;
    computeMs: number;
}
