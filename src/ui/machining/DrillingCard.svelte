<script lang="ts">
    import { untrack } from "svelte";
    import { DRILL_TOLERANCE_MM, DRILL_TOLERANCE_RATIO } from "@cam/analysis/index";
    import type { DrillingParams } from "@cam/drilling/index";
    import { INTERNAL_UNITS_PER_MM } from "@core/units/index";
    import type { DrillingOperation } from "@project/index";
    import { help } from "../help";
    import { help as helpState } from "../state/help.svelte";
    import { i18n } from "../state/i18n.svelte";
    import { machineState } from "../state/machine.svelte";
    import { diameterKey, machining } from "../state/machining.svelte";
    import { project } from "../state/project.svelte";
    import { toolLibrary } from "../state/tools.svelte";
    import Button from "../components/base/Button.svelte";
    import Callout from "../components/base/Callout.svelte";
    import IconButton from "../components/base/IconButton.svelte";
    import NumberField from "../components/base/NumberField.svelte";
    import Sticker from "../components/base/Sticker.svelte";
    import { toolLabel } from "../tools/labels";
    import { formatDuration } from "./format";

    let { operation }: { operation: DrillingOperation } = $props();

    const t = i18n.t;
    const mm = (value: number): number => value / INTERNAL_UNITS_PER_MM;

    let layers = $derived(machining.drillLayers());
    let sizes = $derived(machining.holeSizes(operation.layerIds));
    let tools = $derived(machining.holeTools());
    let job = $derived(machining.jobs[operation.id]);
    let result = $derived(operation.result);

    // Field values are kept here, seeded once from the operation (the card is keyed by operation), and pushed to it,
    // which marks the result as stale
    let peckDepth = $state(untrack(() => operation.params.peckDepth));
    let dwell = $state(untrack(() => operation.params.dwell));
    let depth = $state(untrack(() => operation.params.depth));

    function setParams(changes: Partial<DrillingParams>): void
    {
        machining.updateDrilling(operation.id, { params: { ...operation.params, ...changes } });
    }

    $effect(() =>
    {
        const values = {
            peckDepth: Math.max(0.05, Math.min(10, peckDepth || 0.05)),
            dwell: Math.max(0, Math.min(10, dwell || 0)),
            depth: Math.max(0.1, Math.min(10, depth || 0.1))
        };
        const params = operation.params;
        if (values.peckDepth !== params.peckDepth || values.dwell !== params.dwell || values.depth !== params.depth)
        {
            setParams(values);
        }
    });

    function toggleLayer(id: string, checked: boolean): void
    {
        const layerIds = checked ? [...operation.layerIds, id] : operation.layerIds.filter((entry) => entry !== id);
        machining.updateDrilling(operation.id, { layerIds });
    }

    function assign(diameter: number, toolId: string): void
    {
        machining.updateDrilling(operation.id, { assignments: { ...operation.assignments, [diameterKey(diameter)]: toolId || null } });
    }

    function remove(): void
    {
        if (window.confirm(t("machining.drillRemoveConfirm")))
        {
            machining.removeDrilling(operation.id);
        }
    }

    /** Deviation of the chosen drill from the hole, and whether it is beyond the tolerance of the recommendation. */
    function deviation(diameter: number, toolDiameter: number): { text: string; outOfTolerance: boolean }
    {
        const hole = mm(diameter);
        const value = toolDiameter - hole;
        const tolerance = Math.max(DRILL_TOLERANCE_MM, DRILL_TOLERANCE_RATIO * hole);
        const sign = value > 0 ? "+" : "";
        return {
            text: t("machining.deviation", { deviation: `${sign}${i18n.number(value, 3)}`, ratio: `${sign}${i18n.number((value / hole) * 100, 1)}` }),
            outOfTolerance: Math.abs(value) > tolerance + 1e-9
        };
    }

    let helpValues = $derived({ cycle: operation.params.cycle === "peck" ? 1 : 0, peckDepth, drillDepth: depth, thickness: project.thickness });
    let saved = $derived(result ? result.distances.file - result.distances.optimized : 0);
</script>

