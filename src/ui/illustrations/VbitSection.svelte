<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import { FRAME_HEIGHT, FRAME_WIDTH, pointsAttribute, round, vbitSection } from "./geometry";

    // V-bit cutting into the copper (specification 6.12): the effective width follows the angle, tip and depth typed
    let { tipDiameter, tipAngle, depth }: { tipDiameter: number; tipAngle: number; depth: number } = $props();

    const t = i18n.t;
    let shape = $derived(vbitSection({ tipDiameter, tipAngle, depth }));
    let widthText = $derived(`${i18n.number(shape.width, 3)} mm`);
    let depthText = $derived(`${i18n.number(depth, 3)} mm`);
</script>

<svg class="illustration" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}" role="img"
    aria-label={t("illus.vbitSection", { width: widthText, depth: depthText, angle: i18n.number(tipAngle, 0) })}>
    <!-- Board: FR4 below, copper on top (thickened to stay visible) -->
    <rect class="board" x="8" y={round(shape.surfaceY)} width={FRAME_WIDTH - 16} height={round(FRAME_HEIGHT - shape.surfaceY - 8)} />
    <rect class="copper" x="8" y={round(shape.surfaceY)} width={FRAME_WIDTH - 16} height={round(shape.copperBottomY - shape.surfaceY)} />
    <polygon class="groove" points={pointsAttribute(shape.groove)} />
    <polygon class="tool" points={pointsAttribute(shape.cone)} />
    <line class="dimension" x1={round(shape.widthDimension.left)} y1={round(shape.widthDimension.y)}
        x2={round(shape.widthDimension.right)} y2={round(shape.widthDimension.y)} />
    <line class="tick" x1={round(shape.widthDimension.left)} y1={round(shape.widthDimension.y)}
        x2={round(shape.widthDimension.left)} y2={round(shape.surfaceY)} />
    <line class="tick" x1={round(shape.widthDimension.right)} y1={round(shape.widthDimension.y)}
        x2={round(shape.widthDimension.right)} y2={round(shape.surfaceY)} />
    <text class="label strong" x={FRAME_WIDTH / 2} y={round(shape.widthDimension.y - 5)} text-anchor="middle">{widthText}</text>
    <line class="dimension" x1={round(shape.depthDimension.x)} y1={round(shape.depthDimension.top)}
        x2={round(shape.depthDimension.x)} y2={round(Math.max(shape.depthDimension.bottom, shape.depthDimension.top + 1))} />
    <text class="label" x={round(shape.depthDimension.x + 5)} y={round((shape.depthDimension.top + shape.depthDimension.bottom) / 2 + 4)}>{depthText}</text>
    <text class="caption" x="12" y={FRAME_HEIGHT - 12}>{t("illus.copperThickened")}</text>
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
    polygon,
    line
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

    /* Brand red is the copper colour (specification 6.13) */
    .copper
    {
        fill: var(--brand-rouge);
        stroke: none;
    }

    .groove
    {
        fill: var(--surface);
        stroke: none;
    }

    .tool
    {
        fill: var(--brand-rose);
        fill-opacity: 0.85;
        stroke: var(--brand-prune);
    }

    .dimension
    {
        stroke: var(--brand-rouge);
    }

    .tick
    {
        stroke: var(--brand-rouge);
        stroke-dasharray: 2 3;
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
        fill: var(--brand-rouge-strong);
    }

    .caption
    {
        fill: var(--text-muted);
        font-size: 9px;
    }
</style>
