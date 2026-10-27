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
        chevron: "M9 6l6 6-6 6",
        check: "M4 12l5 5L20 6",
        info: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18 M12 11v6 M12 7.5v.5",
        error: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18 M9 9l6 6 M15 9l-6 6",
        help: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18 M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6 M12 17v.5",
        pin: "M9 4h6 M10 4v6l-3 4h10l-3-4V4 M12 14v6",
        book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 21V5 M8 7h7",
        sun: "M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8 M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
        moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
        contrast: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18 M12 3v18",
        clock: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18 M12 7v5l3 2",
        tool: "M14 4l6 6 M17 7l-9 9 M8 16l-4 4 M11 13l-3 3",
        drill: "M10 3h4v8l-2 4-2-4z M10 7h4 M12 15v6",
        about: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18 M12 11v6 M12 7.5v.5",
        copy: "M9 9h11v11H9z M5 15V4h11",
        edit: "M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4",
        plus: "M12 5v14 M5 12h14",
        download: "M12 4v11 M7 10l5 5 5-5 M5 20h14",
        upload: "M12 20V9 M7 14l5-5 5 5 M5 4h14",
        reset: "M4 12a8 8 0 1 0 2.3-5.7 M4 4v4h4",
        target: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18 M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8 M12 1v4 M12 19v4 M1 12h4 M19 12h4"
    } as const;

    export type IconName = keyof typeof ICONS;

    export const ICON_NAMES = Object.keys(ICONS) as IconName[];
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
