// Tool library of the user, kept in this browser (IndexedDB) and exchangeable as JSON files.

import {
    cleanToolNumbers,
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
/** Ids of the built-in tools of the site already given to this user: one the user removed does not come back. */
const SEEN_KEY = "builtInToolsSeen";

function newId(): string
{
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `tool-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

/** Starting values of a new tool of the given type, close to the built-in ones. */
export function blankTool(type: ToolType): Tool
{
    const builtIns = toolLibrary.builtIns;
    const base = builtIns.find((tool) => tool.type === type) ?? (builtIns[0] ?? (defaultLibrary()[0] as Tool));
    return { ...duplicateTool(base, newId()), name: "", notes: "" };
}

class ToolLibraryState
{
    public tools: Tool[] = $state.raw(defaultLibrary());
    /** False when the browser refused to store the library (private browsing): changes last for this session only. */
    public persistent = $state(true);

    /** Built-in tools: those of the site (defaults.json) once read, else those of the code. */
    public builtIns: Tool[] = $state.raw(defaultLibrary());

    private mLoaded = false;
    /** True once a library of the user was read from storage. */
    private mStored = false;

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
            this.tools = stored.map(cleanToolNumbers);
            this.mStored = true;
        }
    }

    public find(id: string): Tool | undefined
    {
        return this.tools.find((tool) => tool.id === id);
    }

    /** Adds or replaces a tool; an edited built-in tool becomes the user's own. */
    public save(tool: Tool): void
    {
        const saved = { ...cleanToolNumbers(tool), builtIn: false };
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

    /** Whole library replaced (a project opened with its tools). */
    public replaceAll(tools: Tool[]): void
    {
        this.set(tools);
    }

    public reset(): void
    {
        this.set([...this.builtIns]);
    }

    /**
     * Built-in tools chosen by the site. A first visit gets them as they are, not stored, so a later change of the site
     * file still applies. A stored library gets the new values of its built-in tools (those the user changed are their
     * own, no longer built-in) and the built-in tools it has never had; one the user removed stays removed.
     */
    public async useSiteTools(tools: readonly Tool[]): Promise<void>
    {
        this.builtIns = [...tools];
        if (!this.mStored)
        {
            this.tools = [...tools];
            return;
        }
        const seen = new Set((await loadSetting<string[]>(SEEN_KEY)) ?? []);
        const site = new Map(tools.map((tool) => [tool.id, tool]));
        const updated = this.tools.map((tool) => (tool.builtIn ? site.get(tool.id) ?? tool : tool));
        const missing = tools.filter((tool) => !seen.has(tool.id) && !this.tools.some((entry) => entry.id === tool.id));
        // Kept in memory only: the user's file is written when they change something
        this.tools = [...updated, ...missing];
        void saveSetting(SEEN_KEY, [...new Set([...seen, ...site.keys()])]);
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
        this.mStored = true;
        // IndexedDB clones what it stores and refuses reactive proxies: always hand it plain data
        void saveSetting(STORAGE_KEY, $state.snapshot(tools)).then((saved) =>
        {
            this.persistent = saved;
        });
    }
}

export const toolLibrary = new ToolLibraryState();
