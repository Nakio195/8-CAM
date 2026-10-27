<script module lang="ts">
    import { unpackPolygons, type PackedPolygons, type Polygon } from "@core/geometry/index";

    // Unpacking a dense layer takes a few tens of milliseconds: done once per layer geometry
    const unpacked = new WeakMap<PackedPolygons, Polygon[]>();

    function polygonsOf(geometry: PackedPolygons): Polygon[]
    {
        let polygons = unpacked.get(geometry);
        if (!polygons)
        {
            polygons = unpackPolygons(geometry);
            unpacked.set(geometry, polygons);
        }
        return polygons;
    }
</script>

<script lang="ts">
    import { intersectPolygons, polygonsToPathData, rectanglePath, type Point } from "@core/geometry/index";
    import { INTERNAL_UNITS_PER_MM } from "@core/units/index";
    import { i18n } from "../state/i18n.svelte";

    // Illustrated card of the tightest spot (specification 6.10): the real copper around it, dimensioned
    let { geometry, a, b, distance }: { geometry: PackedPolygons; a: Point; b: Point; distance: number } = $props();

    const t = i18n.t;
    const toMm = (value: number): number => value / INTERNAL_UNITS_PER_MM;

    let scene = $derived.by(() =>
    {
        const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        // Window around the spot: a few times the gap, at least 1 mm wide
        const half = Math.max(distance * 3, 0.5 * INTERNAL_UNITS_PER_MM);
        const frame = { outer: rectanglePath(Math.round(centre.x - half), Math.round(centre.y - half),
            Math.round(centre.x + half), Math.round(centre.y + half)), holes: [] };
        const local = intersectPolygons(polygonsOf(geometry), [frame]);
        return {
            path: polygonsToPathData(local),
            viewBox: `${toMm(centre.x - half)} ${-toMm(centre.y + half)} ${toMm(2 * half)} ${toMm(2 * half)}`,
            size: toMm(2 * half)
        };
    });
    let label = $derived(t("analysis.spotCaption", { distance: i18n.number(toMm(distance), 3) }));
</script>

<figure class="spot">
    <svg viewBox={scene.viewBox} role="img" aria-label={label}>
        <rect class="background" x="-1e4" y="-1e4" width="2e4" height="2e4" />
        <g transform="scale(1,-1)">
            <path class="copper" d={scene.path} fill-rule="evenodd" />
            <line class="dimension" x1={toMm(a.x)} y1={toMm(a.y)} x2={toMm(b.x)} y2={toMm(b.y)}
                stroke-width={scene.size / 90} />
            <circle class="end" cx={toMm(a.x)} cy={toMm(a.y)} r={scene.size / 60} />
            <circle class="end" cx={toMm(b.x)} cy={toMm(b.y)} r={scene.size / 60} />
        </g>
    </svg>
    <figcaption>{label}</figcaption>
</figure>

<style>
    .spot
    {
        margin: 0;
    }

    svg
    {
        display: block;
        width: 100%;
        max-width: 280px;
        aspect-ratio: 1;
        border-radius: var(--radius);
    }

    .background
    {
        fill: var(--canvas-background);
    }

    .copper
    {
        fill: var(--brand-rouge);
    }

    .dimension
    {
        stroke: var(--accent-pro);
        stroke-linecap: round;
    }

    .end
    {
        fill: var(--accent-pro);
    }

    figcaption
    {
        margin-top: 4px;
        font-size: 12px;
        color: var(--text-muted);
    }
</style>
