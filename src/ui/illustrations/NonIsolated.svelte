<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import { decimalsFor } from "../tools/labels";
    import { FRAME_HEIGHT, FRAME_WIDTH, nonIsolated, round } from "./geometry";

    // Non isolated area (specification 6.12): a tool wider than the gap between two pads cannot separate them
    let { gap, width }: { gap: number; width: number } = $props();

    const t = i18n.t;
    const n = (value: number): string => i18n.number(value, decimalsFor(value));
    let shape = $derived(nonIsolated(gap, width));
</script>

<svg class="illustration" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}" role="img"
    aria-label={t(shape.blocked ? "illus.nonIsolated" : "illus.isolated", { gap: n(gap), width: n(width) })}>
    <rect class="copper" x={round(shape.left.x1)} y={shape.padTop} width={round(shape.left.x2 - shape.left.x1)} height={shape.padBottom - shape.padTop} />
    <rect class="copper" x={round(shape.right.x1)} y={shape.padTop} width={round(shape.right.x2 - shape.right.x1)} height={shape.padBottom - shape.padTop} />
    {#if shape.blocked}
        <!-- Copper the tool cannot remove: the two pads stay joined -->
        <rect class="zone" x={round(shape.left.x2)} y={shape.padTop} width={round(shape.right.x1 - shape.left.x2)} height={shape.padBottom - shape.padTop} />
    {/if}
    <circle class="tool" class:blocked={shape.blocked} cx={shape.toolX} cy={shape.toolY} r={round(shape.toolRadius)} />
    <line class="dimension" x1={round(shape.left.x2)} y1={shape.padTop - 10} x2={round(shape.right.x1)} y2={shape.padTop - 10} />
    <text class="label" x={FRAME_WIDTH / 2} y={shape.padTop - 16} text-anchor="middle">{t("illus.gap", { value: n(gap) })}</text>
    <text class="label" x={FRAME_WIDTH / 2} y={FRAME_HEIGHT - 10} text-anchor="middle">{t("illus.toolWidth", { value: n(width) })}</text>
</svg>

<style>
    .illustration
    {
        width: 100%;
        max-width: 280px;
        height: auto;
        display: block;
    }

    .copper
    {
        fill: var(--brand-rouge);
    }

    .zone
    {
        fill: var(--accent-pro);
        stroke: var(--brand-prune);
        stroke-width: 2;
        stroke-dasharray: 4 3;
    }

    .tool
    {
        fill: var(--accent-formation);
        fill-opacity: 0.45;
        stroke: var(--brand-prune);
        stroke-width: 2;
    }

    .tool.blocked
    {
        fill: var(--brand-rose);
    }

    .dimension
    {
        stroke: var(--brand-prune);
        stroke-width: 2;
        stroke-linecap: round;
    }

    .label
    {
        fill: var(--text);
        font-family: var(--font-mono);
        font-size: 11px;
    }
</style>
