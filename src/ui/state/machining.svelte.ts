// Machining operations of the user interface: isolation, drilling and cutout operations, their computation (in the
// CAM worker, or directly for the cutout), and the tool comparator (specification 6.10).

import { recommendCutout, recommendDrilling, recommendIsolation } from "@cam/analysis/index";
import { BOUNDING_BOX_MARGIN, CUTOUT_DEPTH_MARGIN, DEFAULT_CUTOUT, projectOnPath } from "@cam/cutout/index";
import { DRILL_EXTRA_DEPTH } from "@cam/drilling/index";
import type { IsolationParams } from "@cam/isolation/index";
import type { Tool } from "@cam/tools/index";
import { distance, unpackPolygons } from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";
import {
    createDrilling,
    createIsolation,
    layersBBox,
    type CutoutOperation,
    type DrillingOperation,
    type DrillingSetData,
    type IsolationOperation,
    type IsolationOutput,
    type ProjectLayer
} from "@project/index";
import { automaticTabs, ImportCancelledError, runCutout, startDrilling, startIsolation, type WorkerJob } from "@workers/index";
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

function hasHoles(layer: ProjectLayer): boolean
{
    return layer.file.drill !== null && (layer.file.drill.hits.length > 0 || layer.file.drill.slots.length > 0);
}

/** Depths shown in fields: 1.6 + 0.1 is 1.7000000000000002 in floating point. */
function roundDepth(value: number): number
{
    return Math.round(value * 1000) / 1000;
}

/** Key of a hole diameter in the tool assignments of a drilling operation. */
export function diameterKey(diameter: number): string
{
    return String(Math.round(diameter));
}

class MachiningState
{
    public operations: IsolationOperation[] = $state.raw([]);
    public drillings: DrillingOperation[] = $state.raw([]);
    public cutouts: CutoutOperation[] = $state.raw([]);
    /** Cutout whose tabs are being added or removed by clicks on the board. */
    public editingTabs: string | null = $state(null);
    /** Running computations by operation id. */
    public jobs: Record<string, RunningJob> = $state({});
    public errors: Record<string, string> = $state({});
    public comparison: Comparison | null = $state.raw(null);

    private mComparisonJobs: WorkerJob<IsolationOutput>[] = [];

    public copperLayers(): ProjectLayer[]
    {
        return project.layers.filter(isCopper);
    }

    /** Drill files with at least one hole or slot. */
    public drillLayers(): ProjectLayer[]
    {
        return project.layers.filter(hasHoles);
    }

    /** Hole diameters of the given drill layers with their hole and slot counts, smallest first. */
    public holeSizes(layerIds: readonly string[]): { diameter: number; holes: number; slots: number }[]
    {
        const sizes: Record<string, { diameter: number; holes: number; slots: number }> = {};
        for (const layer of project.layers.filter((entry) => layerIds.includes(entry.id)))
        {
            const drill = layer.file.drill;
            for (const tool of drill?.tools ?? [])
            {
                const holes = drill?.hits.filter((hit) => hit.tool === tool.number).length ?? 0;
                const slots = drill?.slots.filter((slot) => slot.tool === tool.number).length ?? 0;
                if (holes + slots === 0)
                {
                    continue;
                }
                const size = sizes[diameterKey(tool.diameter)] ?? { diameter: tool.diameter, holes: 0, slots: 0 };
                size.holes += holes;
                size.slots += slots;
                sizes[diameterKey(tool.diameter)] = size;
            }
        }
        return Object.values(sizes).sort((a, b) => a.diameter - b.diameter);
    }

    /** Tools able to make holes: drills, then end mills meant for milling holes. */
    public holeTools(): Tool[]
    {
        const tools = toolLibrary.tools;
        return [
            ...tools.filter((tool) => tool.type === "drill").sort((a, b) => a.diameter - b.diameter),
            ...tools.filter((tool) => tool.type === "endmill" && tool.usages.includes("holeMilling")).sort((a, b) => a.diameter - b.diameter)
        ];
    }

    /** New drilling of every drill file, each hole size with the recommended tool (J5), computed at once. */
    public addDrilling(): DrillingOperation | null
    {
        const layers = this.drillLayers();
        if (layers.length === 0)
        {
            return null;
        }
        const advice = recommendDrilling(toolLibrary.tools, project.board);
        const assignments: Record<string, string | null> = {};
        for (const entry of advice.holes)
        {
            assignments[diameterKey(entry.hole.diameter)] = entry.tool?.id ?? null;
        }
        const operation = createDrilling(`drilling-${nextOperation++}`, layers.map((layer) => layer.id), assignments,
            roundDepth(project.thickness + DRILL_EXTRA_DEPTH));
        this.drillings = [...this.drillings, operation];
        void this.runDrilling(operation.id);
        return operation;
    }

    public updateDrilling(id: string, changes: Partial<Pick<DrillingOperation, "layerIds" | "assignments" | "params" | "visible" | "showFileOrder">>): void
    {
        const computing = "layerIds" in changes || "assignments" in changes || "params" in changes;
        this.drillings = this.drillings.map((operation) => operation.id === id
            ? { ...operation, ...changes, result: computing ? null : operation.result }
            : operation);
    }

    public removeDrilling(id: string): void
    {
        this.jobs[id]?.cancel();
        this.drillings = this.drillings.filter((operation) => operation.id !== id);
    }

