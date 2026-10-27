<script lang="ts">
    import type { ToolType } from "@cam/tools/index";
    import { i18n } from "../state/i18n.svelte";
    import { FRAME_HEIGHT, FRAME_WIDTH, pointsAttribute, round, toolProfile } from "./geometry";

    // Side view of a tool drawn from its parameters (specification 6.10 and 6.12)
    let { type, diameter, tipDiameter = 0, tipAngle = 0 }: {
        type: ToolType;
        diameter: number;
        tipDiameter?: number;
        tipAngle?: number;
    } = $props();

    const t = i18n.t;
    let shape = $derived(toolProfile({ type, diameter, tipDiameter, tipAngle }));
    // A V-bit is identified by its tip width; other tools by their diameter
    let widthLabel = $derived(`Ø ${i18n.number(type === "vbit" ? tipDiameter : diameter, 2)}`);
    let description = $derived(t("illus.toolProfile", {
        type: t(`toolType.${type}`),
        diameter: i18n.number(diameter, 2),
        tip: i18n.number(tipDiameter, 2),
        angle: i18n.number(tipAngle, 0)
    }));
</script>

<svg class="illustration" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}" role="img" aria-label={description}>
    <polygon class="shank" points={pointsAttribute(shape.shank)} />
    <polygon class="body" points={pointsAttribute(shape.body)} />
    {#each shape.flutes as [from, to], index (index)}
        <line class="flute" x1={round(from.x)} y1={round(from.y)} x2={round(to.x)} y2={round(to.y)} />
    {/each}
    {#if shape.angle}
        <line class="guide" x1={round(shape.angle.apex.x)} y1={round(shape.angle.apex.y)}
            x2={round(shape.angle.left.x)} y2={round(shape.angle.left.y)} />
        <line class="guide" x1={round(shape.angle.apex.x)} y1={round(shape.angle.apex.y)}
            x2={round(shape.angle.right.x)} y2={round(shape.angle.right.y)} />
        <text class="label angle" x={round(shape.angle.right.x + 8)} y={round(shape.angle.right.y + 4)}>
            {i18n.number(type === "drill" ? tipAngle || 118 : tipAngle, 0)}°
        </text>
    {/if}
    <line class="dimension" x1={round(shape.widthDimension.left)} y1={round(shape.widthDimension.y)}
        x2={round(shape.widthDimension.right)} y2={round(shape.widthDimension.y)} />
    <text class="label" x={round(shape.widthDimension.right + 6)} y={round(shape.widthDimension.y + 4)}>{widthLabel}</text>
</svg>

<style>
    .illustration
    {
        width: 100%;
        max-width: 280px;
        height: auto;
        display: block;
    }

    polygon,
    line
    {
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    .shank
    {
        fill: var(--brand-prune-light);
        stroke: var(--brand-prune);
    }

    .body
    {
        fill: var(--brand-rose);
        stroke: var(--brand-prune);
    }

    .flute
    {
        stroke: var(--brand-prune);
        opacity: 0.6;
    }

    .guide
    {
        stroke: var(--accent-cowork);
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

    .angle
    {
        fill: var(--accent-cowork);
    }
</style>
