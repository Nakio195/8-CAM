// Sub-worker of the CAM worker: computes one independent part of an isolation (the passes or the non-isolated areas).

import type { IsolationRequestData } from "@project/operations";
import { runIsolationPart, type IsolationPart } from "./isolationJob";
import type { WorkerReply } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<{ id: number; data: IsolationRequestData; part: IsolationPart }>) =>
{
    const { id, data, part } = event.data;
    try
    {
        const output = runIsolationPart(data, part);
        scope.postMessage({ id, kind: "result", value: output } satisfies WorkerReply<typeof output>,
            output.kind === "passes" ? output.loops.map((loops) => loops.buffer) : []);
    }
    catch (error)
    {
        scope.postMessage({ id, kind: "error", message: error instanceof Error ? error.message : String(error) } satisfies WorkerReply<never>);
    }
};
