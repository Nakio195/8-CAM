// Main thread side of the import worker: one worker per job, so cancelling is simply terminating it.

import type { ImportedFile } from "@project/importedFile";
import type { ImportRequest, ImportResponse, ImportStage } from "./protocol";

export interface ImportJob
{
    promise: Promise<ImportedFile>;
    cancel: () => void;
}

export class ImportCancelledError extends Error
{
    constructor()
    {
        super("Import cancelled");
    }
}

let nextId = 1;

export function startImport(fileName: string, text: string,
    onProgress: (stage: ImportStage, fraction: number) => void = () => undefined): ImportJob
{
    const worker = new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" });
    const id = nextId++;
    let rejectJob: (error: Error) => void = () => undefined;
    const promise = new Promise<ImportedFile>((resolve, reject) =>
    {
        rejectJob = reject;
        worker.onmessage = (event: MessageEvent<ImportResponse>) =>
        {
            const response = event.data;
            if (response.id !== id)
            {
                return;
            }
            if (response.kind === "progress")
            {
                onProgress(response.stage, response.fraction);
                return;
            }
            worker.terminate();
            if (response.kind === "result")
            {
                resolve(response.file);
            }
            else
            {
                reject(new Error(response.message));
            }
        };
        worker.onerror = (event) =>
        {
            worker.terminate();
            reject(new Error(event.message || "Import worker failed"));
        };
    });
    const request: ImportRequest = { id, fileName, text };
    worker.postMessage(request);
    return {
        promise,
        cancel: () =>
        {
            worker.terminate();
            rejectJob(new ImportCancelledError());
        }
    };
}
