<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import { decimalsFor } from "../tools/labels";
    import { drillCycle, FRAME_HEIGHT, FRAME_WIDTH, pointsAttribute, round } from "./geometry";

    // Drilling cycle (specification 6.12): the hole in the board edge on the left, the height of the drill tip over
    // time on the right; a dot runs along it, still when the system asks to reduce motion.
    let { cycle, depth, peckDepth, thickness = 1.6 }: { cycle: "simple" | "peck"; depth: number; peckDepth: number; thickness?: number } = $props();

    const t = i18n.t;
    const n = (value: number): string => i18n.number(value, decimalsFor(value));
    let shape = $derived(drillCycle(cycle, depth, peckDepth, thickness));
    let path = $derived(`M${shape.profile.map((point) => `${point.x} ${point.y}`).join(" L")}`);
    const animated = typeof window !== "undefined" && typeof window.matchMedia === "function"
        && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const LEFT = 16;
    const RIGHT = 112;
    const HOLE = 64;
</script>

<svg class="illustration" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}" role="img"
    aria-label={t(cycle === "peck" ? "illus.drillPeck" : "illus.drillSimple", { count: shape.plungeCount, depth: n(depth), peck: n(peckDepth) })}>
    <!-- Board edge, spoil board below, and the hole -->
    <rect class="spoil" x={LEFT} y={round(shape.bottomY)} width={RIGHT - LEFT} height={round(Math.max(4, FRAME_HEIGHT - 26 - shape.bottomY))} />
    <rect class="board" x={LEFT} y={shape.surfaceY} width={RIGHT - LEFT} height={round(shape.bottomY - shape.surfaceY)} />
    <rect class="hole" x={HOLE - 5} y={shape.surfaceY} width="10" height={round(shape.depthY - shape.surfaceY)} />
    <line class="travel" x1={LEFT} y1={shape.travelY} x2={FRAME_WIDTH - 8} y2={shape.travelY} />
    <line class="surface" x1={RIGHT} y1={shape.surfaceY} x2={FRAME_WIDTH - 8} y2={shape.surfaceY} />
    <polyline class="profile" points={pointsAttribute(shape.profile)} />
    {#if animated}
        <circle class="tip" r="3.5">
            <animateMotion dur={`${1.2 + shape.plungeCount * 0.8}s`} repeatCount="indefinite" {path} />
        </circle>
    {/if}
    <text class="label" x={LEFT} y={shape.travelY - 4}>{t("illus.travelHeight")}</text>
    <text class="label" x={LEFT} y={FRAME_HEIGHT - 12}>
        <tspan class="strong">{t(cycle === "peck" ? "illus.peckCount" : "illus.singlePlunge", { count: shape.plungeCount })}</tspan>
    </text>
    <text class="caption" x={LEFT} y={FRAME_HEIGHT - 2}>{t("illus.drillDepth", { depth: n(depth), thickness: n(thickness) })}</text>
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

    .spoil
    {
        fill: var(--surface-sunken);
    }

    .hole
    {
        fill: var(--surface);
        stroke: var(--brand-prune);
        stroke-width: 1;
    }

    .travel,
    .surface
    {
        stroke: var(--border);
        stroke-width: 1;
        stroke-dasharray: 4 3;
    }

    .profile
    {
        fill: none;
        stroke: var(--accent-cowork);
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    .tip
    {
        fill: var(--brand-rouge);
    }

    .label
    {
        fill: var(--text);
        font-size: 10px;
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
