<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import { FRAME_HEIGHT, FRAME_WIDTH } from "./geometry";

    // Climb and conventional milling side by side (specification 6.12): the tool turns clockwise seen from above and
    // moves to the right; the copper kept is on its left (climb) or right (conventional). The rotation is animated,
    // and still when the system asks to reduce motion.
    let { direction }: { direction: "climb" | "conventional" } = $props();

    const t = i18n.t;
    const RADIUS = 20;
    const scenes = [
        { kind: "climb", x: 60 },
        { kind: "conventional", x: 180 }
    ] as const;
</script>

<svg class="illustration" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}" role="img"
    aria-label={t(direction === "climb" ? "illus.climb" : "illus.conventional")}>
    {#each scenes as scene (scene.kind)}
        <g class="scene" class:chosen={scene.kind === direction}>
            <!-- Copper kept: above the path for climb (left of the feed), below for conventional (right of the feed) -->
            <rect class="copper" x={scene.x - 52} y={scene.kind === "climb" ? 28 : 98} width="104" height="22" />
            <line class="path" x1={scene.x - 52} y1="74" x2={scene.x + 52} y2="74" />
            <polygon class="arrow" points={`${scene.x + 52},74 ${scene.x + 44},69 ${scene.x + 44},79`} />
            <g transform={`translate(${scene.x} 74)`}>
                <g class="tool">
                    <circle r={RADIUS} />
                    <path d={`M0 ${-RADIUS} l6 -4 M0 ${-RADIUS} l6 4`} />
                    <path d={`M0 ${RADIUS} l-6 -4 M0 ${RADIUS} l-6 4`} />
                </g>
            </g>
            <text class="label" x={scene.x} y={FRAME_HEIGHT - 10} text-anchor="middle">
                {t(scene.kind === "climb" ? "illus.climbShort" : "illus.conventionalShort")}
            </text>
        </g>
    {/each}
    <line class="separator" x1={FRAME_WIDTH / 2} y1="10" x2={FRAME_WIDTH / 2} y2={FRAME_HEIGHT - 24} />
</svg>

<style>
    .illustration
    {
        width: 100%;
        max-width: 280px;
        height: auto;
        display: block;
    }

    .scene
    {
        opacity: 0.45;
    }

    .scene.chosen
    {
        opacity: 1;
    }

    .copper
    {
        fill: var(--brand-rouge);
    }

    .path
    {
        stroke: var(--accent-formation);
        stroke-width: 2;
        stroke-dasharray: 5 4;
    }

    .arrow
    {
        fill: var(--accent-formation);
    }

    .tool circle
    {
        fill: var(--brand-rose);
        fill-opacity: 0.8;
        stroke: var(--brand-prune);
        stroke-width: 2;
    }

    .tool path
    {
        fill: none;
        stroke: var(--brand-prune);
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    /* Clockwise seen from above */
    .tool
    {
        animation: spin 2.4s linear infinite;
    }

    @keyframes spin
    {
        to
        {
            transform: rotate(360deg);
        }
    }

    @media (prefers-reduced-motion: reduce)
    {
        .tool
        {
            animation: none;
        }
    }

    .separator
    {
        stroke: var(--border);
        stroke-width: 1;
    }

    .label
    {
        fill: var(--text);
        font-family: var(--font-title);
        font-size: 14px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
</style>
