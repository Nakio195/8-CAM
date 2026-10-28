<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import { decimalsFor } from "../tools/labels";
    import { FRAME_HEIGHT, FRAME_WIDTH, holeMilling, round } from "./geometry";

    // Hole milled with an end mill, seen from above (specification 6.5): the tool centre follows a circle of radius
    // (hole - tool) / 2, going down along a helix.
    let { hole, tool }: { hole: number; tool: number } = $props();

    const t = i18n.t;
    const n = (value: number): string => i18n.number(value, decimalsFor(value));
    let shape = $derived(holeMilling(hole, tool));
</script>

<svg class="illustration" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}" role="img"
    aria-label={t(shape.blocked ? "illus.holeMillingBlocked" : "illus.holeMilling", { hole: n(hole), tool: n(tool) })}>
    <rect class="board" x="8" y="8" width="152" height={FRAME_HEIGHT - 36} rx="4" />
    <circle class="hole" cx={shape.centreX} cy={shape.centreY} r={round(shape.holeRadius)} />
    {#if shape.pathRadius > 0}
        <circle class="path" cx={shape.centreX} cy={shape.centreY} r={round(shape.pathRadius)} />
    {/if}
    <circle class="tool" class:blocked={shape.blocked} cx={round(shape.centreX + shape.pathRadius)} cy={shape.centreY} r={round(shape.toolRadius)} />
    <circle class="centre" cx={round(shape.centreX + shape.pathRadius)} cy={shape.centreY} r="2" />
    <text class="label" x="168" y="50">{t("illus.holeSize", { value: n(hole) })}</text>
    <text class="label" x="168" y="66">{t("illus.toolSize", { value: n(tool) })}</text>
    <text class="caption" x="8" y={FRAME_HEIGHT - 12}>
        {shape.blocked ? t("illus.holeTooSmall") : t("illus.holeMillingCaption", { radius: n(Math.max(0, (hole - tool) / 2)) })}
    </text>
</svg>

<style>
    .illustration
    {
        width: 100%;
        max-width: 280px;
        height: auto;
        display: block;
    }

    .board
    {
        fill: var(--illus-board);
        stroke: var(--accent-formation);
        stroke-width: 2;
    }

    .hole
    {
        fill: var(--surface);
        stroke: var(--brand-prune);
        stroke-width: 2;
    }

    .path
    {
        fill: none;
        stroke: var(--accent-cowork);
        stroke-width: 2;
        stroke-dasharray: 5 4;
    }

    .tool
    {
        fill: var(--brand-rose);
        fill-opacity: 0.8;
        stroke: var(--brand-prune);
        stroke-width: 2;
    }

    .tool.blocked
    {
        fill: var(--brand-rouge);
    }

    .centre
    {
        fill: var(--brand-prune);
    }

    .label
    {
        fill: var(--text);
        font-family: var(--font-mono);
        font-size: 10px;
    }

    .caption
    {
        fill: var(--text-muted);
        font-size: 9px;
    }
</style>
