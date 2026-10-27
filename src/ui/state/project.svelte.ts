// Project state of the user interface: layers and running imports.

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

    private mNextId = 1;
    private mFitPending = false;

    public async importFiles(files: Iterable<File>): Promise<void>
    {
        // All files are read before any import starts, so they form one batch (one fit of the view at the end)
        const entries = await Promise.all([...files].map(async (file) => ({ name: file.name, text: await file.text() })));
        await Promise.all(entries.map((entry) => this.importText(entry.name, entry.text)));
    }

    public async importText(fileName: string, text: string): Promise<void>
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
            this.layers = addLayer(this.layers, createLayer(file, `layer-${id}`));
        }
        catch (error)
        {
            if (!(error instanceof ImportCancelledError))
            {
                this.failures.push({ id, fileName, message: error instanceof Error ? error.message : String(error) });
            }
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

    public dismissFailure(id: number): void
    {
        this.failures = this.failures.filter((failure) => failure.id !== id);
    }
}

export const project = new ProjectState();
