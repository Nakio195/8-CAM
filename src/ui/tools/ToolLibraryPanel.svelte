<script lang="ts">
    import { onMount } from "svelte";
    import type { Tool, ToolType } from "@cam/tools/index";
    import { MAX_SETTINGS_BYTES } from "../files";
    import { i18n } from "../state/i18n.svelte";
    import { project } from "../state/project.svelte";
    import { blankTool, toolLibrary } from "../state/tools.svelte";
    import Button from "../components/base/Button.svelte";
    import Callout from "../components/base/Callout.svelte";
    import ToolCard from "./ToolCard.svelte";
    import ToolEditor from "./ToolEditor.svelte";
    import { toolLabel } from "./labels";

    const t = i18n.t;
    const TYPE_ORDER: Record<ToolType, number> = { vbit: 0, endmill: 1, drill: 2 };

    let editing = $state<Tool | null>(null);
    let editingIsNew = $state(false);
    let message = $state<{ tone: "success" | "error"; text: string } | null>(null);
    let fileInput: HTMLInputElement;

    let sorted = $derived([...toolLibrary.tools].sort((first, second) =>
        TYPE_ORDER[first.type] - TYPE_ORDER[second.type] || first.diameter - second.diameter
        || (first.type === "vbit" ? first.tipAngle - second.tipAngle : 0)));

    onMount(() =>
    {
        void toolLibrary.load();
    });

    function edit(tool: Tool, isNew: boolean): void
    {
        message = null;
        editingIsNew = isNew;
        editing = tool;
    }

    function remove(tool: Tool): void
    {
        if (window.confirm(t("tools.deleteConfirm", { name: toolLabel(tool, t, i18n.number) })))
        {
            toolLibrary.remove(tool.id);
        }
    }

    function reset(): void
    {
        if (window.confirm(t("tools.resetConfirm")))
        {
            toolLibrary.reset();
            message = null;
        }
    }

    function exportFile(): void
    {
        const blob = new Blob([toolLibrary.exportJson()], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = t("tools.exportFileName");
        link.click();
        URL.revokeObjectURL(url);
    }

    async function importFile(event: Event & { currentTarget: HTMLInputElement }): Promise<void>
    {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (!file)
        {
            return;
        }
        if (file.size > MAX_SETTINGS_BYTES)
        {
            message = { tone: "error", text: t("import.tooLarge", { size: Math.round(file.size / 1048576) }) };
            return;
        }
        const result = toolLibrary.importJson(await file.text());
        message = "error" in result
            ? { tone: "error", text: t(`tools.importError.${result.error}`) }
            : { tone: "success", text: t("tools.imported", { added: result.added, skipped: result.skipped }) };
    }
</script>

<section class="panel" aria-labelledby="tools-title">
    <h2 id="tools-title">{t("tools.title")}</h2>
    <div class="actions">
        <Button variant="primary" icon="plus" help="toolAdd" onclick={() => edit(blankTool("vbit"), true)}>{t("tools.add")}</Button>
        <Button variant="ghost" icon="upload" help="" onclick={() => fileInput.click()}>{t("tools.import")}</Button>
        <Button variant="ghost" icon="download" help="" onclick={exportFile}>{t("tools.export")}</Button>
        <Button variant="ghost" icon="reset" help="toolReset" onclick={reset}>{t("tools.reset")}</Button>
        <input bind:this={fileInput} class="visually-hidden" type="file" accept=".json,application/json" tabindex="-1"
            aria-hidden="true" onchange={importFile} />
    </div>

    {#if !toolLibrary.persistent}
        <Callout tone="warning">{t("tools.notPersistent")}</Callout>
    {/if}
    {#if message}
        <Callout tone={message.tone}>{message.text}</Callout>
    {/if}
    {#if toolLibrary.tools.some((tool) => tool.builtIn)}
        <p class="note">{t("tools.toValidateNote")}</p>
    {/if}

    <ul class="list">
        {#each sorted as tool (tool.id)}
            <li>
                <ToolCard {tool} thickness={project.thickness} onEdit={() => edit(tool, false)}
                    onDuplicate={() => { const copy = toolLibrary.duplicate(tool.id); if (copy) { edit(copy, false); } }}
                    onDelete={() => remove(tool)} />
            </li>
        {/each}
    </ul>
</section>

<ToolEditor bind:tool={editing} isNew={editingIsNew} thickness={project.thickness} onSave={(tool) => toolLibrary.save(tool)} />

<style>
    .panel
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
    }

    h2
    {
        margin: 0;
        font-family: var(--font-title);
        font-size: 20px;
        font-weight: 400;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .actions
    {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .note
    {
        margin: 0;
        font-size: 12px;
        color: var(--text-muted);
    }

    .list
    {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin: 0;
        padding: 0;
        list-style: none;
    }
</style>
