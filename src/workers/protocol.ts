// Messages exchanged with the import worker.
// Cancellation is done by terminating the worker: a worker busy in a synchronous computation cannot read messages.

import type { ImportedFile } from "@project/importedFile";

export type ImportStage = "parsing" | "building" | "analysing";

export interface ImportRequest
{
    id: number;
    fileName: string;
    text: string;
}

export type ImportResponse =
    | { id: number; kind: "progress"; stage: ImportStage; fraction: number }
    | { id: number; kind: "result"; file: ImportedFile }
    | { id: number; kind: "error"; message: string };

/** Reply of a computation worker: progress messages, then one result or error. */
export type WorkerReply<Result> =
    | { id: number; kind: "progress"; fraction: number }
    | { id: number; kind: "result"; value: Result }
    | { id: number; kind: "error"; message: string };
