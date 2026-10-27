<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import { decimalsFor } from "../tools/labels";
    import { FRAME_HEIGHT, FRAME_WIDTH, isolationPasses, round } from "./geometry";

    // Isolation passes seen from above (specification 6.12): bands of the tool width next to the copper edge,
    // their overlap visible and following the values typed
    let { width, passes, overlap }: { width: number; passes: number; overlap: number } = $props();

    const t = i18n.t;
    const n = (value: number): string => i18n.number(value, decimalsFor(value));
    let shape = $derived(isolationPasses(width, passes, overlap));
    const LEFT = 16;
    const RIGHT = 170;
</script>

<svg class="illustration" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}" role="img"
    aria-label={t("illus.isolationPasses", { passes: shape.bands.length, width: n(width), overlap: i18n.number(overlap * 100, 0) })}>
    <rect class="copper" x={LEFT} y="4" width={RIGHT - LEFT} height={round(shape.edgeY - 4)} />
    <text class="label on-copper" x={LEFT + 6} y={round(shape.edgeY - 8)}>{t("illus.track")}</text>
    {#each shape.bands as band, index (index)}
        <rect class="band" x={LEFT} y={round(band.top)} width={RIGHT - LEFT} height={round(band.bottom - band.top)} />
        <line class="centre" x1={LEFT} y1={round(band.centre)} x2={RIGHT} y2={round(band.centre)} />
        <text class="label" x={RIGHT + 6} y={round(band.centre + 4)}>{t("illus.pass", { number: index + 1 })}</text>
    {/each}
    {#if shape.bands.length > 1 && shape.overlapPx > 0}
        {@const second = shape.bands[1]}
        {#if second}
            <rect class="overlap" x={LEFT} y={round(second.top)} width={RIGHT - LEFT} height={round(shape.overlapPx)} />
        {/if}
    {/if}
    <text class="caption" x={LEFT} y={FRAME_HEIGHT - 6}>
        {t("illus.passesCaption", { width: n(width), overlap: i18n.number(overlap * 100, 0) })}
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

    .copper
    {
        fill: var(--brand-rouge);
    }

    .band
    {
        fill: var(--accent-formation);
        fill-opacity: 0.35;
        stroke: var(--accent-formation);
        stroke-width: 1;
    }

    .overlap
    {
        fill: var(--accent-formation);
        fill-opacity: 0.55;
    }

    .centre
    {
        stroke: var(--brand-prune);
        stroke-width: 1.5;
        stroke-dasharray: 4 3;
    }

    .label
    {
        fill: var(--text);
        font-family: var(--font-mono);
        font-size: 10px;
    }

    .on-copper
    {
        fill: #ffffff;
    }

    .caption
    {
        fill: var(--text-muted);
        font-size: 9px;
    }
</style>
