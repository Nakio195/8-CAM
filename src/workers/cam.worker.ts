// CAM worker entry point: toolpath computations away from the user interface thread.
// The independent parts of an isolation run in parallel sub-workers; terminating this worker (cancel) ends them too.

import type { IsolationOutput, IsolationRequestData } from "@project/operations";
import { runDrilling } from "./drillingJob";
import {
    assembleIsolationOutput,
    isolationParts,
    runIsolation,
    type IsolationPart,
    type IsolationPartOutput
} from "./isolationJob";
import type { CamRequest, WorkerReply } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

function runPart(data: IsolationRequestData, part: IsolationPart): Promise<IsolationPartOutput>
{
    return new Promise((resolve, reject) =>
    {
        const worker = new Worker(new URL("./camPart.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<WorkerReply<IsolationPartOutput>>) =>
        {
            worker.terminate();
            const reply = event.data;
            if (reply.kind === "result")
            {
                resolve(reply.value);
            }
            else if (reply.kind === "error")
            {
                reject(new Error(reply.message));
            }
        };
        worker.onerror = (event) =>
        {
            worker.terminate();
            reject(new Error(event.message || "Worker failed"));
        };
        worker.postMessage({ id: 0, data, part });
    });
}

/** Parts in parallel, at most one sub-worker per spare processor core. */
async function runInParallel(data: IsolationRequestData, onProgress: (fraction: number) => void): Promise<IsolationOutput>
{
    const start = performance.now();
    const parts = isolationParts(data);
    const outputs: IsolationPartOutput[] = [];
    const limit = Math.max(1, Math.min(parts.length, (navigator.hardwareConcurrency || 2) - 1));
    let next = 0;
    const lane = async (): Promise<void> =>
    {
        while (next < parts.length)
        {
            const part = parts[next++] as IsolationPart;
            outputs.push(await runPart(data, part));
            onProgress(outputs.length / (parts.length + 1));
        }
    };
    await Promise.all(Array.from({ length: limit }, lane));
    const output = assembleIsolationOutput(data, outputs, start);
    onProgress(1);
    return output;
}

scope.onmessage = async (event: MessageEvent<{ id: number; data: CamRequest }>) =>
{
    const { id, data: request } = event.data;
    const onProgress = (fraction: number): void =>
    {
        scope.postMessage({ id, kind: "progress", fraction } satisfies WorkerReply<never>);
    };
    try
    {
        if (request.kind === "drilling")
        {
            const output = runDrilling(request.data);
            onProgress(1);
            scope.postMessage({ id, kind: "result", value: output } satisfies WorkerReply<typeof output>,
                [output.route.buffer, output.fileRoute.buffer, output.milledPaths.buffer]);
            return;
        }
        const data = request.data;
        // Browsers without nested workers compute the parts one after the other
        const output = typeof Worker === "undefined" ? runIsolation(data, onProgress) : await runInParallel(data, onProgress);
        scope.postMessage({ id, kind: "result", value: output } satisfies WorkerReply<typeof output>,
            [output.loops.buffer, output.travels.buffer, output.zoneShapes.buffer]);
    }
    catch (error)
    {
        scope.postMessage({ id, kind: "error", message: error instanceof Error ? error.message : String(error) } satisfies WorkerReply<never>);
    }
};
