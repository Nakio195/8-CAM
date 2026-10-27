<script lang="ts" module>
    export type StickerTone = "success" | "warning" | "error" | "info" | "neutral" | "accent";
</script>

<script lang="ts">
    import type { Snippet } from "svelte";
    import Icon, { type IconName } from "../Icon.svelte";

    // Badge in the spirit of the brand stickers: fixed shapes, Bebas Neue capitals, always an icon or a word
    // besides the colour (specification 6.13: information is never carried by colour alone)
    let {
        tone = "neutral",
        icon,
        shape = "pill",
        children
    }: { tone?: StickerTone; icon?: IconName; shape?: "pill" | "tag"; children: Snippet } = $props();
</script>

<span class="sticker {tone} {shape}">
    {#if icon}
        <Icon name={icon} size={14} />
    {/if}
    <span class="label">{@render children()}</span>
</span>

<style>
    .sticker
    {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 10px 1px;
        font-family: var(--font-title);
        font-size: 16px;
        letter-spacing: 0.06em;
        line-height: 1.3;
        text-transform: uppercase;
        white-space: nowrap;
    }

    .pill
    {
        border-radius: 999px;
    }

    /* Luggage tag: a notched left side */
    .tag
    {
        padding-left: 16px;
        border-radius: 0 4px 4px 0;
        clip-path: polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%);
    }

    .label
    {
        transform: translateY(1px);
    }

    .success
    {
        background: var(--sticker-success);
        color: var(--sticker-success-text);
    }

    .warning
    {
        background: var(--sticker-warning);
        color: var(--sticker-warning-text);
    }

    .error
    {
        background: var(--sticker-error);
        color: var(--sticker-error-text);
    }

    .info
    {
        background: var(--sticker-info);
        color: var(--sticker-info-text);
    }

    .neutral
    {
        background: var(--sticker-neutral);
        color: var(--sticker-neutral-text);
    }

    .accent
    {
        background: var(--sticker-accent);
        color: var(--sticker-accent-text);
    }
</style>
