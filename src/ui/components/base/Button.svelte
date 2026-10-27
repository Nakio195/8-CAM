<script lang="ts">
    import type { Snippet } from "svelte";
    import type { HTMLButtonAttributes } from "svelte/elements";
    import { help as helpAction } from "../../help";
    import Icon, { type IconName } from "../Icon.svelte";

    type Variant = "primary" | "secondary" | "ghost" | "onDark";

    let {
        variant = "primary",
        icon,
        help = "",
        children,
        type = "button",
        ...rest
    }: { variant?: Variant; icon?: IconName; help?: string; children: Snippet } & HTMLButtonAttributes = $props();
</script>

<button class="button {variant}" {type} use:helpAction={help} {...rest}>
    {#if icon}
        <Icon name={icon} />
    {/if}
    <span>{@render children()}</span>
</button>

<style>
    .button
    {
        display: inline-flex;
        white-space: nowrap;
        align-items: center;
        gap: 6px;
        min-height: 34px;
        padding: 6px 14px;
        border: 2px solid transparent;
        border-radius: var(--radius);
        font-weight: 700;
        cursor: pointer;
        transition: background-color 120ms ease, border-color 120ms ease;
    }

    .button:disabled
    {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .primary
    {
        background: var(--action-background);
        color: var(--action-text);
    }

    .primary:hover:not(:disabled)
    {
        background: var(--brand-prune);
    }

    .secondary
    {
        background: var(--secondary-background);
        color: var(--secondary-text);
    }

    .secondary:hover:not(:disabled)
    {
        border-color: var(--brand-prune);
    }

    .ghost
    {
        background: transparent;
        border-color: var(--border);
        color: var(--text);
    }

    .ghost:hover:not(:disabled)
    {
        background: var(--surface-sunken);
    }

    .onDark
    {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.35);
        color: #ffffff;
        font-weight: 600;
    }

    .onDark:hover:not(:disabled)
    {
        background: rgba(255, 255, 255, 0.12);
    }
</style>
