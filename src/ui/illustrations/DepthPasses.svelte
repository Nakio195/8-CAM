<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import { decimalsFor } from "../tools/labels";
    import { depthPasses, FRAME_HEIGHT, FRAME_WIDTH, round } from "./geometry";

    // Depth reached pass after pass (specification 6.12): one band per pass in the board edge
    let { depth, depthPerPass, thickness = 1.6 }: { depth: number; depthPerPass: number; thickness?: number } = $props();

    const t = i18n.t;
    let shape = $derived(depthPasses(depth, depthPerPass, thickness));
    const LEFT = 30;
    const RIGHT = 190;
    const n = (value: number): string => i18n.number(value, decimalsFor(value));
</script>

<svg class="illustration" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}" role="img"
    aria-label={t("illus.depthPasses", { count: shape.passCount, depth: n(depth), perPass: n(depthPerPass) })}>
    <rect class="board" x={LEFT} y={round(shape.surfaceY)} width={RIGHT - LEFT} height={round(shape.bottomY - shape.surfaceY)} />
    {#each shape.passes as passY, index (index)}
        {@const top = index === 0 ? shape.surfaceY : (shape.passes[index - 1] ?? shape.surfaceY)}
        <rect class="pass" class:odd={index % 2 === 1} x={LEFT} y={round(top)} width="40" height={round(passY - top)} />
        <line class="level" x1={LEFT} y1={round(passY)} x2={RIGHT + 6} y2={round(passY)} />
    {/each}
    {#each shape.labels as label (label.number)}
        <text class="label" x={RIGHT + 10} y={round(label.y + 4)}>{label.number}</text>
    {/each}
    <line class="dimension" x1={LEFT - 12} y1={round(shape.surfaceY)} x2={LEFT - 12} y2={round(shape.passes[shape.passes.length - 1] ?? shape.surfaceY)} />
    <text class="label" x={LEFT} y={FRAME_HEIGHT - 20}>
        <tspan class="strong">{t("illus.passCount", { count: shape.passCount })}</tspan>
        <tspan dx="8">{t("illus.perPass", { value: n(depthPerPass) })}</tspan>
    </text>
    <text class="caption" x={LEFT} y={FRAME_HEIGHT - 6}>{t("illus.boardEdge", { thickness: n(thickness) })}</text>
</svg>

<style>
    .illustration
    {
        width: 100%;
        max-width: 280px;
        height: auto;
        display: block;
    }

    rect,
    line
    {
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    .board
    {
        fill: var(--illus-board);
        stroke: var(--accent-formation);
    }

    .pass
    {
        fill: var(--brand-rose);
        stroke: none;
    }

    .pass.odd
    {
        fill: var(--illus-soft);
    }

    .level
    {
        stroke: var(--brand-prune);
        stroke-width: 1;
        stroke-dasharray: 3 3;
    }

    .dimension
    {
        stroke: var(--brand-rouge);
    }

    .label
    {
        fill: var(--text);
        font-family: var(--font-mono);
        font-size: 11px;
    }

    .strong
    {
        font-family: var(--font-title);
        font-size: 16px;
        letter-spacing: 0.04em;
    }

    .caption
    {
        fill: var(--text-muted);
        font-size: 9px;
    }
</style>
