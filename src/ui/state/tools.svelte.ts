// Tool library of the user, kept in this browser (IndexedDB) and exchangeable as JSON files.

import {
    defaultLibrary,
    duplicateTool,
    exportLibrary,
    importLibrary,
    mergeLibraries,
    type LibraryImportError,
    type Tool,
    type ToolType
} from "@cam/tools/index";
import { loadSetting, saveSetting } from "./storage";

const STORAGE_KEY = "toolLibrary";

function newId(): string
{
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `tool-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

/** Starting values of a new tool of the given type, close to the built-in ones. */
export function blankTool(type: ToolType): Tool
{
    const base = defaultLibrary().find((tool) => tool.type === type) ?? (defaultLibrary()[0] as Tool);
    return { ...duplicateTool(base, newId()), name: "", notes: "" };
}

class ToolLibraryState
{
    public tools: Tool[] = $state.raw(defaultLibrary());
    /** False when the browser refused to store the library (private browsing): changes last for this session only. */
    public persistent = $state(true);

    private mLoaded = false;

    public async load(): Promise<void>
    {
        if (this.mLoaded)
        {
            return;
        }
        this.mLoaded = true;
        const stored = await loadSetting<Tool[]>(STORAGE_KEY);
        if (Array.isArray(stored) && stored.length > 0)
        {
            this.tools = stored;
        }
    }

    public find(id: string): Tool | undefined
    {
        return this.tools.find((tool) => tool.id === id);
    }

    /** Adds or replaces a tool; an edited built-in tool becomes the user's own. */
    public save(tool: Tool): void
    {
        const saved = { ...tool, builtIn: false };
        this.set(this.tools.some((entry) => entry.id === tool.id)
            ? this.tools.map((entry) => (entry.id === tool.id ? saved : entry))
            : [...this.tools, saved]);
    }

    public duplicate(id: string): Tool | null
    {
        const tool = this.find(id);
        if (!tool)
        {
            return null;
        }
        const copy = duplicateTool(tool, newId());
        this.set([...this.tools, copy]);
        return copy;
    }

    public remove(id: string): void
    {
        this.set(this.tools.filter((tool) => tool.id !== id));
    }

    public reset(): void
    {
        this.set(defaultLibrary());
    }

    public exportJson(): string
    {
        return exportLibrary(this.tools);
    }

    /** Merges a library file; returns the number of tools added or replaced and skipped, or the error. */
    public importJson(text: string): { added: number; skipped: number } | { error: LibraryImportError }
    {
        const result = importLibrary(text);
        if ("error" in result)
        {
            return result;
        }
        this.set(mergeLibraries(this.tools, result.tools));
        return { added: result.tools.length, skipped: result.skipped };
    }

    private set(tools: Tool[]): void
    {
        this.tools = tools;
        // IndexedDB clones what it stores and refuses reactive proxies: always hand it plain data
        void saveSetting(STORAGE_KEY, $state.snapshot(tools)).then((saved) =>
        {
            this.persistent = saved;
        });
    }
}

export const toolLibrary = new ToolLibraryState();
