<script lang="ts">
    import { recommendCutout, recommendDrilling, recommendIsolation, type IsolationStatus } from "@cam/analysis/index";
    import { INTERNAL_UNITS_PER_MM } from "@core/units/index";
    import { help } from "../help";
    import { help as helpState } from "../state/help.svelte";
    import { i18n } from "../state/i18n.svelte";
    import { project } from "../state/project.svelte";
    import { toolLibrary } from "../state/tools.svelte";
    import Button from "../components/base/Button.svelte";
    import Callout from "../components/base/Callout.svelte";
    import NumberField from "../components/base/NumberField.svelte";
    import Sticker from "../components/base/Sticker.svelte";
    import type { IconName } from "../components/Icon.svelte";
    import { decimalsFor, toolLabel } from "../tools/labels";
    import ClearanceView from "./ClearanceView.svelte";

    // Board analysis and assisted tool choice (specification 6.10)
    const t = i18n.t;
    const mm = (value: number, decimals = 3): string => i18n.number(value / INTERNAL_UNITS_PER_MM, decimals);
    const size = (value: number): string => i18n.number(value, decimalsFor(value));

    const STATUS: Record<IsolationStatus, { tone: "success" | "warning" | "error"; icon: IconName; key: "analysis.suitable" | "analysis.limit" | "analysis.tooWide" }> = {
        suitable: { tone: "success", icon: "check", key: "analysis.suitable" },
        limit: { tone: "warning", icon: "warning", key: "analysis.limit" },
        tooWide: { tone: "error", icon: "error", key: "analysis.tooWide" }
    };

    let board = $derived(project.board);
    let hasCopper = $derived(project.layers.some((layer) => layer.file.analysis));
    let spotLayer = $derived(board.minClearance ? project.layers.find((layer) => layer.id === board.minClearance?.layer) : undefined);
    let isolation = $derived(recommendIsolation(toolLibrary.tools, board));
    let drilling = $derived(recommendDrilling(toolLibrary.tools, board));
    let cutout = $derived(recommendCutout(toolLibrary.tools, board));
    let label = (tool: Parameters<typeof toolLabel>[0]): string => toolLabel(tool, t, i18n.number);

    function pin(topic: string, event: MouseEvent): void
    {
        helpState.show(topic, event.currentTarget as HTMLElement, true);
    }
</script>

