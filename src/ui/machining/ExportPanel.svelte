<script lang="ts">
    import { onDestroy } from "svelte";
    import { downloadText } from "../files";
    import { help } from "../help";
    import { help as helpState } from "../state/help.svelte";
    import { i18n } from "../state/i18n.svelte";
    import { exportState } from "../state/export.svelte";
    import { machineState } from "../state/machine.svelte";
    import Button from "../components/base/Button.svelte";
    import Callout from "../components/base/Callout.svelte";
    import IconButton from "../components/base/IconButton.svelte";
    import Sticker from "../components/base/Sticker.svelte";
    import GcodePreview from "../machine/GcodePreview.svelte";
    import { formatDuration } from "./format";

    // G-code export (specification 6.9, section 7): what to write, where the machine zero is, the files with their checks,
    // the simulation played over the board and the text of each file, which can be edited by hand.
    const t = i18n.t;
    /** Lines shown in the text view: a dense board writes hundreds of thousands. */
    const SHOWN_LINES = 1500;
    const SPEEDS = [1, 5, 20, 100, 500];

    let choices = $derived(exportState.choices());
    let output = $derived(exportState.output);
    let fileName = $state("");
    let editing = $state(false);
    let draft = $state("");
    let file = $derived(output?.files.find((entry) => entry.name === fileName) ?? output?.files[0] ?? null);
    let text = $derived(file ? exportState.text(file.name) : "");
    let shown = $derived(text.split("\n").slice(0, SHOWN_LINES).join("\n"));
    let lineTotal = $derived(file?.lineCount ?? 0);

    function clock(seconds: number): string
    {
        const whole = Math.max(0, Math.round(seconds));
        const hours = Math.floor(whole / 3600);
        const minutes = Math.floor((whole % 3600) / 60);
        const rest = String(whole % 60).padStart(2, "0");
        return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
    }

    // Playback: ten steps a second, the simulation time advancing with the clock times the speed. Moving the slider
    // while playing goes on from there.
    const STEP_MS = 100;
    let timer = 0;
    let last = 0;

    function stop(): void
    {
        window.clearInterval(timer);
        exportState.playing = false;
    }

    function step(): void
    {
        const now = performance.now();
        const elapsed = (now - last) / 1000;
        last = now;
        exportState.time = Math.min(exportState.duration, exportState.time + elapsed * exportState.speed);
        if (exportState.time >= exportState.duration)
        {
            stop();
        }
    }

    function togglePlay(): void
    {
        if (exportState.playing)
        {
            stop();
            return;
        }
        if (exportState.time >= exportState.duration)
        {
            exportState.time = 0;
        }
        last = performance.now();
        exportState.playing = true;
        timer = window.setInterval(step, STEP_MS);
    }

    onDestroy(stop);

    function startEditing(): void
    {
        draft = text;
        editing = true;
    }

    function saveEdit(): void
    {
        if (file)
        {
            exportState.edited = { ...exportState.edited, [file.name]: draft };
        }
        editing = false;
    }

    function revert(): void
    {
        if (file)
        {
            exportState.edited = Object.fromEntries(Object.entries(exportState.edited).filter(([name]) => name !== file.name));
        }
        editing = false;
    }

    function downloadAll(): void
    {
        for (const entry of output?.files ?? [])
        {
            downloadText(entry.name, exportState.text(entry.name), "text/plain");
        }
    }

    let originValues = $derived({ origin: ["lowerLeft", "center", "gerber"].indexOf(exportState.setup.origin), mirror: exportState.setup.mirror ? 1 : 0 });
</script>

