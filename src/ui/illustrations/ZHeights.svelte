<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import { decimalsFor } from "../tools/labels";
    import { FRAME_HEIGHT, FRAME_WIDTH, round, zHeights } from "./geometry";

    // Tool heights on one dimensioned drawing (specification 6.12): surface, travel Z, safe Z and cutting depth
    let { travelZ, safeZ, depth }: { travelZ: number; safeZ: number; depth: number } = $props();

    const t = i18n.t;
    let shape = $derived(zHeights(travelZ, safeZ, depth));
    const TOOL_X = 70;
    const n = (value: number): string => i18n.number(value, decimalsFor(value));

    function tool(y: number): string
    {
        // Small V-bit silhouette with its tip at y
        return `${TOOL_X - 6},${round(y - 18)} ${TOOL_X + 6},${round(y - 18)} ${TOOL_X + 6},${round(y - 8)} ${TOOL_X},${round(y)} ${TOOL_X - 6},${round(y - 8)}`;
    }
</script>

<svg class="illustration" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}" role="img"
    aria-label={t("illus.zHeights", { travel: n(travelZ), safe: n(safeZ), depth: n(depth) })}>
    <rect class="board" x="8" y={round(shape.surfaceY)} width={FRAME_WIDTH - 16} height={round(FRAME_HEIGHT - shape.surfaceY - 6)} />
    <line class="surface" x1="8" y1={round(shape.surfaceY)} x2={FRAME_WIDTH - 8} y2={round(shape.surfaceY)} />

    {#each [{ y: shape.safeY, key: "illus.safeZ", value: safeZ, kind: "safe" }, { y: shape.travelY, key: "illus.travelZ", value: travelZ, kind: "travel" }] as level (level.kind)}
        <line class="level {level.kind}" x1="30" y1={round(level.y)} x2={FRAME_WIDTH - 8} y2={round(level.y)} />
        <text class="label" x={TOOL_X + 18} y={round(level.y - 4)}>
            {t(level.key as "illus.safeZ" | "illus.travelZ", { value: n(level.value) })}
        </text>
    {/each}
    <polygon class="tool ghost" points={tool(shape.safeY)} />
    <polygon class="tool ghost" points={tool(shape.travelY)} />
    <polygon class="tool" points={tool(shape.depthY)} />
    <text class="label" x={TOOL_X + 18} y={round(shape.depthY + 4)}>{t("illus.depthBelow", { value: n(depth) })}</text>
    <text class="label surface-label" x={FRAME_WIDTH - 12} y={round(shape.surfaceY - 4)} text-anchor="end">{t("illus.surface")}</text>
    <text class="caption" x="12" y={FRAME_HEIGHT - 6}>{t("illus.notToScale")}</text>
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
    line,
    polygon
    {
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    .board
    {
        fill: var(--illus-board);
        stroke: none;
    }

    .surface
    {
        stroke: var(--brand-rouge);
    }

    .level
    {
        stroke-dasharray: 4 3;
    }

    .safe
    {
        stroke: var(--accent-cowork);
    }

    .travel
    {
        stroke: var(--brand-prune);
    }

    .tool
    {
        fill: var(--brand-rose);
        stroke: var(--brand-prune);
    }

    .ghost
    {
        fill-opacity: 0.35;
        stroke-opacity: 0.5;
    }

    .label
    {
        fill: var(--text);
        font-family: var(--font-mono);
        font-size: 10px;
    }

    .surface-label
    {
        fill: var(--brand-rouge-strong);
    }

    .caption
    {
        fill: var(--text-muted);
        font-size: 9px;
    }
</style>