    public async runDrilling(id: string): Promise<void>
    {
        const operation = this.drillings.find((entry) => entry.id === id);
        if (!operation)
        {
            return;
        }
        const sets: Record<string, DrillingSetData> = {};
        for (const layer of project.layers.filter((entry) => operation.layerIds.includes(entry.id)))
        {
            const drill = layer.file.drill;
            for (const tool of drill?.tools ?? [])
            {
                const toolId = operation.assignments[diameterKey(tool.diameter)] ?? null;
                const found = toolId ? toolLibrary.find(toolId) : undefined;
                const set = sets[diameterKey(tool.diameter)] ?? { diameter: tool.diameter, holes: [], slots: [], tool: found ? $state.snapshot(found) : null };
                set.holes.push(...(drill?.hits.filter((hit) => hit.tool === tool.number).map((hit) => ({ x: hit.x, y: hit.y })) ?? []));
                set.slots.push(...(drill?.slots.filter((slot) => slot.tool === tool.number).map((slot) => slot.path) ?? []));
                sets[diameterKey(tool.diameter)] = set;
            }
        }
        this.jobs[id]?.cancel();
        this.errors = without(this.errors, id);
        const job = startDrilling({ sets: Object.values(sets), params: $state.snapshot(operation.params) });
        this.jobs[id] = { fraction: 0, cancel: job.cancel };
        try
        {
            const result = await job.promise;
            this.drillings = this.drillings.map((entry) => (entry.id === id ? { ...entry, result } : entry));
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

    /** Outline layers (board edge). */
    public outlineLayers(): ProjectLayer[]
    {
        return project.layers.filter((layer) => layer.file.layerType.kind === "outline" && layer.file.geometry.length > 1);
    }

    /** End mills able to cut the board out, the recommended one first (J5). */
    public cutoutTools(): Tool[]
    {
        return recommendCutout(toolLibrary.tools, project.board).map((advice) => advice.tool);
    }

    /** New cutout around the first outline layer (or the copper), with the recommended mill and 4 tabs. */
    public addCutout(): CutoutOperation | null
    {
        const tool = this.cutoutTools()[0];
        if (!tool || project.layers.length === 0)
        {
            return null;
        }
        const outline = this.outlineLayers()[0] ?? null;
        const operation: CutoutOperation = {
            id: `cutout-${nextOperation++}`,
            kind: "cutout",
            outlineLayerId: outline?.id ?? null,
            toolId: tool.id,
            params: {
                ...DEFAULT_CUTOUT,
                // Without outline the cut goes around the copper: keep some board around it
                margin: outline ? 0 : BOUNDING_BOX_MARGIN,
                thickness: project.thickness,
                depth: roundDepth(project.thickness + CUTOUT_DEPTH_MARGIN)
            },
            tabCount: 4,
            tabs: [],
            result: null,
            visible: true
        };
        this.cutouts = [...this.cutouts, operation];
        this.placeTabs(operation.id);
        return operation;
    }

    /** The cutout is recomputed at once: a single contour takes a few milliseconds. */
    public updateCutout(id: string, changes: Partial<Pick<CutoutOperation, "outlineLayerId" | "toolId" | "params" | "tabCount" | "tabs" | "visible">>): void
    {
        this.cutouts = this.cutouts.map((operation) => (operation.id === id ? this.computeCutout({ ...operation, ...changes }) : operation));
    }

    public removeCutout(id: string): void
    {
        if (this.editingTabs === id)
        {
            this.editingTabs = null;
        }
        this.cutouts = this.cutouts.filter((operation) => operation.id !== id);
    }

    /** Spreads the operation's number of tabs evenly along its contour. */
    public placeTabs(id: string): void
    {
        const operation = this.cutouts.find((entry) => entry.id === id);
        const request = operation ? this.cutoutRequest(operation) : null;
        if (!operation || !request)
        {
            return;
        }
        this.updateCutout(id, { tabs: automaticTabs(request, operation.tabCount) });
    }

    /**
     * Click on the board (mm) while editing tabs: removes the tab under the click, or adds one where the click is near
     * the contour. Returns false when the click is too far from the contour to mean anything.
     */
    public pickTab(point: { x: number; y: number }, tolerance: number): boolean
    {
        const operation = this.cutouts.find((entry) => entry.id === this.editingTabs);
        const result = operation?.result;
        if (!operation || !result)
        {
            return false;
        }
        const clicked = { x: mmToInternal(point.x), y: mmToInternal(point.y) };
        const reach = mmToInternal(Math.max(tolerance, operation.params.tabWidth / 2));
        const near = result.tabs.findIndex((tab) => distance(tab, clicked) <= reach);
        if (near >= 0)
        {
            this.updateCutout(operation.id, { tabs: result.tabs.filter((_, index) => index !== near) });
            return true;
        }
        const contour = unpackPolygons(result.contour)[0]?.outer ?? [];
        const projected = projectOnPath(contour, clicked);
        if (projected.distance > mmToInternal(Math.max(tolerance, result.tool.diameter)))
        {
            return false;
        }
        this.updateCutout(operation.id, { tabs: [...result.tabs, clicked] });
        return true;
    }

    private cutoutRequest(operation: CutoutOperation): Parameters<typeof runCutout>[0] | null
    {
        const tool = toolLibrary.find(operation.toolId);
        const outline = project.layers.find((layer) => layer.id === operation.outlineLayerId);
        const others = project.layers.filter((layer) => layer.file.layerType.kind !== "outline");
        const box = layersBBox(others.length > 0 ? others : project.layers, false);
        if (!tool || !Number.isFinite(box.minX))
        {
            return null;
        }
        return { outline: outline?.file.geometry ?? null, box, tool: $state.snapshot(tool), params: { ...operation.params }, tabs: operation.tabs };
    }

    private computeCutout(operation: CutoutOperation): CutoutOperation
    {
        const request = this.cutoutRequest(operation);
        try
        {
            this.errors = without(this.errors, operation.id);
            return { ...operation, result: request ? runCutout(request) : null };
        }
        catch (error)
        {
            this.errors[operation.id] = error instanceof Error ? error.message : String(error);
            return { ...operation, result: null };
        }
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
