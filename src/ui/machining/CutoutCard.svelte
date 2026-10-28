<script lang="ts">
    import { untrack } from "svelte";
    import { recommendCutout } from "@cam/analysis/index";
    import type { CutoutParams } from "@cam/cutout/index";
    import type { CutoutOperation } from "@project/index";
    import { help } from "../help";
    import { help as helpState } from "../state/help.svelte";
    import { i18n } from "../state/i18n.svelte";
    import { machineState } from "../state/machine.svelte";
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

    let { operation }: { operation: CutoutOperation } = $props();

    const t = i18n.t;

    let outlines = $derived(machining.outlineLayers());
    let advice = $derived(recommendCutout(toolLibrary.tools, project.board));
    let tool = $derived(toolLibrary.find(operation.toolId));
    let result = $derived(operation.result);
    let editing = $derived(machining.editingTabs === operation.id);

    // Field values are kept here, seeded once from the operation (the card is keyed by operation), and pushed to it,
    // which recomputes the cutout at once
    let margin = $state(untrack(() => operation.params.margin));
    let depth = $state(untrack(() => operation.params.depth));
    let tabCount = $state(untrack(() => operation.tabCount));
    let tabWidth = $state(untrack(() => operation.params.tabWidth));
    let tabHeight = $state(untrack(() => operation.params.tabHeight));

    function setParams(changes: Partial<CutoutParams>): void
    {
        machining.updateCutout(operation.id, { params: { ...operation.params, ...changes } });
    }

    $effect(() =>
    {
        const values = {
            margin: Math.max(0, Math.min(20, margin || 0)),
            depth: Math.max(0.1, Math.min(10, depth || 0.1)),
            tabWidth: Math.max(0.2, Math.min(20, tabWidth || 0.2)),
            tabHeight: Math.max(0, Math.min(10, tabHeight || 0))
        };
        const params = operation.params;
        if (values.margin !== params.margin || values.depth !== params.depth || values.tabWidth !== params.tabWidth
            || values.tabHeight !== params.tabHeight)
        {
            setParams(values);
        }
    });

    $effect(() =>
    {
        const count = Math.max(0, Math.min(16, Math.round(tabCount || 0)));
        if (count !== untrack(() => operation.tabCount))
        {
            untrack(() =>
            {
                machining.updateCutout(operation.id, { tabCount: count });
                machining.placeTabs(operation.id);
            });
        }
    });

    function remove(): void
    {
        if (window.confirm(t("machining.cutoutRemoveConfirm")))
        {
            machining.removeCutout(operation.id);
        }
    }

    let helpValues = $derived({
        tabs: tabCount,
        tabWidth,
        tabHeight,
        margin,
        thickness: operation.params.thickness,
        toolDiameter: tool?.diameter ?? 1.5,
        cutDepth: depth,
        depthPerPass: tool?.depthPerPass ?? 0.4,
        direction: operation.params.direction === "climb" ? 0 : 1
    });
</script>

