<script lang="ts">
    import { onDestroy } from "svelte";
    import { help } from "../help";
    import { help as helpState } from "../state/help.svelte";
    import { i18n } from "../state/i18n.svelte";
    import { exportState } from "../state/export.svelte";
    import Button from "../components/base/Button.svelte";
    import Callout from "../components/base/Callout.svelte";
    import IconButton from "../components/base/IconButton.svelte";
    import GcodePreview from "../machine/GcodePreview.svelte";

    // Simulation of the G-code written (specification 6.9): played over the board, and the text of each file, which can
    // be edited by hand.
    const t = i18n.t;
    /** Lines shown in the text view: a dense board writes hundreds of thousands. */
    const SHOWN_LINES = 1500;
    const SPEEDS = [1, 5, 20, 100, 500];

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
</script>

{#if !output}
    <Callout tone="help">{t("export.simulationEmpty")}</Callout>
{:else}
    <label class="check" use:help={"backplot"}>
        <input type="checkbox" bind:checked={exportState.showBackplot} />
        {t("export.showBackplot")}
    </label>
    <div class="player">
        <IconButton icon={exportState.playing ? "pause" : "play"} size={18} help=""
            label={t(exportState.playing ? "export.pause" : "export.play")} onclick={togglePlay} />
        <input class="slider" type="range" min="0" max={exportState.duration} step="any" bind:value={exportState.time}
            aria-label={t("export.position")} use:help={""} />
        <select bind:value={exportState.speed} aria-label={t("export.speed")} use:help={""}>
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
        <select value={file?.name ?? ""} aria-label={t("export.file")} use:help={""} onchange={(event) => { fileName = event.currentTarget.value; editing = false; }}>
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

<style>
    h3
    {
        margin: 6px 0 0;
        font-family: var(--font-title);
        font-weight: 400;
        letter-spacing: 0.04em;
        font-size: 16px;
        text-transform: uppercase;
    }

    select,
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
