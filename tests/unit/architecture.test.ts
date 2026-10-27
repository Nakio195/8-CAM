import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { LAYERS } from "../../vite.config";

// Mirror of the ESLint layer rules (docs/architecture.md section 5.2), checked independently of the linter
const ALLOWED_IMPORTS: Record<string, readonly string[]> = {
    core: [],
    parsers: ["core"],
    cam: ["core", "parsers"],
    post: ["core", "cam"],
    project: ["core", "parsers", "cam", "post"],
    workers: ["core", "parsers", "cam", "post", "project"],
    render: ["core", "parsers", "cam", "project"],
    ui: ["core", "parsers", "cam", "post", "project", "workers", "render"]
};

const SRC_DIR = join(import.meta.dirname, "..", "..", "src");
const IMPORT_RE = /(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function listSourceFiles(dir: string): string[]
{
    const files: string[] = [];
    for (const entry of readdirSync(dir))
    {
        const path = join(dir, entry);
        if (statSync(path).isDirectory())
        {
            files.push(...listSourceFiles(path));
        }
        else if (/\.(ts|svelte)$/.test(entry))
        {
            files.push(path);
        }
    }
    return files;
}

function layerOfFile(file: string): string | undefined
{
    return relative(SRC_DIR, file).split(sep)[0];
}

function layerOfImport(specifier: string, file: string): string | undefined
{
    const alias = /^@(\w+)\//.exec(specifier);
    if (alias)
    {
        return alias[1];
    }
    if (specifier.startsWith("."))
    {
        return relative(SRC_DIR, join(file, "..", specifier)).split(sep)[0];
    }
    return undefined;
}

describe("architecture", () =>
{
    it("declares rules for every layer", () =>
    {
        expect(Object.keys(ALLOWED_IMPORTS).sort()).toEqual([...LAYERS].sort());
    });

    it("never imports an upper layer", () =>
    {
        const violations: string[] = [];
        for (const file of listSourceFiles(SRC_DIR))
        {
            const layer = layerOfFile(file);
            if (layer === undefined || !(layer in ALLOWED_IMPORTS))
            {
                continue;
            }
            for (const match of readFileSync(file, "utf8").matchAll(IMPORT_RE))
            {
                const specifier = match[1] ?? match[2] ?? "";
                const target = layerOfImport(specifier, file);
                const allowed = ALLOWED_IMPORTS[layer] ?? [];
                if (target !== undefined && target !== layer && target in ALLOWED_IMPORTS && !allowed.includes(target))
                {
                    violations.push(`${relative(SRC_DIR, file)} imports ${specifier}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });
});
