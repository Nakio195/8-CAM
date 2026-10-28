<script lang="ts">
    import { downloadText } from "../files";
    import { help } from "../help";
    import { i18n } from "../state/i18n.svelte";
    import { exportState } from "../state/export.svelte";
    import { machineState } from "../state/machine.svelte";
    import Button from "../components/base/Button.svelte";
    import Callout from "../components/base/Callout.svelte";
    import IconButton from "../components/base/IconButton.svelte";
    import Sticker from "../components/base/Sticker.svelte";
    import { formatDuration } from "./format";

    // G-code export (specification 6.9, section 7): what to write, where the machine zero is, the files with their checks.
    // The simulation and the text of each file are the next step (SimulationPanel).
    const t = i18n.t;

    let choices = $derived(exportState.choices());
    let separateFiles = $derived(machineState.active.toolChangeMode === "separateFiles");
    let output = $derived(exportState.output);

    function downloadAll(): void
    {
        for (const entry of output?.files ?? [])
        {
            downloadText(entry.name, exportState.text(entry.name), "text/plain");
        }
    }

    let originValues = $derived({ origin: ["lowerLeft", "center", "gerber"].indexOf(exportState.setup.origin), mirror: exportState.setup.mirror ? 1 : 0 });
</script>

{#if choices.length === 0}
    <Callout tone="help">{t("export.empty")}</Callout>
{:else}
    <p class="note">{t("export.machine", { machine: machineState.active.name, profile: machineState.activeProfile.name })}</p>
    <fieldset class="box" use:help={"exportOperations"}>
        <legend>{t("export.operations")}</legend>
        {#each choices as choice (choice.id)}
            <label class="check">
                <input type="checkbox" checked={!exportState.excluded[choice.id]}
                    onchange={(event) => (exportState.excluded = { ...exportState.excluded, [choice.id]: !event.currentTarget.checked })} />
                <span class="name">{choice.label}</span>
            </label>
        {/each}
    </fieldset>

    <label class="field">
        <span>{t("export.origin")}</span>
        <select bind:value={exportState.setup.origin} use:help={{ topic: "origin", values: originValues }}>
            <option value="lowerLeft">{t("export.originLowerLeft")}</option>
            <option value="center">{t("export.originCenter")}</option>
            <option value="gerber">{t("export.originGerber")}</option>
        </select>
    </label>
    <label class="check" use:help={{ topic: "mirror", values: originValues }}>
        <input type="checkbox" bind:checked={exportState.setup.mirror} />
        {t("export.mirror")}
    </label>
    {#if exportState.bottomWithoutMirror()}
        <Callout tone="info">{t("export.bottomHint")}</Callout>
    {/if}
    {#if separateFiles}
        <Callout tone="info">{t("export.separateFiles", { machine: machineState.active.name })}</Callout>
    {:else}
        <label class="check" use:help={"exportSplit"}>
            <input type="checkbox" bind:checked={exportState.split} />
            {t("export.split")}
        </label>
    {/if}
    <label class="field">
        <span>{t("export.name")}</span>
        <input type="text" bind:value={exportState.name} placeholder={exportState.defaultName()} use:help={""} />
    </label>

    {#if exportState.running}
        <div class="running" role="status">
            <span>{t("export.writing")}</span>
            <progress></progress>
            <IconButton icon="close" size={16} label={t("machining.cancel")} help="" onclick={() => exportState.cancel()} />
        </div>
    {:else}
        <div>
            <Button variant="primary" icon="download" help="exportRun" onclick={() => exportState.run()}>{t("export.run")}</Button>
        </div>
    {/if}
    {#if exportState.error}
        <Callout tone="error">{t("machining.failed", { message: exportState.error })}</Callout>
    {/if}
    {#if exportState.stale}
        <Callout tone="info">{t("export.stale")}</Callout>
    {/if}

    {#if output}
        {#each output.textIssues as reason (reason)}
            <Callout tone="error">{t(`post.safety.${reason}`)}</Callout>
        {/each}
        {#each output.forbidden as entry (entry.file + entry.line)}
            <Callout tone="error">{t("export.forbidden", { file: entry.file, word: entry.word, line: entry.line })}</Callout>
        {/each}
        {#each output.issues as issue (issue.code + String(issue.operation))}
            <Callout tone={issue.severity === "error" ? "error" : "warning"}>{t(`post.job.${issue.code}`)}</Callout>
        {/each}
        {#if output.textIssues.length === 0 && output.forbidden.length === 0 && !output.issues.some((issue) => issue.severity === "error")}
            <Callout tone="success">{t("export.safe")}</Callout>
        {/if}
        {#if output.extent}
            <p class="mono">{t("export.extent", {
                x: i18n.number(output.extent.xMax - output.extent.xMin, 1),
                y: i18n.number(output.extent.yMax - output.extent.yMin, 1),
                xMin: i18n.number(output.extent.xMin, 2),
                yMin: i18n.number(output.extent.yMin, 2)
            })}</p>
        {/if}

        {#if separateFiles && output.files.length > 1}
            <ol class="steps" use:help={"machineToolChange"}>
                {#each output.files as entry, index (entry.name)}
                    <li>{t(index === 0 ? "export.stepFirst" : "export.stepNext", { file: entry.name })}</li>
                {/each}
            </ol>
        {/if}
        <ul class="files" use:help={""}>
            {#each output.files as entry (entry.name)}
                <li>
                    <span class="mono name">{entry.name}</span>
                    <span class="note">{t("export.fileInfo", { lines: entry.lineCount, duration: formatDuration(entry.duration, t) })}</span>
                    {#if exportState.edited[entry.name] !== undefined}<Sticker tone="warning" icon="edit">{t("export.editedTag")}</Sticker>{/if}
                    <IconButton icon="download" size={16} help="" label={t("export.download", { file: entry.name })}
                        onclick={() => downloadText(entry.name, exportState.text(entry.name), "text/plain")} />
                </li>
            {/each}
        </ul>
        {#if output.files.length > 1}
            <div><Button variant="secondary" icon="download" help="" onclick={downloadAll}>{t("export.downloadAll")}</Button></div>
        {/if}

    {/if}
{/if}

<style>
    .box
    {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin: 0;
        padding: 6px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
    }

    legend
    {
        font-weight: 600;
    }

    .field
    {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-weight: 600;
    }

    select,
    input[type="text"]
    {
        padding: 6px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        font-weight: 400;
    }

    .check
    {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .name
    {
        overflow-wrap: anywhere;
    }

    .running
    {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    progress
    {
        flex: 1;
        width: 100%;
        accent-color: var(--accent-formation);
    }

    .steps
    {
        margin: 0;
        padding-left: 20px;
        font-size: 13px;
    }

    .steps li
    {
        margin-bottom: 4px;
        overflow-wrap: anywhere;
    }

    .files
    {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .files li
    {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
    }

    .mono
    {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 12px;
    }

    .note
    {
        margin: 0;
        font-size: 11px;
        color: var(--text-muted);
    }
</style>