<article class="card" aria-label={t("machining.cutout")}>
    <div class="head">
        <h3>{t("machining.cutout")}</h3>
        <IconButton icon={operation.visible ? "eye" : "eyeOff"} size={16} help="cutoutVisibility"
            label={t(operation.visible ? "machining.hide" : "machining.show")}
            onclick={() => machining.updateCutout(operation.id, { visible: !operation.visible })} />
        <IconButton icon="remove" size={16} label={t("machining.remove")} help="cutoutRemove" onclick={remove} />
    </div>

    <label class="field">
        <span>{t("machining.cutoutSource")}</span>
        <select value={operation.outlineLayerId ?? ""} use:help={"cutoutSource"}
            onchange={(event) => machining.updateCutout(operation.id, { outlineLayerId: event.currentTarget.value || null })}>
            {#each outlines as layer (layer.id)}
                <option value={layer.id}>{layer.name}</option>
            {/each}
            <option value="">{t("machining.cutoutAroundCopper")}</option>
        </select>
    </label>
    {#if result && !result.fromOutline}
        <Callout tone="info">{t("machining.cutoutNoOutline")}</Callout>
    {/if}

    <label class="field">
        <span>{t("machining.cutoutMode")}</span>
        <select value={operation.params.mode} use:help={"cutoutMode"}
            onchange={(event) => setParams({ mode: event.currentTarget.value === "rectangle" ? "rectangle" : "shape" })}>
            <option value="shape">{t("machining.cutoutShape")}</option>
            <option value="rectangle">{t("machining.cutoutRectangle")}</option>
        </select>
    </label>

    <label class="field">
        <span>{t("machining.tool")}</span>
        <select value={operation.toolId} use:help={"cutoutTool"}
            onchange={(event) => machining.updateCutout(operation.id, { toolId: event.currentTarget.value })}>
            {#each advice as entry (entry.tool.id)}
                <option value={entry.tool.id}>
                    {toolLabel(entry.tool, t, i18n.number)} — {t("machining.cutoutPasses", { count: entry.passes })}{entry.recommended ? ` — ${t("machining.recommended")}` : ""}
                </option>
            {/each}
        </select>
    </label>
    {#if !tool}
        <Callout tone="warning">{t("machining.missingTool")}</Callout>
    {/if}

    <div class="grid">
        <NumberField id={`${operation.id}-margin`} label={t("machining.cutoutMargin")} help="cutoutMargin" unit="mm" step={0.1} min={0} max={20}
            bind:value={margin} helpLabel={`${t("header.help")} : ${t("help.cutoutMargin.title")}`} {helpValues} />
        <NumberField id={`${operation.id}-depth`} label={t("machining.cutoutDepth")} help="cutoutDepth" unit="mm" step={0.1} min={0.1} max={10}
            bind:value={depth} helpLabel={`${t("header.help")} : ${t("help.cutoutDepth.title")}`} {helpValues} />
    </div>
    <label class="field">
        <span>{t("machining.direction")}</span>
        <select value={operation.params.direction} use:help={{ topic: "millingDirection", values: helpValues }}
            onchange={(event) => setParams({ direction: event.currentTarget.value === "climb" ? "climb" : "conventional" })}>
            <option value="conventional">{t("machining.conventional")}</option>
            <option value="climb">{t("machining.climb")}</option>
        </select>
    </label>

    <fieldset class="tabs">
        <legend>{t("machining.tabs")}</legend>
        <div class="grid three">
            <NumberField id={`${operation.id}-tab-count`} label={t("machining.tabCount")} help="tabs" step={1} min={0} max={16}
                bind:value={tabCount} helpLabel={`${t("header.help")} : ${t("help.tabs.title")}`} {helpValues} />
            <NumberField id={`${operation.id}-tab-width`} label={t("machining.tabWidth")} help="tabWidth" unit="mm" step={0.5} min={0.2} max={20}
                bind:value={tabWidth} helpLabel={`${t("header.help")} : ${t("help.tabWidth.title")}`} {helpValues} />
            <NumberField id={`${operation.id}-tab-height`} label={t("machining.tabHeight")} help="tabHeight" unit="mm" step={0.1} min={0} max={10}
                bind:value={tabHeight} helpLabel={`${t("header.help")} : ${t("help.tabHeight.title")}`} {helpValues} />
        </div>
        <div class="actions">
            <Button variant="secondary" icon="reset" help="tabsAuto" onclick={() => machining.placeTabs(operation.id)}>{t("machining.tabsAuto")}</Button>
            <Button icon="target" help="tabsEdit" aria-pressed={editing} variant={editing ? "primary" : "secondary"}
                onclick={() => (machining.editingTabs = editing ? null : operation.id)}>
                {t(editing ? "machining.tabsEditDone" : "machining.tabsEdit")}
            </Button>
        </div>
    </fieldset>

    {#if machining.errors[operation.id]}
        <Callout tone="error">{t("machining.failed", { message: machining.errors[operation.id] ?? "" })}</Callout>
    {/if}

    {#if result}
        <div class="result">
            {#if result.safetyIssues > 0}
                <Callout tone="error">{t("machining.safety", { count: result.safetyIssues })}</Callout>
            {/if}
            {#each result.issues as issue (issue)}
                <Callout tone={issue === "noTabs" ? "warning" : "error"}>{t(`machining.cutoutIssue.${issue}`)}</Callout>
            {/each}
            <p class="mono">
                {t("machining.cutoutSummary", {
                    passes: result.passes,
                    lap: i18n.number(result.lapLength, 1),
                    tabs: result.tabs.length
                })}
            </p>
            <button class="indicator" type="button" use:help={"estimatedTime"}
                onclick={(event) => helpState.show("estimatedTime", event.currentTarget, true)}>
                <Sticker tone="info" icon="clock">{formatDuration(result.duration, t)}</Sticker>
            </button>
            <p class="note">{t("machining.timeNote", { rapid: machineState.active.rapidFeed })}</p>
        </div>
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
        border-left: 4px solid var(--brand-rouge);
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

    .grid.three
    {
        grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    }

    .tabs
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 0;
        padding: 6px 8px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
    }

    legend
    {
        font-weight: 600;
    }

    .actions
    {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
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
</style>
