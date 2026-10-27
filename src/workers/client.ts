// Main thread side of the import worker: one worker per job, so cancelling is simply terminating it.

import type { ImportedFile } from "@project/importedFile";
import type { IsolationOutput, IsolationRequestData } from "@project/operations";
import type { ImportRequest, ImportResponse, ImportStage, WorkerReply } from "./protocol";

export interface ImportJob
{
    promise: Promise<ImportedFile>;
    cancel: () => void;
}

/** Rejection of a job cancelled by the user (import or computation). */
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

export interface WorkerJob<Result>
{
    promise: Promise<Result>;
    cancel: () => void;
}

/** Runs one request in a dedicated worker, terminated when done or cancelled. */
function runInWorker<Result>(worker: Worker, data: unknown, onProgress: (fraction: number) => void): WorkerJob<Result>
{
    const id = nextId++;
    let rejectJob: (error: Error) => void = () => undefined;
    const promise = new Promise<Result>((resolve, reject) =>
    {
        rejectJob = reject;
        worker.onmessage = (event: MessageEvent<WorkerReply<Result>>) =>
        {
            const reply = event.data;
            if (reply.id !== id)
            {
                return;
            }
            if (reply.kind === "progress")
            {
                onProgress(reply.fraction);
                return;
            }
            worker.terminate();
            if (reply.kind === "result")
            {
                resolve(reply.value);
            }
            else
            {
                reject(new Error(reply.message));
            }
        };
        worker.onerror = (event) =>
        {
            worker.terminate();
            reject(new Error(event.message || "Worker failed"));
        };
    });
    worker.postMessage({ id, data });
    return {
        promise,
        cancel: () =>
        {
            worker.terminate();
            rejectJob(new ImportCancelledError());
        }
    };
}

/** Isolation toolpaths of one layer with one tool, in the CAM worker. */
export function startIsolation(data: IsolationRequestData, onProgress: (fraction: number) => void = () => undefined): WorkerJob<IsolationOutput>
{
    // The worker URL must stay literal here for the bundler to emit the worker file
    return runInWorker<IsolationOutput>(new Worker(new URL("./cam.worker.ts", import.meta.url), { type: "module" }), data, onProgress);
}
