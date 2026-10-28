<script lang="ts">
    import { downloadText, readChosenFile } from "../files";
    import { i18n } from "../state/i18n.svelte";
    import { exportState } from "../state/export.svelte";
    import { project } from "../state/project.svelte";
    import { MAX_PROJECT_BYTES } from "@project/index";
    import { openProject, projectText } from "../state/projectFile.svelte";
    import Button from "./base/Button.svelte";
    import Callout from "./base/Callout.svelte";

    // Save and open the whole project (specification 6.9): source files, settings, tools, machine and operations.
    const t = i18n.t;

    let input: HTMLInputElement;
    let message = $state<{ tone: "success" | "error"; text: string } | null>(null);
    let opening = $state(false);

    function save(): void
    {
        const name = (exportState.name.trim() || exportState.defaultName()).replace(/[^\w.-]+/g, "_");
        downloadText(`${name}.8cam.json`, projectText());
        message = { tone: "success", text: t("projectFile.saved") };
    }

    async function open(event: Event & { currentTarget: HTMLInputElement }): Promise<void>
    {
        const chosen = await readChosenFile(event, MAX_PROJECT_BYTES);
        if (chosen === null)
        {
            return;
        }
        if ("tooLarge" in chosen)
        {
            message = { tone: "error", text: t("import.tooLarge", { size: chosen.tooLarge }) };
            return;
        }
        const text = chosen.text;
        if (project.layers.length > 0 && !window.confirm(t("projectFile.replaceConfirm")))
        {
            return;
        }
        opening = true;
        const error = await openProject(text);
        opening = false;
        message = error ? { tone: "error", text: t(`projectFile.error.${error}`) } : { tone: "success", text: t("projectFile.opened") };
    }
</script>

<div class="bar">
    <Button variant="secondary" icon="save" help="projectSave" disabled={project.layers.length === 0} onclick={save}>{t("projectFile.save")}</Button>
    <Button variant="ghost" icon="open" help="projectOpen" disabled={opening} onclick={() => input.click()}>{t("projectFile.open")}</Button>
    <input bind:this={input} class="visually-hidden" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true"
        onchange={open} />
</div>
{#if message}
    <Callout tone={message.tone}>{message.text}</Callout>
{/if}

<style>
    .bar
    {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
</style>
