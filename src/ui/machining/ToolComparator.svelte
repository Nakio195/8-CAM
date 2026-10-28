<script lang="ts">
    import { DEFAULT_ISOLATION } from "@cam/isolation/index";
    import { toolWidth } from "@cam/tools/index";
    import { help } from "../help";
    import { i18n } from "../state/i18n.svelte";
    import { machineState } from "../state/machine.svelte";
    import { COMPARISON_LIMIT, machining } from "../state/machining.svelte";
    import { project } from "../state/project.svelte";
    import { toolLibrary } from "../state/tools.svelte";
    import Button from "../components/base/Button.svelte";
    import Callout from "../components/base/Callout.svelte";
    import Sticker from "../components/base/Sticker.svelte";
    import ToolProfile from "../illustrations/ToolProfile.svelte";
    import { toolLabel } from "../tools/labels";
    import BoardPreview from "./BoardPreview.svelte";
    import { formatDuration } from "./format";

    // Tool comparator (specification 6.10): 2 or 3 tools chosen in the side panel, results side by side in a wide
    // window so the board previews stay readable
    const t = i18n.t;

    let selected: string[] = $state([]);
    let layerId = $state("");
    let tools = $derived(machining.isolationTools());
    let layers = $derived(machining.copperLayers());
    let layer = $derived(layers.find((entry) => entry.id === layerId) ?? layers[0]);
    let comparison = $derived(machining.comparison);
    let comparedLayer = $derived(project.layers.find((entry) => entry.id === comparison?.layerId));
    let dialog: HTMLDialogElement | undefined = $state();
    let open = $state(false);

    $effect(() =>
    {
        if (open && dialog && !dialog.open)
        {
            dialog.showModal();
        }
        else if (!open && dialog?.open)
        {
            dialog.close();
        }
    });

    function toggle(id: string, checked: boolean): void
    {
        selected = checked ? [...selected, id].slice(-COMPARISON_LIMIT) : selected.filter((entry) => entry !== id);
    }

    function run(): void
    {
        if (layer)
        {
            // Parameters of the last isolation, so the comparison matches what will be machined
            const params = machining.operations[machining.operations.length - 1]?.params ?? DEFAULT_ISOLATION;
            machining.startComparison(layer.id, selected, params);
            open = true;
        }
    }

    function use(toolId: string): void
    {
        machining.useComparedTool(toolId);
        open = false;
    }
</script>

