<script lang="ts">
    import type { HTMLButtonAttributes } from "svelte/elements";
    import { help as helpAction } from "../../help";
    import Icon, { type IconName } from "../Icon.svelte";

    // Square icon button with an accessible name and its help topic (shown by HelpTip on hover, focus or long press)
    let {
        icon,
        label,
        help,
        pressed,
        size = 18,
        tone = "default",
        ...rest
    }: {
        icon: IconName;
        label: string;
        help: string;
        pressed?: boolean;
        size?: number;
        tone?: "default" | "onDark";
    } & Omit<HTMLButtonAttributes, "aria-label" | "aria-pressed"> = $props();
</script>

<button class="icon-button {tone}" type="button" aria-label={label} aria-pressed={pressed} use:helpAction={help} {...rest}>
    <Icon name={icon} {size} />
</button>

<style>
    .icon-button
    {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        min-height: 28px;
        padding: 4px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: inherit;
        cursor: pointer;
    }

    .default:hover:not(:disabled)
    {
        background: var(--surface-sunken);
    }

    .onDark:hover:not(:disabled)
    {
        background: rgba(255, 255, 255, 0.12);
    }

    .icon-button[aria-pressed="true"]
    {
        background: var(--action-background);
        color: var(--action-text);
    }

    .icon-button:disabled
    {
        opacity: 0.3;
        cursor: default;
    }
</style>
