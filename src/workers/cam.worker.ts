// CAM worker entry point: toolpath computations away from the user interface thread.

import type { IsolationRequestData } from "@project/operations";
import { runIsolation } from "./isolationJob";
import type { WorkerReply } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<{ id: number; data: IsolationRequestData }>) =>
{
    const { id, data } = event.data;
    let lastReport = 0;
    try
    {
        const output = runIsolation(data, (fraction) =>
        {
            const now = performance.now();
            if (now - lastReport > 50 || fraction === 1)
            {
                lastReport = now;
                scope.postMessage({ id, kind: "progress", fraction } satisfies WorkerReply<never>);
            }
        });
        scope.postMessage({ id, kind: "result", value: output } satisfies WorkerReply<typeof output>,
            [output.loops.buffer, output.travels.buffer, output.zoneShapes.buffer]);
    }
    catch (error)
    {
        scope.postMessage({ id, kind: "error", message: error instanceof Error ? error.message : String(error) } satisfies WorkerReply<never>);
    }
};
