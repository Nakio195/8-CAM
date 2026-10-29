// G-code export of the project (specification 6.9 and section 7): operations chosen, origin and mirror, files written in
// the CAM worker with the active machine and its post-processor, simulation played over the board.

import type { SafetyIssue } from "@cam/toolpath/index";
import { checkGcode, DEFAULT_SETUP, inversePoint, setupTransform, type BoardFrame, type JobSetup } from "@post/index";
import { INTERNAL_UNITS_PER_MM } from "@core/units/index";
import { APP_VERSION } from "@core/index";
import { layersBBox, type ExportOperationData, type ExportOutput } from "@project/index";
import { ImportCancelledError, startExport, type WorkerJob } from "@workers/index";
import { toolLabel } from "../tools/labels";
import { i18n } from "./i18n.svelte";
import { machineState } from "./machine.svelte";
import { machining } from "./machining.svelte";
import { project } from "./project.svelte";
import { toolLibrary } from "./tools.svelte";

/** An operation with a result, ready to be written. */
export interface ExportChoice
{
    id: string;
    kind: "isolation" | "drilling" | "cutout";
    label: string;
}

class ExportState
{
    public setup: JobSetup = $state({ ...DEFAULT_SETUP });
    /** One file per operation instead of a single file. */
    public split = $state(false);
    public name = $state("");
    /** Operations left out of the export (all are written by default). */
    public excluded: Record<string, boolean> = $state({});
    public output: ExportOutput | null = $state.raw(null);
    /** Machine zero of the output, on the board (Gerber mm): drawn by the simulation. */
    public origin: { x: number; y: number } | null = $state.raw(null);
    /** Results the output was written from: any newer result makes it stale. */
    public basis: readonly unknown[] = $state.raw([]);
    public running = $state(false);
    public error: string | null = $state(null);
    /** Files edited by hand in the text view, by file name. */
    public edited: Record<string, string> = $state({});
    public showBackplot = $state(true);
    /** Simulation time, seconds. */
    public time = $state(0);
    public playing = $state(false);
    public speed = $state(20);

    private mJob: WorkerJob<ExportOutput> | null = null;

    /** Operations with a result, in machining order: isolation, drilling, cutout. */
    public choices(): ExportChoice[]
    {
        const t = i18n.t;
        const layerName = (id: string | null): string => project.layers.find((layer) => layer.id === id)?.name ?? "";
        return [
            ...machining.operations.filter((operation) => operation.result).map((operation): ExportChoice => ({
                id: operation.id, kind: "isolation", label: `${t("machining.isolation")} · ${layerName(operation.layerId)}`
            })),
            ...machining.drillings.filter((operation) => operation.result).map((operation): ExportChoice => ({
                id: operation.id, kind: "drilling", label: t("machining.drilling")
            })),
            ...machining.cutouts.filter((operation) => operation.result).map((operation): ExportChoice => ({
                id: operation.id, kind: "cutout", label: t("machining.cutout")
            }))
        ];
    }

    /** Results currently selected: compared with the basis to know whether the output is stale. */
    public currentBasis(): unknown[]
    {
        const chosen = new Set(this.choices().filter((choice) => !this.excluded[choice.id]).map((choice) => choice.id));
        return [
            ...machining.operations.filter((operation) => chosen.has(operation.id)).map((operation) => operation.result),
            ...machining.drillings.filter((operation) => chosen.has(operation.id)).map((operation) => operation.result),
            ...machining.cutouts.filter((operation) => chosen.has(operation.id)).map((operation) => operation.result)
        ];
    }

    public get stale(): boolean
    {
        const current = this.currentBasis();
        return this.output !== null && (current.length !== this.basis.length || current.some((result, index) => result !== this.basis[index]));
    }

    /** Board rectangle the origin is taken from: every layer, visible or not, in mm. */
    public frame(): BoardFrame | null
    {
        const box = layersBBox(project.layers, false);
        if (!Number.isFinite(box.minX))
        {
            return null;
        }
        const mm = (value: number): number => value / INTERNAL_UNITS_PER_MM;
        return { minX: mm(box.minX), minY: mm(box.minY), maxX: mm(box.maxX), maxY: mm(box.maxY) };
    }

