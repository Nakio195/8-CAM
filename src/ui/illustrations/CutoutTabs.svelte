<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import { decimalsFor } from "../tools/labels";
    import { cutoutTabs, FRAME_HEIGHT, FRAME_WIDTH, round } from "./geometry";

    // Cutout with its tabs (specification 6.12): the board seen from above with the cut around it at the margin and
    // the tabs spread along it, and one tab seen from the side with the board material it leaves.
    let { count, tabWidth, tabHeight, thickness = 1.6, margin = 0, toolDiameter = 1.5 }: {
        count: number;
        tabWidth: number;
        tabHeight: number;
        thickness?: number;
        margin?: number;
        toolDiameter?: number;
    } = $props();

    const t = i18n.t;
    const n = (value: number): string => i18n.number(value, decimalsFor(value));
    let shape = $derived(cutoutTabs(count, tabWidth, tabHeight, thickness, margin, toolDiameter));
    let side = $derived(shape.side);
</script>

<svg class="illustration" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}" role="img"
    aria-label={t("illus.cutoutTabs", { count: shape.tabs.length, width: n(tabWidth), height: n(tabHeight), margin: n(margin) })}>
    <rect class="board" x={shape.board.x} y={shape.board.y} width={shape.board.width} height={shape.board.height} />
    <rect class="cut" x={round(shape.path.x)} y={round(shape.path.y)} width={round(shape.path.width)} height={round(shape.path.height)}
        stroke-width={shape.cutWidth} />
    {#each shape.tabs as tab, index (index)}
        <rect class="tab" x={tab.x} y={tab.y} width={tab.width} height={tab.height} />
    {/each}
    {#if margin > 0}
        <text class="label" x={shape.board.x + 4} y={shape.board.y + 12}>{t("illus.margin", { value: n(margin) })}</text>
    {/if}

    <!-- Side view of one tab: the cut goes through, the tab keeps the bottom of the board -->
    <rect class="board" x={side.x} y={side.bottomY - side.boardHeight} width="34" height={side.boardHeight} />
    <rect class="gap" x={side.x + 10} y={side.bottomY - side.boardHeight} width="14" height={round(side.boardHeight - side.tabHeight)} />
    <rect class="tab" x={side.x + 10} y={side.bottomY - side.tabHeight} width="14" height={side.tabHeight} />
    <line class="dimension" x1={side.x + 40} y1={side.bottomY} x2={side.x + 40} y2={side.bottomY - side.tabHeight} />
    <text class="label" x={side.x - 6} y={side.bottomY - side.boardHeight - 6}>{t("illus.tabSide")}</text>

    <text class="label strong" x="8" y={FRAME_HEIGHT - 16}>{t("illus.tabCount", { count: shape.tabs.length })}</text>
    <text class="caption" x="8" y={FRAME_HEIGHT - 4}>
        {t("illus.tabsCaption", { width: n(tabWidth), height: n(tabHeight), thickness: n(thickness) })}
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

    .cut
    {
        fill: none;
        stroke: var(--accent-formation);
        stroke-opacity: 0.5;
    }

    .tab
    {
        fill: var(--brand-rouge);
    }

    .gap
    {
        fill: var(--surface);
    }

    .dimension
    {
        stroke: var(--brand-prune);
        stroke-width: 1.5;
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