<article class="card" aria-label={t("machining.drilling")}>
    <div class="head">
        <h3>{t("machining.drilling")}</h3>
        <IconButton icon={operation.visible ? "eye" : "eyeOff"} size={16} help="drillingVisibility"
            label={t(operation.visible ? "machining.hide" : "machining.show")}
            onclick={() => machining.updateDrilling(operation.id, { visible: !operation.visible })} />
        <IconButton icon="remove" size={16} label={t("machining.remove")} help="drillingRemove" onclick={remove} />
    </div>

    <fieldset class="layers" use:help={"drillingLayers"}>
        <legend>{t("machining.drillLayers")}</legend>
        {#each layers as layer (layer.id)}
            <label class="check">
                <input type="checkbox" checked={operation.layerIds.includes(layer.id)}
                    onchange={(event) => toggleLayer(layer.id, event.currentTarget.checked)} />
                <span class="name">{layer.name}</span>
            </label>
        {/each}
    </fieldset>

    {#if sizes.length === 0}
        <Callout tone="warning">{t("machining.noHoles")}</Callout>
    {:else}
        <div class="sizes">
            <span class="title">{t("machining.holeSizes")}</span>
            {#each sizes as size (size.diameter)}
                {@const toolId = operation.assignments[diameterKey(size.diameter)] ?? ""}
                {@const tool = toolId ? toolLibrary.find(toolId) : undefined}
                <div class="size">
                    <span class="mono">
                        {t("machining.holeSize", { diameter: i18n.number(mm(size.diameter), 3), count: size.holes + size.slots })}
                        {#if size.slots > 0}<span class="note">{t("machining.holeSlots", { count: size.slots })}</span>{/if}
                    </span>
                    <select value={toolId} use:help={"holeTool"} aria-label={t("machining.holeToolFor", { diameter: i18n.number(mm(size.diameter), 3) })}
                        onchange={(event) => assign(size.diameter, event.currentTarget.value)}>
                        <option value="">{t("machining.notMachined")}</option>
                        {#each tools as entry (entry.id)}
                            <option value={entry.id}>{toolLabel(entry, t, i18n.number)}</option>
                        {/each}
                    </select>
                    {#if tool?.type === "drill"}
                        {@const gap = deviation(size.diameter, tool.diameter)}
                        <span class="mono deviation">{gap.text}</span>
                        {#if gap.outOfTolerance}
                            <Sticker tone="warning" icon="warning">{t("machining.outOfTolerance")}</Sticker>
                        {/if}
                    {:else if tool}
                        <button class="indicator" type="button"
                            use:help={{ topic: "holeMilling", values: { hole: mm(size.diameter), toolDiameter: tool.diameter } }}
                            onclick={(event) => helpState.show("holeMilling", event.currentTarget, true)}>
                            <Sticker tone={tool.diameter > mm(size.diameter) ? "error" : "info"} icon="tool">{t("machining.milled")}</Sticker>
                        </button>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}

    <label class="field">
        <span>{t("machining.cycle")}</span>
        <select value={operation.params.cycle} use:help={{ topic: "drillCycle", values: helpValues }}
            onchange={(event) => setParams({ cycle: event.currentTarget.value === "peck" ? "peck" : "simple" })}>
            <option value="simple">{t("machining.cycleSimple")}</option>
            <option value="peck">{t("machining.cyclePeck")}</option>
        </select>
    </label>
    <div class="grid">
        <NumberField id={`${operation.id}-depth`} label={t("machining.drillDepth")} help="drillDepth" unit="mm" step={0.1} min={0.1} max={10}
            bind:value={depth} helpLabel={`${t("header.help")} : ${t("help.drillDepth.title")}`} {helpValues} />
        {#if operation.params.cycle === "peck"}
            <NumberField id={`${operation.id}-peck`} label={t("machining.peckDepth")} help="peck" unit="mm" step={0.1} min={0.05} max={10}
                bind:value={peckDepth} helpLabel={`${t("header.help")} : ${t("help.peck.title")}`} {helpValues} />
        {/if}
        <NumberField id={`${operation.id}-dwell`} label={t("machining.dwell")} help="dwell" unit="s" step={0.1} min={0} max={10}
            bind:value={dwell} helpLabel={`${t("header.help")} : ${t("help.dwell.title")}`} />
    </div>

    {#if job}
        <div class="running" role="status">
            <span>{t("machining.computing")}</span>
            <progress></progress>
            <IconButton icon="close" size={16} label={t("machining.cancel")} help="drillingCancel" onclick={() => job?.cancel()} />
        </div>
    {:else}
        <div>
            <Button variant="primary" icon="tool" help="drillingRun" disabled={sizes.length === 0}
                onclick={() => machining.runDrilling(operation.id)}>{t("machining.run")}</Button>
        </div>
    {/if}

    {#if machining.errors[operation.id]}
        <Callout tone="error">{t("machining.failed", { message: machining.errors[operation.id] ?? "" })}</Callout>
    {/if}

    {#if result}
        <div class="result">
            {#if result.safetyIssues > 0}
                <Callout tone="error">{t("machining.safety", { count: result.safetyIssues })}</Callout>
            {/if}
            {#each result.issues as issue, index (index)}
                <Callout tone={issue.code === "drillTooSmall" || issue.code === "slotWithDrill" ? "warning" : "error"}>
                    {t(`machining.issue.${issue.code}`, { diameter: i18n.number(mm(issue.diameter), 3), count: issue.count })}
                </Callout>
            {/each}
            <ul class="runs">
                {#each result.runs as run, index (index)}
                    <li class="mono">
                        {toolLabel(run.tool, t, i18n.number)} :
                        {t("machining.runCounts", { hits: run.hits, milled: run.milled, slots: run.slots })}
                    </li>
                {/each}
            </ul>
            <button class="indicator saving" type="button" use:help={"drillDistance"}
                onclick={(event) => helpState.show("drillDistance", event.currentTarget, true)}>
                <Sticker tone="success" icon="check">
                    {t("machining.distanceSaved", {
                        saved: i18n.number(mm(saved) / 1000, 2),
                        percent: i18n.number(result.distances.file > 0 ? (saved / result.distances.file) * 100 : 0, 0)
                    })}
                </Sticker>
            </button>
            <p class="mono">
                {t("machining.distanceDetail", {
                    optimized: i18n.number(mm(result.distances.optimized) / 1000, 2),
                    file: i18n.number(mm(result.distances.file) / 1000, 2),
                    nearest: i18n.number(mm(result.distances.nearest) / 1000, 2)
                })}
            </p>
            <p class="mono">{t("machining.toolChanges", { count: result.toolChanges })}</p>
            <button class="indicator" type="button" use:help={"estimatedTime"}
                onclick={(event) => helpState.show("estimatedTime", event.currentTarget, true)}>
                <Sticker tone="info" icon="clock">{formatDuration(result.duration, t)}</Sticker>
            </button>
            <p class="note">{t("machining.timeNote", { rapid: machineState.active.rapidFeed })}</p>
            <label class="check" use:help={"showFileOrder"}>
                <input type="checkbox" checked={operation.showFileOrder}
                    onchange={(event) => machining.updateDrilling(operation.id, { showFileOrder: event.currentTarget.checked })} />
                {t("machining.showFileOrder")}
            </label>
        </div>
    {:else if !job && sizes.length > 0}
        <Callout tone="info">{t("machining.stale")}</Callout>
    {/if}
</article>

<style>
    .card
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
        border: 1px solid var(--border);
        border-left: 4px solid var(--accent-cowork);
        border-radius: var(--radius);
        background: var(--surface);
    }

    .head
    {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    h3
    {
        flex: 1;
        margin: 0;
        font-family: var(--font-title);
        font-size: 18px;
        font-weight: 400;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }

    .layers
    {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin: 0;
        padding: 6px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
    }

    legend,
    .title
    {
        font-weight: 600;
    }

    .name
    {
        overflow-wrap: anywhere;
    }

    .sizes
    {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .size
    {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--border);
    }

    .size .mono:first-child
    {
        min-width: 96px;
    }

    .field
    {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-weight: 600;
    }

    select
    {
        padding: 6px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        font-weight: 400;
    }

    .grid
    {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    .check
    {
        display: inline-flex;
        align-items: center;
        gap: 6px;
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
        accent-color: var(--accent-cowork);
    }

    .result
    {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
    }

    .runs
    {
        margin: 0;
        padding-left: 16px;
    }

    .mono
    {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 12px;
    }

    .deviation
    {
        color: var(--text-muted);
    }

    .indicator
    {
        padding: 0;
        border: none;
        background: none;
        color: inherit;
        text-align: left;
        cursor: help;
    }

    .note
    {
        margin: 0 0 0 4px;
        font-size: 11px;
        color: var(--text-muted);
    }
</style>