    /** A bottom copper layer is isolated without mirror: the board may have to be turned over. */
    public bottomWithoutMirror(): boolean
    {
        return !this.setup.mirror && machining.operations.some((operation) => !this.excluded[operation.id] && operation.result
            && project.layers.find((layer) => layer.id === operation.layerId)?.file.layerType.side === "bottom");
    }

    public defaultName(): string
    {
        const first = project.layers[0]?.file.fileName ?? "pcbCAM";
        return first.replace(/\.[^.]+$/, "").replace(/\s*-?\s*(CADCAM\s+)?(Bottom|Top)\s+Copper$/i, "").trim() || "pcbCAM";
    }

    public async run(): Promise<void>
    {
        const frame = this.frame();
        if (!frame)
        {
            return;
        }
        const t = i18n.t;
        const chosen = new Set(this.choices().filter((choice) => !this.excluded[choice.id]).map((choice) => choice.id));
        const label = (tool: Parameters<typeof toolLabel>[0]): string => toolLabel(tool, t, i18n.number);
        const operations: ExportOperationData[] = [];
        for (const operation of machining.operations.filter((entry) => chosen.has(entry.id) && entry.result))
        {
            const result = operation.result;
            if (result)
            {
                const layer = project.layers.find((entry) => entry.id === operation.layerId);
                operations.push({ label: `Isolation ${layer?.name ?? ""}`.trim(), toolLabel: label(result.tool), tool: $state.snapshot(result.tool), loops: result.loops });
            }
        }
        for (const operation of machining.drillings.filter((entry) => chosen.has(entry.id)))
        {
            operation.result?.runs.forEach((run, index) =>
            {
                operations.push({
                    label: `Drilling ${label(run.tool)}`,
                    toolLabel: label(run.tool),
                    tool: $state.snapshot(run.tool),
                    moves: operation.result?.runMoves[index] ?? []
                });
            });
        }
        for (const operation of machining.cutouts.filter((entry) => chosen.has(entry.id) && entry.result))
        {
            const result = operation.result;
            if (result)
            {
                operations.push({ label: "Cutout", toolLabel: label(result.tool), tool: $state.snapshot(result.tool), moves: machining.cutoutMoves(operation, this.setup.mirror) });
            }
        }
        if (operations.length === 0)
        {
            return;
        }
        this.cancel();
        this.running = true;
        this.error = null;
        const basis = this.currentBasis();
        const job = startExport({
            name: (this.name.trim() || this.defaultName()).replace(/[^\w.-]+/g, "_"),
            date: Date.now(),
            version: APP_VERSION,
            operations,
            profile: $state.snapshot(machineState.activeProfile),
            machine: $state.snapshot(machineState.active),
            setup: { ...this.setup },
            frame,
            split: this.split
        });
        this.mJob = job;
        try
        {
            this.output = await job.promise;
            this.origin = inversePoint({ x: 0, y: 0 }, setupTransform(frame, this.setup));
            this.basis = basis;
            this.edited = {};
            this.time = 0;
            this.playing = false;
        }
        catch (error)
        {
            if (!(error instanceof ImportCancelledError))
            {
                this.error = error instanceof Error ? error.message : String(error);
            }
        }
        finally
        {
            if (this.mJob === job)
            {
                this.mJob = null;
                this.running = false;
            }
        }
    }

    public cancel(): void
    {
        this.mJob?.cancel();
        this.mJob = null;
        this.running = false;
    }

    /** Text of a file as it will be downloaded: edited by hand or as written. */
    public text(name: string): string
    {
        return this.edited[name] ?? this.output?.files.find((file) => file.name === name)?.text ?? "";
    }

    /** Safety rules checked again on a file edited by hand (section 7). */
    public editedIssues(name: string): SafetyIssue["reason"][]
    {
        const edited = this.edited[name];
        const output = this.output;
        if (edited === undefined || !output)
        {
            return [];
        }
        // The lowest travel height of the library and the safe height of the machine are the limits a hand edit must keep
        const travelZ = Math.min(...toolLibrary.tools.map((tool) => tool.travelZ));
        return [...new Set(checkGcode(edited, Number.isFinite(travelZ) ? travelZ : 2, machineState.active.safeZ).map((issue) => issue.reason))];
    }

    public get duration(): number
    {
        const times = this.output?.backplot.times;
        return times && times.length > 0 ? (times[times.length - 1] ?? 0) : 0;
    }
}

export const exportState = new ExportState();