<section class="panel" aria-labelledby="analysis-title">
    <h2 id="analysis-title">{t("analysis.title")}</h2>

    {#if !hasCopper}
        <Callout tone="help">{t("analysis.empty")}</Callout>
    {:else}
        <dl class="facts">
            <dt><button class="term" type="button" use:help={"minClearance"} onclick={(event) => pin("minClearance", event)}>{t("analysis.minClearance")}</button></dt>
            <dd class="mono">{board.minClearance ? `${mm(board.minClearance.distance)} mm` : t("analysis.minClearanceNone")}</dd>
            <dt><button class="term" type="button" use:help={"minTrackWidth"} onclick={(event) => pin("minTrackWidth", event)}>{t("analysis.minTrack")}</button></dt>
            <dd class="mono">{board.minTrack ? `${mm(board.minTrack.width)} mm` : "—"}</dd>
            <dt><button class="term" type="button" use:help={"holeSizes"} onclick={(event) => pin("holeSizes", event)}>{t("analysis.holes")}</button></dt>
            <dd class="mono">
                {#if board.smallestHole !== null && board.largestHole !== null}
                    {t("analysis.holeRange", { min: mm(board.smallestHole), max: mm(board.largestHole), count: board.holes.length })}
                {:else}
                    {t("analysis.holesNone")}
                {/if}
            </dd>
        </dl>

        {#if board.minClearance && spotLayer}
            <ClearanceView geometry={spotLayer.file.geometry} a={board.minClearance.a} b={board.minClearance.b}
                distance={board.minClearance.distance} />
            <div>
                <Button variant="ghost" icon="target" help="zoomToSpot"
                    onclick={() => board.minClearance && project.focusOn(board.minClearance.a, board.minClearance.b)}>
                    {t("analysis.zoom")}
                </Button>
            </div>
        {/if}

        <NumberField id="board-thickness" label={t("analysis.thickness")} help="boardThickness" unit="mm" step={0.1} min={0.2} max={10}
            bind:value={project.thickness} helpLabel={`${t("header.help")} : ${t("help.boardThickness.title")}`}
            helpValues={{ thickness: project.thickness }} />

        <h3><button class="term heading" type="button" use:help={"isolationAdvice"} onclick={(event) => pin("isolationAdvice", event)}>{t("analysis.isolation")}</button></h3>
        {#if board.minClearance}
            <p class="note">{t("analysis.isolationNote", { clearance: mm(board.minClearance.distance) })}</p>
        {/if}
        <ul class="advice">
            {#each isolation as entry (entry.tool.id)}
                {@const status = STATUS[entry.status]}
                <li>
                    <div class="line">
                        <span class="name">{label(entry.tool)}</span>
                        <Sticker tone={status.tone} icon={status.icon}>{t(status.key)}</Sticker>
                    </div>
                    <span class="detail mono">
                        {t("tools.width", { width: i18n.number(entry.width, 3) })}
                        {#if entry.status === "tooWide"}
                            · {t("analysis.zones", { count: entry.nonIsolated })}
                        {:else if entry.margin !== null}
                            · {t("analysis.margin", { margin: i18n.number(entry.margin * 100, 0) })}
                        {/if}
                    </span>
                </li>
            {/each}
        </ul>
    {/if}

    {#if board.holes.length > 0}
        <h3><button class="term heading" type="button" use:help={"drillingAdvice"} onclick={(event) => pin("drillingAdvice", event)}>{t("analysis.drilling")}</button></h3>
        <p class="note">{t("analysis.drillingNote")}</p>
        <ul class="advice">
            {#each drilling.holes as entry (entry.hole.diameter)}
                <li>
                    <div class="line">
                        <span class="name mono">{t("analysis.holeLine", { hole: mm(entry.hole.diameter), count: entry.hole.count })}</span>
                        {#if entry.method === "mill"}
                            <Sticker tone="accent" icon="tool">{t("analysis.mill")}</Sticker>
                        {:else if entry.method === "none"}
                            <Sticker tone="error" icon="error">{t("analysis.noTool")}</Sticker>
                        {:else if entry.outOfTolerance}
                            <Sticker tone="warning" icon="warning">{t("analysis.outOfTolerance")}</Sticker>
                        {/if}
                    </div>
                    {#if entry.tool}
                        <span class="detail">
                            → {label(entry.tool)}
                            {#if entry.method === "drill"}
                                <span class="mono">
                                    ({t("analysis.deviation", {
                                        sign: entry.deviation >= 0 ? "+" : "−",
                                        mm: i18n.number(Math.abs(entry.deviation), 3),
                                        ratio: i18n.number(Math.abs(entry.deviationRatio) * 100, 1)
                                    })})
                                </span>
                            {/if}
                        </span>
                    {/if}
                </li>
            {/each}
        </ul>
        {#each drilling.groups.filter((group) => group.holes.length > 1) as group (group.tool.id)}
            <div use:help={"drillGrouping"}>
                <Callout tone="success">
                    {t("analysis.grouping", { holes: group.holes.map((hole) => mm(hole.diameter)).join(" / "), saved: group.holes.length - 1 })}
                </Callout>
            </div>
        {/each}
    {/if}

    {#if hasCopper || board.holes.length > 0}
        <h3><button class="term heading" type="button" use:help={"cutoutAdvice"} onclick={(event) => pin("cutoutAdvice", event)}>{t("analysis.cutout")}</button></h3>
        {#if cutout.length === 0}
            <Callout tone="warning">{t("analysis.noCutoutTool")}</Callout>
        {:else}
            <ul class="advice">
                {#each cutout as entry (entry.tool.id)}
                    <li>
                        <div class="line">
                            <span class="name">{label(entry.tool)}</span>
                            {#if entry.recommended}
                                <Sticker tone="success" icon="check">{t("analysis.recommended")}</Sticker>
                            {/if}
                        </div>
                        <span class="detail mono">{t("analysis.cutoutLine", { passes: entry.passes, depth: size(entry.depth) })}</span>
                    </li>
                {/each}
            </ul>
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

    h2
    {
        margin: 0;
        font-family: var(--font-title);
        font-size: 20px;
        font-weight: 400;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    h3
    {
        margin: 12px 0 0;
        border-bottom: 2px solid var(--brand-rose);
    }

    .term
    {
        padding: 0;
        border: none;
        background: none;
        color: inherit;
        font-weight: 600;
        text-align: left;
        cursor: help;
    }

    .heading
    {
        font-family: var(--font-title);
        font-size: 17px;
        font-weight: 400;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }

    .facts
    {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 4px 10px;
        margin: 0;
    }

    dd
    {
        margin: 0;
    }

    .mono
    {
        font-family: var(--font-mono);
        font-size: 12px;
    }

    .note
    {
        margin: 0;
        font-size: 12px;
        color: var(--text-muted);
    }

    .advice
    {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .advice li
    {
        padding: 6px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
    }

    .line
    {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
    }

    .name
    {
        font-weight: 600;
        overflow-wrap: anywhere;
    }

    .detail
    {
        font-size: 12px;
        color: var(--text-muted);
    }
</style>
