// Import worker entry point: parses and builds files away from the user interface thread.

import { importFile } from "./importer";
import type { ImportRequest, ImportResponse } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

function post(response: ImportResponse, transfer: Transferable[] = []): void
{
    scope.postMessage(response, transfer);
}

scope.onmessage = (event: MessageEvent<ImportRequest>) =>
{
    const { id, fileName, text } = event.data;
    let lastReport = 0;
    try
    {
        const file = importFile(fileName, text, (stage, fraction) =>
        {
            // Throttled: posting a message for every progress callback would slow the computation down
            const now = performance.now();
            if (now - lastReport > 50 || fraction === 1)
            {
                lastReport = now;
                post({ id, kind: "progress", stage, fraction });
            }
        });
        post({ id, kind: "result", file }, [file.geometry.buffer]);
    }
    catch (error)
    {
        post({ id, kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
};
