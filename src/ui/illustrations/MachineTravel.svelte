<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import { decimalsFor } from "../tools/labels";
    import { FRAME_HEIGHT, FRAME_WIDTH, machineTravel } from "./geometry";

    // Travel of the machine (docs/architecture.md section 5.1): the bed seen from above with a 10 x 10 cm board at the
    // origin, to scale, and the Z travel beside it.
    let { travelX, travelY, travelZ }: { travelX: number; travelY: number; travelZ: number } = $props();

    const t = i18n.t;
    const n = (value: number): string => i18n.number(value, decimalsFor(value));
    let shape = $derived(machineTravel(travelX, travelY, travelZ));
</script>

<svg class="illustration" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}" role="img"
    aria-label={t("illus.machineTravel", { x: n(travelX), y: n(travelY), z: n(travelZ) })}>
    <rect class="bed" x={shape.bed.x} y={shape.bed.y} width={shape.bed.width} height={shape.bed.height} />
    <rect class="board" class:too-small={shape.tooSmall} x={shape.board.x} y={shape.board.y} width={shape.board.width} height={shape.board.height} />
    <circle class="origin" cx={shape.bed.x} cy={shape.bed.y + shape.bed.height} r="3" />
    <text class="label" x={shape.bed.x + shape.bed.width / 2} y={shape.bed.y - 4} text-anchor="middle">X {n(travelX)} mm</text>
    <text class="label" x={shape.bed.x + shape.bed.width + 4} y={shape.bed.y + 10}>Y {n(travelY)}</text>
    <rect class="z" x={shape.zBar.x} y={shape.zBar.top} width="10" height={shape.zBar.height} />
    <text class="label" x={shape.zBar.x - 4} y={shape.zBar.top - 4}>Z {n(travelZ)}</text>
    <text class="caption" x="16" y={FRAME_HEIGHT - 6}>{t(shape.tooSmall ? "illus.boardTooLarge" : "illus.boardInBed")}</text>
</svg>

<style>
    .illustration
    {
        width: 100%;
        max-width: 280px;
        height: auto;
        display: block;
    }

    .bed
    {
        fill: var(--surface-sunken);
        stroke: var(--brand-prune);
        stroke-width: 2;
    }

    .board
    {
        fill: var(--accent-formation-light);
        stroke: var(--accent-formation);
        stroke-width: 2;
    }

    .board.too-small
    {
        fill: var(--brand-rouge-light);
        stroke: var(--brand-rouge);
    }

    .origin
    {
        fill: var(--brand-rouge);
    }

    .z
    {
        fill: var(--accent-cowork);
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
