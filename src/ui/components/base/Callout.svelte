<script lang="ts">
    import type { Snippet } from "svelte";
    import Icon, { type IconName } from "../Icon.svelte";

    type Tone = "success" | "warning" | "error" | "info" | "help";

    const ICONS: Record<Tone, IconName> = {
        success: "check",
        warning: "warning",
        error: "error",
        info: "info",
        help: "help"
    };

    let { tone = "info", title, children }: { tone?: Tone; title?: string; children: Snippet } = $props();
</script>

<!-- Errors are announced immediately, other messages politely -->
<div class="callout {tone}" role={tone === "error" ? "alert" : "status"}>
    <span class="icon"><Icon name={ICONS[tone]} /></span>
    <div class="content">
        {#if title}
            <strong>{title}</strong>
        {/if}
        <div>{@render children()}</div>
    </div>
</div>

<style>
    .callout
    {
        display: flex;
        gap: 10px;
        padding: 10px 12px;
        border-left: 4px solid;
        border-radius: var(--radius);
        line-height: 1.45;
    }

    .icon
    {
        display: inline-flex;
        padding-top: 1px;
    }

    .content
    {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .success
    {
        background: var(--success-background);
        color: var(--success-text);
        border-color: var(--success-accent);
    }

    .warning
    {
        background: var(--warning-background);
        color: var(--warning-text);
        border-color: var(--warning-accent);
    }

    .error
    {
        background: var(--error-background);
        color: var(--error-text);
        border-color: var(--error-accent);
    }

    .info
    {
        background: var(--info-background);
        color: var(--info-text);
        border-color: var(--info-accent);
    }

    .help
    {
        background: var(--help-background);
        color: var(--help-text);
        border-color: var(--success-accent);
    }
</style>
