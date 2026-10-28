<script lang="ts">
    import { untrack } from "svelte";
    import { recommendIsolation, type IsolationStatus } from "@cam/analysis/index";
    import type { IsolationParams } from "@cam/isolation/index";
    import { DEFAULT_RAPID_FEED } from "@cam/toolpath/index";
    import { toolWidth } from "@cam/tools/index";
    import { INTERNAL_UNITS_PER_MM } from "@core/units/index";
    import type { IsolationOperation } from "@project/index";
    import { help } from "../help";
    import { help as helpState } from "../state/help.svelte";
    import { i18n } from "../state/i18n.svelte";
    import { machining } from "../state/machining.svelte";
    import { project } from "../state/project.svelte";
    import { toolLibrary } from "../state/tools.svelte";
    import Button from "../components/base/Button.svelte";
    import Callout from "../components/base/Callout.svelte";
    import IconButton from "../components/base/IconButton.svelte";
    import NumberField from "../components/base/NumberField.svelte";
    import Sticker from "../components/base/Sticker.svelte";
    import { toolLabel } from "../tools/labels";
    import { formatDuration } from "./format";

    let { operation }: { operation: IsolationOperation } = $props();

    const t = i18n.t;
    const ZONES_SHOWN = 8;
    const STATUS_KEYS: Record<IsolationStatus, "analysis.suitable" | "analysis.limit" | "analysis.tooWide"> = {
        suitable: "analysis.suitable",
        limit: "analysis.limit",
        tooWide: "analysis.tooWide"
    };

    let layer = $derived(project.layers.find((entry) => entry.id === operation.layerId));
    let tool = $derived(toolLibrary.find(operation.toolId));
    let advice = $derived(recommendIsolation(toolLibrary.tools, project.board));
    let job = $derived(machining.jobs[operation.id]);
    let result = $derived(operation.result);
    let width = $derived(tool ? toolWidth(tool) : 0.2);

    // Field values are kept here, seeded once from the operation (the card is keyed by operation), and pushed to it,
    // which marks the result as stale
    let passes = $state(untrack(() => operation.params.passes));
    let overlapPercent = $state(untrack(() => Math.round(operation.params.overlap * 100)));
    let extraOffset = $state(untrack(() => operation.params.extraOffset));

    function setParams(changes: Partial<IsolationParams>): void
    {
        machining.update(operation.id, { params: { ...operation.params, ...changes } });
    }

    $effect(() =>
    {
        const count = Math.max(1, Math.min(10, Math.round(passes || 1)));
        const overlap = Math.max(0, Math.min(90, overlapPercent || 0)) / 100;
        const offset = Math.max(0, Math.min(1, extraOffset || 0));
        if (count !== operation.params.passes || overlap !== operation.params.overlap || offset !== operation.params.extraOffset)
        {
            setParams({ passes: count, overlap, extraOffset: offset });
        }
    });

    function zoomTo(centre: { x: number; y: number }, gap: number): void
    {
        project.focusOn({ x: centre.x - gap / 2, y: centre.y }, { x: centre.x + gap / 2, y: centre.y }, 1);
    }

    function remove(): void
    {
        if (window.confirm(t("machining.removeConfirm")))
        {
            machining.remove(operation.id);
        }
    }

    let passesText = $derived(result?.loopsPerPass.map((count, index) => t("machining.loopsPerPass", { pass: index + 1, count })).join(", ") ?? "");
    let helpValues = $derived({ width, passes, overlap: overlapPercent / 100, extraOffset });
</script>

