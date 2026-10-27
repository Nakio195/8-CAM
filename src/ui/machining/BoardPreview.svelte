<script lang="ts">
    import { bboxOfPolygons, inflateBBox, polygonsToPathData, simplifyPacked, unpackPolygons, type PackedPolygons } from "@core/geometry/index";
    import { INTERNAL_UNITS_PER_MM } from "@core/units/index";

    // Small preview of an isolation result on the whole board (tool comparator, specification 6.10):
    // copper, toolpaths and non isolated areas, simplified to the preview resolution
    let { copper, loops, zones, label }: { copper: PackedPolygons; loops: PackedPolygons; zones: PackedPolygons; label: string } = $props();

    const SIZE = 220;
    const toMm = (value: number): number => value / INTERNAL_UNITS_PER_MM;

    let scene = $derived.by(() =>
    {
        const board = unpackPolygons(copper);
        let box = bboxOfPolygons(board);
        const span = Math.max(box.maxX - box.minX, box.maxY - box.minY, 1);
        box = inflateBBox(box, span * 0.04);
        // About one point per preview pixel is plenty
        const tolerance = span / SIZE;
        const simplify = (data: PackedPolygons): string => polygonsToPathData(unpackPolygons(simplifyPacked(data, tolerance)));
        const width = box.maxX - box.minX;
        const height = box.maxY - box.minY;
        return {
            copper: simplify(copper),
            loops: simplify(loops),
            zones: polygonsToPathData(unpackPolygons(zones)),
            viewBox: `${toMm(box.minX)} ${-toMm(box.maxY)} ${toMm(width)} ${toMm(height)}`,
            stroke: toMm(span) / 300,
            zoneStroke: toMm(span) / 120
        };
    });
</script>

<svg class="preview" viewBox={scene.viewBox} role="img" aria-label={label}>
    <g transform="scale(1,-1)">
        <path class="copper" d={scene.copper} fill-rule="evenodd" />
        <path class="loops" d={scene.loops} stroke-width={scene.stroke} />
        <!-- Zones get a thick outline too, so a tiny area stays visible at preview size -->
        <path class="zones" d={scene.zones} stroke-width={scene.zoneStroke} />
    </g>
</svg>

<style>
    .preview
    {
        display: block;
        width: 100%;
        aspect-ratio: 1;
        border-radius: var(--radius);
        background: var(--canvas-background);
    }

    .copper
    {
        fill: var(--brand-rouge);
        opacity: 0.8;
    }

    .loops
    {
        fill: none;
        stroke: var(--accent-formation);
        stroke-linejoin: round;
    }

    .zones
    {
        fill: var(--accent-pro);
        stroke: var(--accent-pro);
        stroke-linejoin: round;
    }
</style>
