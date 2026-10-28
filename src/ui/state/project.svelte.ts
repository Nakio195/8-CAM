// Project state of the user interface: layers, running imports, board thickness and board analysis.

import { DEFAULT_BOARD_THICKNESS, summarizeBoard, type BoardSummary } from "@cam/analysis/index";
import type { Point } from "@core/geometry/index";
import { INTERNAL_UNITS_PER_MM } from "@core/units/index";
import {
    addLayer,
    createLayer,
    moveLayer,
    removeLayer,
    updateLayer,
    type ProjectLayer
} from "@project/index";
import { ImportCancelledError, startImport, type ImportStage } from "@workers/index";

export interface ImportTask
{
    id: number;
    fileName: string;
    stage: ImportStage;
    fraction: number;
    cancel: () => void;
}

/** Board area the view is asked to show, in millimetres, with an optional spot to highlight. */
export interface FocusRequest
{
    id: number;
    rect: { minX: number; minY: number; maxX: number; maxY: number };
    highlight: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
}

export interface ImportFailure
{
    id: number;
    fileName: string;
    message: string;
}

/** Files of the example board shipped with the application (public/examples). */
const EXAMPLE_FILES = [
    "FTDI_Max - CADCAM Bottom Copper.GBR",
    "FTDI_Max - CADCAM Drill TOP-BOT Plated.GBR"
];

class ProjectState
{
    // Raw state: layers are replaced as a whole, and their large typed arrays must not be wrapped in proxies
    public layers: ProjectLayer[] = $state.raw([]);
    public tasks: ImportTask[] = $state([]);
    public failures: ImportFailure[] = $state([]);
    /** Incremented to ask the view to show the whole board. */
    public fitRequest = $state(0);
    public focus: FocusRequest | null = $state.raw(null);
    /** Board thickness used by the analysis and recommendations, mm. */
    public thickness = $state(DEFAULT_BOARD_THICKNESS);

    /** Analysis of the whole board: copper layers with their clearances, and every drill layer. */
    public board: BoardSummary = $derived(summarizeBoard(
        this.layers.flatMap((layer) => (layer.file.analysis ? [{ id: layer.id, analysis: layer.file.analysis }] : [])),
        this.layers.flatMap((layer) => (layer.file.drill ? [{ summary: layer.file.drill.summary }] : [])),
        this.thickness
    ));

    private mNextId = 1;
    private mFitPending = false;

    public async importFiles(files: Iterable<File>): Promise<void>
    {
        // All files are read before any import starts, so they form one batch (one fit of the view at the end)
        const entries = await Promise.all([...files].map(async (file) => ({ name: file.name, text: await file.text() })));
        await Promise.all(entries.map((entry) => this.importText(entry.name, entry.text)));
    }

    /** Imports one file; returns the id of its layer (null when it failed or was cancelled). */
    public async importText(fileName: string, text: string): Promise<string | null>
    {
        const id = this.mNextId++;
        const job = startImport(fileName, text, (stage, fraction) =>
        {
            const task = this.tasks.find((entry) => entry.id === id);
            if (task)
            {
                task.stage = stage;
                task.fraction = fraction;
            }
        });
        if (this.layers.length === 0 && this.tasks.length === 0)
        {
            // First files of an empty project: show the whole board once they are all imported
            this.mFitPending = true;
        }
        this.tasks.push({ id, fileName, stage: "parsing", fraction: 0, cancel: job.cancel });
        try
        {
            const file = await job.promise;
            const layer = createLayer(file, `layer-${id}`, text);
            this.layers = addLayer(this.layers, layer);
            return layer.id;
        }
        catch (error)
        {
            if (!(error instanceof ImportCancelledError))
            {
                this.failures.push({ id, fileName, message: error instanceof Error ? error.message : String(error) });
            }
            return null;
        }
        finally
        {
            this.tasks = this.tasks.filter((task) => task.id !== id);
            if (this.mFitPending && this.tasks.length === 0)
            {
                this.mFitPending = false;
                this.fitRequest++;
            }
        }
    }

    public async loadExample(): Promise<void>
    {
        const base = `${import.meta.env.BASE_URL}examples/ftdi-max/`;
        const entries = await Promise.all(EXAMPLE_FILES.map(async (name) =>
        {
            const response = await fetch(base + encodeURIComponent(name));
            if (!response.ok)
            {
                this.failures.push({ id: this.mNextId++, fileName: name, message: `HTTP ${response.status}` });
                return null;
            }
            return { name, text: await response.text() };
        }));
        await Promise.all(entries.map((entry) => (entry ? this.importText(entry.name, entry.text) : undefined)));
    }

    /** Empty project (before opening a project file). */
    public clear(): void
    {
        for (const task of this.tasks)
        {
            task.cancel();
        }
        this.tasks = [];
        this.failures = [];
        this.layers = [];
        this.focus = null;
    }

    /** Display settings given back by a project file. */
    public restoreDisplay(id: string, display: { color: string; visible: boolean; opacity: number }): void
    {
        this.layers = updateLayer(this.layers, id, display);
    }

    /** Asks the view to show the whole board. */
    public fit(): void
    {
        this.fitRequest++;
    }

    public setVisible(id: string, visible: boolean): void
    {
        this.layers = updateLayer(this.layers, id, { visible });
    }

    public setColor(id: string, color: string): void
    {
        this.layers = updateLayer(this.layers, id, { color });
    }

    public move(id: string, direction: "up" | "down"): void
    {
        this.layers = moveLayer(this.layers, id, direction);
    }

    public remove(id: string): void
    {
        this.layers = removeLayer(this.layers, id);
    }

    /** Asks the view to show the area between two points (internal units), with a margin, and to highlight them. */
    public focusOn(a: Point, b: Point, marginMm = 1.5): void
    {
        const from = { x: a.x / INTERNAL_UNITS_PER_MM, y: a.y / INTERNAL_UNITS_PER_MM };
        const to = { x: b.x / INTERNAL_UNITS_PER_MM, y: b.y / INTERNAL_UNITS_PER_MM };
        this.focus = {
            id: (this.focus?.id ?? 0) + 1,
            rect: {
                minX: Math.min(from.x, to.x) - marginMm,
                minY: Math.min(from.y, to.y) - marginMm,
                maxX: Math.max(from.x, to.x) + marginMm,
                maxY: Math.max(from.y, to.y) + marginMm
            },
            highlight: { from, to }
        };
    }

    public dismissFailure(id: number): void
    {
        this.failures = this.failures.filter((failure) => failure.id !== id);
    }
}

export const project = new ProjectState();