<article class="card" aria-label={t("machining.isolation")}>
    <div class="head">
        <h3>{t("machining.isolation")}</h3>
        <IconButton icon={operation.visible ? "eye" : "eyeOff"} size={16} help="isolationVisibility"
            label={t(operation.visible ? "machining.hide" : "machining.show")}
            onclick={() => machining.update(operation.id, { visible: !operation.visible })} />
        <IconButton icon="remove" size={16} label={t("machining.remove")} help="isolationRemove" onclick={remove} />
    </div>

    {#if !layer}
        <Callout tone="warning">{t("machining.missingLayer")}</Callout>
    {/if}
    {#if !tool}
        <Callout tone="warning">{t("machining.missingTool")}</Callout>
    {/if}

    <label class="field">
        <span>{t("machining.layer")}</span>
        <select value={operation.layerId} use:help={"isolationLayer"}
            onchange={(event) => machining.update(operation.id, { layerId: event.currentTarget.value })}>
            {#each machining.copperLayers() as entry (entry.id)}
                <option value={entry.id}>{entry.name}</option>
            {/each}
        </select>
    </label>

    <label class="field">
        <span>{t("machining.tool")}</span>
        <select value={operation.toolId} use:help={"isolationTool"}
            onchange={(event) => machining.update(operation.id, { toolId: event.currentTarget.value })}>
            {#each advice as entry (entry.tool.id)}
                <option value={entry.tool.id}>
                    {toolLabel(entry.tool, t, i18n.number)} — {i18n.number(entry.width, 3)} mm — {t(STATUS_KEYS[entry.status])}
                </option>
            {/each}
        </select>
    </label>
    {#if tool}
        {@const status = advice.find((entry) => entry.tool.id === tool.id)?.status}
        {#if status}
            <div>
                <Sticker tone={status === "suitable" ? "success" : status === "limit" ? "warning" : "error"}
                    icon={status === "suitable" ? "check" : status === "limit" ? "warning" : "error"}>{t(STATUS_KEYS[status])}</Sticker>
            </div>
        {/if}
    {/if}

    <div class="grid">
        <NumberField id={`${operation.id}-passes`} label={t("machining.passes")} help="passes" step={1} min={1} max={10}
            bind:value={passes} helpLabel={`${t("header.help")} : ${t("help.passes.title")}`} {helpValues} />
        <NumberField id={`${operation.id}-overlap`} label={t("machining.overlap")} help="overlap" unit="%" step={1} min={0} max={90}
            bind:value={overlapPercent} helpLabel={`${t("header.help")} : ${t("help.overlap.title")}`} {helpValues} />
    </div>
    <label class="field">
        <span>{t("machining.direction")}</span>
        <select value={operation.params.direction}
            use:help={{ topic: "millingDirection", values: { direction: operation.params.direction === "climb" ? 0 : 1 } }}
            onchange={(event) => setParams({ direction: event.currentTarget.value === "climb" ? "climb" : "conventional" })}>
            <option value="conventional">{t("machining.conventional")}</option>
            <option value="climb">{t("machining.climb")}</option>
        </select>
    </label>
    <label class="check" use:help={"combinePasses"}>
        <input type="checkbox" checked={operation.params.combinePasses}
            onchange={(event) => setParams({ combinePasses: event.currentTarget.checked })} />
        {t("machining.combine")}
    </label>
    <details class="advanced" open={untrack(() => operation.params.extraOffset > 0)}>
        <summary use:help={"isolationAdvanced"}>{t("machining.advanced")}</summary>
        <NumberField id={`${operation.id}-extra-offset`} label={t("machining.extraOffset")} help="extraOffset" unit="mm" step={0.01}
            min={0} max={1} bind:value={extraOffset} helpLabel={`${t("header.help")} : ${t("help.extraOffset.title")}`} {helpValues} />
    </details>

    {#if job}
        <div class="running" role="status">
            <span>{t("machining.computing")}</span>
            <progress max="1" value={job.fraction}></progress>
            <IconButton icon="close" size={16} label={t("machining.cancel")} help="isolationCancel" onclick={() => job?.cancel()} />
        </div>
    {:else}
        <div>
            <Button variant="primary" icon="tool" help="isolationRun" disabled={!layer || !tool}
                onclick={() => machining.run(operation.id)}>{t("machining.run")}</Button>
        </div>
    {/if}

    {#if machining.errors[operation.id]}
        <Callout tone="error">{t("machining.failed", { message: machining.errors[operation.id] ?? "" })}</Callout>
    {/if}

    {#if result}
        <div class="result">
            <p class="mono">{t("machining.loops", { count: result.loopsPerPass.reduce((sum, count) => sum + count, 0), passes: passesText })}</p>
            <button class="indicator mono" type="button" use:help={"cutLength"}
                onclick={(event) => helpState.show("cutLength", event.currentTarget, true)}>
                {t("machining.length", { cut: i18n.number(result.cutLength / 1000, 2), travel: i18n.number(result.travelLength / 1000, 2) })}
            </button>
            <button class="indicator" type="button" use:help={"estimatedTime"}
                onclick={(event) => helpState.show("estimatedTime", event.currentTarget, true)}>
                <Sticker tone="info" icon="clock">{formatDuration(result.duration, t)}</Sticker>
            </button>
            <p class="note">{t("machining.timeNote", { rapid: DEFAULT_RAPID_FEED })}</p>
            {#if result.zones.length === 0}
                <Callout tone="success">{t("machining.zonesNone")}</Callout>
            {:else}
                <div use:help={"zoneList"}>
                    <Callout tone="error" title={t("machining.zones", { count: result.zones.length })}>
                        <ul class="zones">
                            {#each result.zones.slice(0, ZONES_SHOWN) as zone, index (index)}
                                <li>
                                    <button class="zone" type="button" use:help={"zoomToSpot"} onclick={() => zoomTo(zone.centre, zone.gap)}>
                                        {t("machining.zoneLine", { gap: i18n.number(zone.gap / INTERNAL_UNITS_PER_MM, 3) })}
                                    </button>
                                </li>
                            {/each}
                        </ul>
                        {#if result.zones.length > ZONES_SHOWN}
                            <p class="note">{t("machining.zoneMore", { count: result.zones.length - ZONES_SHOWN })}</p>
                        {/if}
                    </Callout>
                </div>
            {/if}
        </div>
    {:else if !job && layer && tool}
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
        border-left: 4px solid var(--accent-formation);
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

    .advanced summary
    {
        cursor: pointer;
        font-weight: 600;
    }

    .advanced[open] summary
    {
        margin-bottom: 6px;
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
        accent-color: var(--accent-formation);
    }

    .result
    {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
    }

    .mono
    {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 12px;
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
        margin: 0;
        font-size: 11px;
        color: var(--text-muted);
    }

    .zones
    {
        margin: 4px 0 0;
        padding-left: 16px;
    }

    .zone
    {
        padding: 0;
        border: none;
        background: none;
        color: inherit;
        font-family: var(--font-mono);
        font-size: 12px;
        text-decoration: underline;
        cursor: pointer;
    }
</style>
