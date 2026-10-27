<script lang="ts" module>
    // Line icons drawn for the project: 24 x 24, 2 px stroke, round caps and joins (specification 6.12)
    const ICONS = {
        open: "M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-3H5a2 2 0 0 0-2 2z M12 17v-6 M9 13l3-3 3 3",
        board: "M4 4h16v16H4z M8 8h3v3H8z M14 13h2 M8 16h8 M13 8h3",
        eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6",
        eyeOff: "M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9 M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2",
        up: "M12 19V5 M6 11l6-6 6 6",
        down: "M12 5v14 M6 13l6 6 6-6",
        remove: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6",
        fit: "M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5 M9 9h6v6H9z",
        zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14 M20 20l-4-4 M11 8v6 M8 11h6",
        zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14 M20 20l-4-4 M8 11h6",
        grid: "M4 4h16v16H4z M4 9.3h16 M4 14.6h16 M9.3 4v16 M14.6 4v16",
        origin: "M5 19V5 M5 19h14 M5 5l-2 3 M5 5l2 3 M19 19l-3-2 M19 19l-3 2",
        measure: "M3 17L17 3l4 4L7 21z M7 13l2 2 M10 10l2 2 M13 7l2 2",
        close: "M6 6l12 12 M18 6L6 18",
        warning: "M12 3l10 18H2z M12 10v5 M12 18v.5",
        chevron: "M9 6l6 6-6 6"
    } as const;

    export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
    let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={ICONS[name]} />
</svg>

<style>
    .icon
    {
        flex: none;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
    }
</style>