<section class="comparator" aria-labelledby="comparator-title">
    <h3 id="comparator-title"><span use:help={"compareTools"}>{t("machining.compare")}</span></h3>
    <p class="note">{t("machining.compareNote")}</p>
    {#if layers.length > 1}
        <label class="field">
            <span>{t("machining.layer")}</span>
            <select bind:value={layerId} use:help={"isolationLayer"}>
                {#each layers as entry (entry.id)}
                    <option value={entry.id}>{entry.name}</option>
                {/each}
            </select>
        </label>
    {/if}
    <fieldset use:help={"compareTools"}>
        <legend class="visually-hidden">{t("machining.compare")}</legend>
        {#each tools as tool (tool.id)}
            <label class="check">
                <input type="checkbox" checked={selected.includes(tool.id)}
                    disabled={!selected.includes(tool.id) && selected.length >= COMPARISON_LIMIT}
                    onchange={(event) => toggle(tool.id, event.currentTarget.checked)} />
                {toolLabel(tool, t, i18n.number)}
            </label>
        {/each}
    </fieldset>
    <div>
        <Button variant="secondary" icon="contrast" help="compareRun" disabled={selected.length < 2 || !layer || comparison?.running}
            onclick={run}>{t("machining.compareRun")}</Button>
    </div>

    <dialog bind:this={dialog} class="results" aria-labelledby="comparison-title" onclose={() => (open = false)}>
        <div class="dialog-head">
            <h2 id="comparison-title">{t("machining.compare")}</h2>
            <Button variant="ghost" icon="close" help="dialogClose" onclick={() => (open = false)}>{t("about.close")}</Button>
        </div>
        {#if comparison?.error}
            <Callout tone="error">{t("machining.failed", { message: comparison.error })}</Callout>
        {/if}
        {#if comparison && comparedLayer}
            <p class="note">{t("machining.timeNote", { rapid: machineState.active.rapidFeed })}</p>
            <div class="columns" style:--columns={comparison.toolIds.length}>
                {#each comparison.toolIds as toolId (toolId)}
                    {@const tool = toolLibrary.find(toolId)}
                    {@const result = comparison.results[toolId]}
                    {#if tool}
                        <div class="column">
                            <div class="profile">
                                <ToolProfile type={tool.type} diameter={tool.diameter} tipDiameter={tool.tipDiameter} tipAngle={tool.tipAngle} />
                            </div>
                            <strong class="name">{toolLabel(tool, t, i18n.number)}</strong>
                            <dl>
                                <dt>{t("machining.compareWidth")}</dt>
                                <dd class="mono">{i18n.number(toolWidth(tool), 3)} mm</dd>
                                <dt>{t("machining.compareTime")}</dt>
                                <dd>{result ? formatDuration(result.duration, t) : t("machining.compareWaiting")}</dd>
                                <dt>{t("machining.compareZones")}</dt>
                                <dd>
                                    {#if !result}
                                        …
                                    {:else if result.zones.length === 0}
                                        <Sticker tone="success" icon="check">0</Sticker>
                                    {:else}
                                        <Sticker tone="error" icon="error">{result.zones.length}</Sticker>
                                    {/if}
                                </dd>
                            </dl>
                            {#if result}
                                <BoardPreview copper={comparedLayer.file.geometry} loops={result.loops} zones={result.zoneShapes}
                                    label={t("machining.previewLabel", { tool: toolLabel(tool, t, i18n.number) })} />
                                <Button variant="ghost" icon="check" help="compareUse" onclick={() => use(toolId)}>
                                    {t("machining.compareUse")}
                                </Button>
                            {/if}
                        </div>
                    {/if}
                {/each}
            </div>
        {/if}
    </dialog>
</section>

<style>
    .comparator
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    h3
    {
        margin: 12px 0 0;
        font-family: var(--font-title);
        font-size: 18px;
        font-weight: 400;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        border-bottom: 2px solid var(--brand-rose);
    }

    h2
    {
        margin: 0;
        font-family: var(--font-title);
        font-size: 26px;
        font-weight: 400;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }

    .note
    {
        margin: 0;
        font-size: 12px;
        color: var(--text-muted);
    }

    .field
    {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-weight: 600;
    }

    .field select
    {
        padding: 6px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        font-weight: 400;
    }

    fieldset
    {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 0;
        padding: 0;
        border: none;
    }

    .check
    {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .results
    {
        width: min(980px, calc(100vw - 24px));
        max-height: calc(100vh - 24px);
        padding: 16px 20px;
        border: none;
        border-radius: var(--radius-large);
        background: var(--surface-panel);
        color: var(--text);
        box-shadow: var(--shadow);
    }

    .results::backdrop
    {
        background: rgba(31, 16, 28, 0.6);
    }

    .dialog-head
    {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
    }

    .columns
    {
        display: grid;
        grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
        gap: 12px;
        margin-top: 10px;
    }

    .column
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
    }

    .profile
    {
        max-width: 120px;
    }

    .name
    {
        font-size: 14px;
        overflow-wrap: anywhere;
    }

    dl
    {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 4px 10px;
        margin: 0;
        font-size: 13px;
    }

    dt
    {
        color: var(--text-muted);
    }

    dd
    {
        margin: 0;
    }

    .mono
    {
        font-family: var(--font-mono);
    }

    @media (max-width: 700px)
    {
        .columns
        {
            grid-template-columns: 1fr;
        }
    }
</style>
