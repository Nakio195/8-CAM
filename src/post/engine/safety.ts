// Machine safety checks of specification section 7 on a job and on the G-code written for it: rapids, tool changes and
// the end of the program at safe heights, the work within the machine travel, and feeds, speeds, depths and diameters
// that look wrong for a PCB.

import { checkMoves, type SafetyIssue } from "@cam/toolpath/index";
import type { MachineProfile } from "../machine";
import { readGcode } from "./reader";
import { movesExtent, type PostJob } from "./writer";

/** Deeper than this below the board surface is never needed for a PCB (mm). */
export const ABERRANT_DEPTH = 3;
/** Feeds below this (mm/min) are almost certainly a typing mistake. */
export const ABERRANT_FEED = 5;
/** Tool diameters outside this range (mm) are almost certainly a typing mistake. */
export const ABERRANT_DIAMETER = { min: 0.01, max: 10 };

export type JobIssueCode =
    | SafetyIssue["reason"]
    | "tooWideForMachine"
    | "tooDeepForMachine"
    | "safeAboveMachine"
    | "feedAboveMachine"
    | "spindleAboveMachine"
    | "spindleBelowMachine"
    | "depthAberrant"
    | "feedAberrant"
    | "diameterAberrant";

export interface JobIssue
{
    code: JobIssueCode;
    /** Operation concerned (index in the job), or null for the whole job. */
    operation: number | null;
    /** Errors make the G-code unsafe; warnings ask the user to check a value. */
    severity: "error" | "warning";
}

/** Checks the moves and parameters of a job against the rules of section 7 and the machine. */
export function checkJob(job: PostJob, machine: MachineProfile): JobIssue[]
{
    const issues: JobIssue[] = [];
    const add = (code: JobIssueCode, operation: number | null, severity: JobIssue["severity"]): void =>
    {
        if (!issues.some((issue) => issue.code === code && issue.operation === operation))
        {
            issues.push({ code, operation, severity });
        }
    };
    job.operations.forEach((operation, index) =>
    {
        const tool = operation.tool;
        for (const issue of checkMoves(operation.moves, tool.travelZ, tool.safeZ))
        {
            add(issue.reason, index, "error");
        }
        if (tool.safeZ > machine.travelZ)
        {
            add("safeAboveMachine", index, "error");
        }
        if (tool.feedXY > machine.maxFeedXY || tool.feedZ > machine.maxFeedZ)
        {
            add("feedAboveMachine", index, "warning");
        }
        if (tool.spindleSpeed > machine.maxSpindleSpeed)
        {
            add("spindleAboveMachine", index, "warning");
        }
        if (tool.spindleSpeed < (machine.minSpindleSpeed ?? 0))
        {
            add("spindleBelowMachine", index, "warning");
        }
        if (tool.diameter < ABERRANT_DIAMETER.min || tool.diameter > ABERRANT_DIAMETER.max)
        {
            add("diameterAberrant", index, "warning");
        }
        let deepest = 0;
        for (const move of operation.moves)
        {
            if (move.kind === "linear" || move.kind === "arc")
            {
                if (move.feed < ABERRANT_FEED)
                {
                    add("feedAberrant", index, "warning");
                }
            }
            if ((move.kind === "linear" || move.kind === "rapid") && move.z !== undefined)
            {
                deepest = Math.min(deepest, move.z);
            }
        }
        if (-deepest > ABERRANT_DEPTH)
        {
            add("depthAberrant", index, "warning");
        }
        if (-deepest + tool.safeZ > machine.travelZ)
        {
            add("tooDeepForMachine", index, "error");
        }
    });
    const extent = movesExtent(job.operations);
    if (extent && (extent.xMax - extent.xMin > machine.travelX || extent.yMax - extent.yMin > machine.travelY))
    {
        add("tooWideForMachine", null, "error");
    }
    return issues;
}

/**
 * Safety rules applied to the G-code text itself, read back: no rapid sideways below the lowest travel height, no
 * rapid into the material, tool changes and the end of the program at safe height or above.
 */
export function checkGcode(text: string, travelZ: number, safeZ: number): SafetyIssue[]
{
    return checkMoves(readGcode(text).moves, travelZ, safeZ);
}
