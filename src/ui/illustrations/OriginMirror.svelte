<script lang="ts">
    import { forEachPackedRing, simplifyPacked } from "@core/geometry/index";
    import { INTERNAL_UNITS_PER_MM } from "@core/units/index";
    import { layersBBox } from "@project/index";
    import { i18n } from "../state/i18n.svelte";
    import { project } from "../state/project.svelte";
    import { FRAME_HEIGHT, FRAME_WIDTH, originMirror, round } from "./geometry";

    // Origin and mirror on a thumbnail of the real board (specification 6.12): the copper of the project as it will lie
    // on the machine, mirrored for the bottom side, with the machine zero. A plain board stands in before any import.
    let { origin, mirror }: { origin: number; mirror: boolean } = $props();

    const t = i18n.t;
    const ORIGINS = ["illus.originLowerLeft", "illus.originCenter", "illus.originGerber"] as const;

    let box = $derived(layersBBox(project.layers, false));
    let hasBoard = $derived(Number.isFinite(box.minX) && box.maxX > box.minX);
    let width = $derived(hasBoard ? (box.maxX - box.minX) / INTERNAL_UNITS_PER_MM : 50);
    let height = $derived(hasBoard ? (box.maxY - box.minY) / INTERNAL_UNITS_PER_MM : 30);
    let shape = $derived(originMirror(width, height, origin, mirror,
        hasBoard ? { x: -box.minX / INTERNAL_UNITS_PER_MM, y: -box.minY / INTERNAL_UNITS_PER_MM } : { x: 0, y: 0 }));

    /** Copper of the first copper layer (or the first layer), simplified to a few hundred points, as one SVG path. */
    let thumbnail = $derived.by(() =>
    {
        const layer = project.layers.find((entry) => entry.file.layerType.kind === "copper") ?? project.layers[0];
        if (!layer || !hasBoard)
        {
            return "";
        }
        const data = simplifyPacked(layer.file.geometry, Math.max(width, height) * INTERNAL_UNITS_PER_MM / 300);
        const parts: string[] = [];
        forEachPackedRing(data, (start, count) =>
        {
            for (let i = 0; i < count; i++)
            {
                const x = ((data[start + 2 * i] ?? 0) - box.minX) / INTERNAL_UNITS_PER_MM;
                const y = ((data[start + 2 * i + 1] ?? 0) - box.minY) / INTERNAL_UNITS_PER_MM;
                const frameX = shape.board.x + (mirror ? width - x : x) * shape.scale;
                const frameY = shape.board.y + shape.board.height - y * shape.scale;
                parts.push(`${i === 0 ? "M" : "L"}${round(frameX)} ${round(frameY)}`);
            }
            parts.push("Z");
        });
        return parts.join("");
    });
</script>

<svg class="illustration" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}" role="img"
    aria-label={t(mirror ? "illus.originMirrored" : "illus.originPlain", { origin: t(ORIGINS[origin] ?? ORIGINS[0]) })}>
    <rect class="board" x={shape.board.x} y={shape.board.y} width={shape.board.width} height={shape.board.height} />
    {#if thumbnail}
        <path class="copper" d={thumbnail} fill-rule="evenodd" />
    {/if}
    <!-- Machine axes from the zero -->
    <line class="axis" x1={shape.origin.x} y1={shape.origin.y} x2={shape.origin.x + 26} y2={shape.origin.y} />
    <line class="axis" x1={shape.origin.x} y1={shape.origin.y} x2={shape.origin.x} y2={shape.origin.y - 26} />
    <text class="label" x={shape.origin.x + 28} y={shape.origin.y + 4}>X</text>
    <text class="label" x={shape.origin.x - 3} y={shape.origin.y - 29}>Y</text>
    <circle class="origin" cx={shape.origin.x} cy={shape.origin.y} r="4" />
    {#if mirror}
        <line class="mirror" x1={shape.board.x + shape.board.width / 2} y1={shape.board.y - 6} x2={shape.board.x + shape.board.width / 2}
            y2={shape.board.y + shape.board.height + 6} />
    {/if}
    <text class="caption" x="8" y={FRAME_HEIGHT - 6}>
        {t(mirror ? "illus.mirrorCaption" : "illus.originCaption", { origin: t(ORIGINS[origin] ?? ORIGINS[0]) })}
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
        fill: var(--accent-formation-light);
        stroke: var(--accent-formation);
        stroke-width: 2;
    }

    .copper
    {
        fill: var(--brand-rouge);
        fill-opacity: 0.8;
    }

    .axis
    {
        stroke: var(--brand-prune);
        stroke-width: 2;
        stroke-linecap: round;
    }

    .origin
    {
        fill: var(--brand-rouge-strong);
        stroke: var(--surface);
        stroke-width: 1.5;
    }

    .mirror
    {
        stroke: var(--accent-cowork);
        stroke-width: 1.5;
        stroke-dasharray: 5 4;
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