<section class="panel" aria-labelledby="export-title">
    <h2 id="export-title">{t("export.title")}</h2>
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
        <label class="check" use:help={"exportSplit"}>
            <input type="checkbox" bind:checked={exportState.split} />
            {t("export.split")}
        </label>
        <label class="field">
            <span>{t("export.name")}</span>
            <input type="text" bind:value={exportState.name} placeholder={exportState.defaultName()} use:help={"exportName"} />
        </label>

        {#if exportState.running}
            <div class="running" role="status">
                <span>{t("export.writing")}</span>
                <progress></progress>
                <IconButton icon="close" size={16} label={t("machining.cancel")} help="exportCancel" onclick={() => exportState.cancel()} />
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

            <ul class="files" use:help={"exportDownload"}>
                {#each output.files as entry (entry.name)}
                    <li>
                        <span class="mono name">{entry.name}</span>
                        <span class="note">{t("export.fileInfo", { lines: entry.lineCount, duration: formatDuration(entry.duration, t) })}</span>
                        {#if exportState.edited[entry.name] !== undefined}<Sticker tone="warning" icon="edit">{t("export.editedTag")}</Sticker>{/if}
                        <IconButton icon="download" size={16} help="exportDownload" label={t("export.download", { file: entry.name })}
                            onclick={() => downloadText(entry.name, exportState.text(entry.name), "text/plain")} />
                    </li>
                {/each}
            </ul>
            {#if output.files.length > 1}
                <div><Button variant="secondary" icon="download" help="exportDownload" onclick={downloadAll}>{t("export.downloadAll")}</Button></div>
            {/if}

            <h3 use:help={"backplot"}>{t("export.backplot")}</h3>
            <label class="check" use:help={"backplot"}>
                <input type="checkbox" bind:checked={exportState.showBackplot} />
                {t("export.showBackplot")}
            </label>
            <div class="player">
                <IconButton icon={exportState.playing ? "pause" : "play"} size={18} help="backplotPlay"
                    label={t(exportState.playing ? "export.pause" : "export.play")} onclick={togglePlay} />
                <input class="slider" type="range" min="0" max={exportState.duration} step="any" bind:value={exportState.time}
                    aria-label={t("export.position")} use:help={"backplotTime"} />
                <select bind:value={exportState.speed} aria-label={t("export.speed")} use:help={"backplotSpeed"}>
                    {#each SPEEDS as speed (speed)}
                        <option value={speed}>×{speed}</option>
                    {/each}
                </select>
            </div>
            <progress class="progress" max={exportState.duration || 1} value={exportState.time}></progress>
            <button class="indicator mono" type="button" use:help={"estimatedTime"}
                onclick={(event) => helpState.show("estimatedTime", event.currentTarget, true)}>
                {clock(exportState.time)} / {clock(exportState.duration)}
            </button>

            <h3 use:help={"exportText"}>{t("export.text")}</h3>
            {#if output.files.length > 1}
                <select value={file?.name ?? ""} aria-label={t("export.file")} use:help={"exportFile"} onchange={(event) => { fileName = event.currentTarget.value; editing = false; }}>
                    {#each output.files as entry (entry.name)}
                        <option value={entry.name}>{entry.name}</option>
                    {/each}
                </select>
            {/if}
            {#if file}
                {#each exportState.editedIssues(file.name) as reason (reason)}
                    <Callout tone="error">{t(`post.safety.${reason}`)}</Callout>
                {/each}
                {#if editing}
                    <textarea class="mono editor" bind:value={draft} spellcheck="false" aria-label={t("export.text")} use:help={"exportEdit"}></textarea>
                    <div class="actions">
                        <Button variant="primary" icon="check" help="exportEdit" onclick={saveEdit}>{t("export.saveEdit")}</Button>
                        <Button variant="ghost" icon="close" help="exportEdit" onclick={() => (editing = false)}>{t("export.cancelEdit")}</Button>
                    </div>
                {:else}
                    <GcodePreview text={shown} label={t("export.text")} />
                    {#if lineTotal > SHOWN_LINES}
                        <p class="note">{t("export.moreLines", { shown: SHOWN_LINES, total: lineTotal })}</p>
                    {/if}
                    <div class="actions">
                        <Button variant="secondary" icon="edit" help="exportEdit" onclick={startEditing}>{t("export.edit")}</Button>
                        {#if exportState.edited[file.name] !== undefined}
                            <Button variant="ghost" icon="reset" help="exportEdit" onclick={revert}>{t("export.revert")}</Button>
                        {/if}
                    </div>
                {/if}
            {/if}
        {/if}
    {/if}
</section>

<style>
    .panel
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
    }

    h2,
    h3
    {
        margin: 0;
        font-family: var(--font-title);
        font-weight: 400;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    h2
    {
        font-size: 20px;
    }

    h3
    {
        margin-top: 6px;
        font-size: 16px;
    }

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
    input[type="text"],
    textarea
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

    .running,
    .player
    {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .slider
    {
        flex: 1;
        min-width: 0;
        accent-color: var(--brand-rouge);
    }

    progress
    {
        flex: 1;
        width: 100%;
        accent-color: var(--accent-formation);
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

    .editor
    {
        min-height: 300px;
        resize: vertical;
        white-space: pre;
    }

    .actions
    {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .indicator
    {
        align-self: flex-start;
        padding: 0;
        border: none;
        background: none;
        color: inherit;
        cursor: help;
    }

    .note
    {
        margin: 0;
        font-size: 11px;
        color: var(--text-muted);
    }
</style>
