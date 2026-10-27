// Machining operations of the user interface: isolation operations, their computation in the CAM worker, and the
// tool comparator (specification 6.10).

import { recommendIsolation } from "@cam/analysis/index";
import type { IsolationParams } from "@cam/isolation/index";
import type { Tool } from "@cam/tools/index";
import { createIsolation, type IsolationOperation, type IsolationOutput, type ProjectLayer } from "@project/index";
import { ImportCancelledError, startIsolation, type WorkerJob } from "@workers/index";
import { project } from "./project.svelte";
import { toolLibrary } from "./tools.svelte";

export interface RunningJob
{
    fraction: number;
    cancel: () => void;
}

export interface Comparison
{
    /** Identifies one run: results of an older run are ignored. */
    run: number;
    layerId: string;
    params: IsolationParams;
    toolIds: string[];
    results: Record<string, IsolationOutput>;
    running: boolean;
    error: string | null;
}

/** At most three tools side by side (specification 6.10). */
export const COMPARISON_LIMIT = 3;

let nextOperation = 1;

function without<Value>(record: Record<string, Value>, key: string): Record<string, Value>
{
    return Object.fromEntries(Object.entries(record).filter(([entry]) => entry !== key));
}

function isCopper(layer: ProjectLayer): boolean
{
    return layer.file.analysis !== null && (layer.file.layerType.kind === "copper" || layer.file.layerType.kind === "unknown");
}

class MachiningState
{
    public operations: IsolationOperation[] = $state.raw([]);
    /** Running computations by operation id. */
    public jobs: Record<string, RunningJob> = $state({});
    public errors: Record<string, string> = $state({});
    public comparison: Comparison | null = $state.raw(null);

    private mComparisonJobs: WorkerJob<IsolationOutput>[] = [];

    public copperLayers(): ProjectLayer[]
    {
        return project.layers.filter(isCopper);
    }

    /** Isolation tools of the library, the most suitable first (recommendation of J5). */
    public isolationTools(): Tool[]
    {
        return recommendIsolation(toolLibrary.tools, project.board).map((advice) => advice.tool);
    }

    /** New isolation of the first copper layer with the best rated tool, computed at once. */
    public addIsolation(): IsolationOperation | null
    {
        const layer = this.copperLayers()[0];
        const tool = this.isolationTools()[0];
        if (!layer || !tool)
        {
            return null;
        }
        const operation = createIsolation(`isolation-${nextOperation++}`, layer.id, tool.id);
        this.operations = [...this.operations, operation];
        void this.run(operation.id);
        return operation;
    }

    /** Changing the layer, tool or parameters makes the result stale until it is computed again. */
    public update(id: string, changes: Partial<Pick<IsolationOperation, "layerId" | "toolId" | "params" | "visible">>): void
    {
        const computing = "layerId" in changes || "toolId" in changes || "params" in changes;
        this.operations = this.operations.map((operation) => operation.id === id
            ? { ...operation, ...changes, result: computing ? null : operation.result }
            : operation);
    }

    public remove(id: string): void
    {
        this.jobs[id]?.cancel();
        this.operations = this.operations.filter((operation) => operation.id !== id);
    }

    public async run(id: string): Promise<void>
    {
        const operation = this.operations.find((entry) => entry.id === id);
        const layer = project.layers.find((entry) => entry.id === operation?.layerId);
        const tool = toolLibrary.find(operation?.toolId ?? "");
        if (!operation || !layer?.file.analysis || !tool)
        {
            return;
        }
        this.jobs[id]?.cancel();
        this.errors = without(this.errors, id);
        const job = startIsolation(
            // Plain data for the worker: the tool and parameters may be reactive objects
            { copper: layer.file.geometry, spots: layer.file.analysis.spots, tool: $state.snapshot(tool), params: $state.snapshot(operation.params) },
            (fraction) =>
            {
                const running = this.jobs[id];
                if (running)
                {
                    running.fraction = fraction;
                }
            });
        this.jobs[id] = { fraction: 0, cancel: job.cancel };
        try
        {
            const result = await job.promise;
            this.operations = this.operations.map((entry) => (entry.id === id ? { ...entry, result } : entry));
        }
        catch (error)
        {
            if (!(error instanceof ImportCancelledError))
            {
                this.errors[id] = error instanceof Error ? error.message : String(error);
            }
        }
        finally
        {
            this.jobs = without(this.jobs, id);
        }
    }

    public startComparison(layerId: string, toolIds: readonly string[], params: IsolationParams): void
    {
        this.cancelComparison();
        const layer = project.layers.find((entry) => entry.id === layerId);
        const tools = toolIds.slice(0, COMPARISON_LIMIT).map((id) => toolLibrary.find(id)).filter((tool): tool is Tool => tool !== undefined);
        if (!layer?.file.analysis || tools.length === 0)
        {
            return;
        }
        const run = (this.comparison?.run ?? 0) + 1;
        this.comparison = { run, layerId, params: { ...params }, toolIds: tools.map((tool) => tool.id), results: {}, running: true, error: null };
        const analysis = layer.file.analysis;
        // One worker per tool: the comparisons run in parallel
        this.mComparisonJobs = tools.map((tool) => startIsolation({
            copper: layer.file.geometry, spots: analysis.spots, tool: $state.snapshot(tool), params: { ...params }
        }));
        void Promise.all(this.mComparisonJobs.map((job, index) => job.promise.then((result) =>
        {
            const toolId = tools[index]?.id;
            // The comparison object is replaced at every result: match the run, not the object
            if (toolId && this.comparison?.run === run)
            {
                this.comparison = { ...this.comparison, results: { ...this.comparison.results, [toolId]: result } };
            }
        }))).then(() =>
        {
            if (this.comparison?.run === run)
            {
                this.comparison = { ...this.comparison, running: false };
            }
        }).catch((error: unknown) =>
        {
            if (!(error instanceof ImportCancelledError) && this.comparison?.run === run)
            {
                this.comparison = { ...this.comparison, running: false, error: error instanceof Error ? error.message : String(error) };
            }
        });
    }

    public cancelComparison(): void
    {
        for (const job of this.mComparisonJobs)
        {
            job.cancel();
        }
        this.mComparisonJobs = [];
        if (this.comparison?.running)
        {
            this.comparison = { ...this.comparison, running: false };
        }
    }

    /** Creates an isolation operation from a compared tool, reusing the computed result. */
    public useComparedTool(toolId: string): void
    {
        const comparison = this.comparison;
        const result = comparison?.results[toolId];
        if (!comparison || !result)
        {
            return;
        }
        const operation = { ...createIsolation(`isolation-${nextOperation++}`, comparison.layerId, toolId), params: { ...comparison.params }, result };
        this.operations = [...this.operations, operation];
    }
}

export const machining = new MachiningState();
