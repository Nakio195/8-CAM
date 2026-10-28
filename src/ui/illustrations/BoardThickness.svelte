<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import { FRAME_HEIGHT, FRAME_WIDTH, round } from "./geometry";

    // Board cross-section with its thickness (specification 6.10): copper on both faces around the FR4 core.
    // Drawn to scale against a 1.6 mm reference; copper is thickened to stay visible.
    let { thickness }: { thickness: number } = $props();

    const t = i18n.t;
    const TOP = 40;
    let height = $derived(Math.max(8, Math.min(90, (Math.max(0, thickness) / 1.6) * 60)));
</script>

<svg class="illustration" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}" role="img"
    aria-label={t("illus.boardThickness", { value: i18n.number(thickness, 2) })}>
    <rect class="core" x="20" y={TOP} width="150" height={round(height)} />
    <rect class="copper" x="20" y={TOP - 4} width="150" height="4" />
    <rect class="copper" x="20" y={round(TOP + height)} width="150" height="4" />
    <line class="dimension" x1="190" y1={TOP - 4} x2="190" y2={round(TOP + height + 4)} />
    <line class="tick" x1="172" y1={TOP - 4} x2="196" y2={TOP - 4} />
    <line class="tick" x1="172" y1={round(TOP + height + 4)} x2="196" y2={round(TOP + height + 4)} />
    <text class="label strong" x="200" y={round(TOP + height / 2 + 4)}>{i18n.number(thickness, 2)} mm</text>
    <text class="label" x="24" y={round(TOP + height / 2 + 4)}>FR4</text>
    <text class="caption" x="20" y={FRAME_HEIGHT - 10}>{t("illus.copperThickened")}</text>
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
    }

    .core
    {
        fill: var(--illus-board);
        stroke: var(--accent-formation);
    }

    .copper
    {
        fill: var(--brand-rouge);
        stroke: none;
    }

    .dimension,
    .tick
    {
        stroke: var(--brand-rouge);
    }

    .tick
    {
        stroke-width: 1;
    }

    .label
    {
        fill: var(--text);
        font-family: var(--font-mono);
        font-size: 11px;
    }

    .strong
    {
        font-weight: 700;
    }

    .caption
    {
        fill: var(--text-muted);
        font-size: 9px;
    }
</style>
