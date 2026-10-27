// Messages exchanged with the import worker.
// Cancellation is done by terminating the worker: a worker busy in a synchronous computation cannot read messages.

import type { ImportedFile } from "@project/importedFile";

export type ImportStage = "parsing" | "building";

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
