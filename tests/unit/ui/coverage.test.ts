import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import fr from "@ui/i18n/fr.json";
import { HELP_TOPICS } from "@ui/help/topics";

// Specification 6.11: "every parameter, button and indicator has a tooltip". Every control written in the components
// must name a help topic (use:help or the help prop of the base components), except the few listed below. A control
// clear enough on its own (close, remove, language...) says so with an empty topic: help="" or use:help={""}, so a
// forgotten topic is still caught.

const ROOT = join(import.meta.dirname, "..", "..", "..", "src", "ui");

function svelteFiles(directory: string): string[]
{
    return readdirSync(directory).flatMap((name) =>
    {
        const path = join(directory, name);
        return statSync(path).isDirectory() ? svelteFiles(path) : name.endsWith(".svelte") ? [path] : [];
    });
}

/** Opening tags of the controls, up to their closing ">" (attributes may span several lines). */
const CONTROL = /<(button|input|select|textarea|Button|IconButton|NumberField)\b([^>]*(?:\{[^}]*\}[^>]*)*)>/g;

/**
 * Controls without their own topic, and why: hidden file inputs (opened by a button that has one), controls of the help
 * itself (pin, close, search), the tool editor and comparator dialogs whose fields carry their topic on the label, the
 * style guide page (a showcase of the components), radio and checkbox inputs inside a label that has the topic.
 */
function exempt(file: string, tag: string, attributes: string): boolean
{
    if (/visually-hidden/.test(attributes) && /type="file"/.test(attributes))
    {
        return true;
    }
    if (/styleguide|Styleguide/.test(file) || /help[\\/](HelpTipLayer|HelpPanel)\.svelte$/.test(file))
    {
        return true;
    }
    // Checkboxes and radios inside a label carrying the topic, fields of a fieldset carrying it
    return tag === "input" && /type="(checkbox|radio)"|type="text" class="mono"|type="color"/.test(attributes);
}

describe("help coverage", () =>
{
    it("gives every button, field and indicator a help topic", () =>
    {
        const missing: string[] = [];
        for (const file of svelteFiles(ROOT))
        {
            const source = readFileSync(file, "utf8");
            for (const match of source.matchAll(CONTROL))
            {
                const tag = match[1] ?? "";
                const attributes = match[2] ?? "";
                if (/use:help|\bhelp=|\{help\}/.test(attributes) || exempt(file, tag, attributes))
                {
                    continue;
                }
                const line = source.slice(0, match.index).split("\n").length;
                missing.push(`${relative(ROOT, file)}:${line} <${tag}>`);
            }
        }
        expect(missing).toEqual([]);
    });

    it("only uses topics that exist", () =>
    {
        const ids = new Set(HELP_TOPICS.map((topic) => topic.id));
        const unknown: string[] = [];
        for (const file of svelteFiles(ROOT))
        {
            const source = readFileSync(file, "utf8");
            for (const match of source.matchAll(/(?:use:help=\{\{?\s*(?:topic:\s*)?|\bhelp=)"([A-Za-z]+)"/g))
            {
                if (!ids.has(match[1] ?? ""))
                {
                    unknown.push(`${relative(ROOT, file)}: ${match[1]}`);
                }
            }
        }
        expect(unknown).toEqual([]);
    });

    it("gives every numeric parameter a recommended value", () =>
    {
        const withoutAdvice: string[] = [];
        for (const file of svelteFiles(ROOT))
        {
            for (const match of readFileSync(file, "utf8").matchAll(/<NumberField\b[^>]*?help="(\w+)"/gs))
            {
                const topic = match[1] ?? "";
                if (!(`help.${topic}.advice` in fr))
                {
                    withoutAdvice.push(topic);
                }
            }
        }
        expect([...new Set(withoutAdvice)]).toEqual([]);
    });

    it("has a tooltip text for each topic used in the code", () =>
    {
        expect(HELP_TOPICS.filter((topic) => !(`help.${topic.id}.title` in fr))).toEqual([]);
    });
});
