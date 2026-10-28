<script lang="ts">
    import type { Snippet } from "svelte";
    import { help as helpAction } from "../../help";
    import Icon from "../Icon.svelte";
    import Button from "./Button.svelte";

    // One step of a tab, folded to its header: number (a check once done), title and a short summary. The tab keeps one
    // step open at a time; the "next" button folds this one and opens the following step.
    let { id, index, title, summary = "", done = false, open, ontoggle, next, children }: {
        id: string;
        index: number;
        title: string;
        summary?: string;
        done?: boolean;
        open: boolean;
        ontoggle: () => void;
        next?: { label: string; onclick: () => void };
        children: Snippet;
    } = $props();
</script>

<section class="step" class:open aria-labelledby={`step-${id}-title`}>
    <h2 id={`step-${id}-title`}>
        <button class="header" type="button" aria-expanded={open} aria-controls={`step-${id}`} use:helpAction={""} onclick={ontoggle}>
            <span class="badge" class:done>
                {#if done}<Icon name="check" size={14} />{:else}{index}{/if}
            </span>
            <span class="title">{title}</span>
            {#if summary}<span class="summary">{summary}</span>{/if}
            <span class="chevron"><Icon name="chevron" size={16} /></span>
        </button>
    </h2>
    <!-- Folded steps stay mounted: a card being edited or a simulation keeps its state -->
    <div class="content" id={`step-${id}`} hidden={!open}>
        {@render children()}
        {#if next}
            <div class="next">
                <Button variant="secondary" icon="chevron" help="" onclick={next.onclick}>{next.label}</Button>
            </div>
        {/if}
    </div>
</section>

<style>
    .step
    {
        border-bottom: 1px solid var(--border);
    }

    h2
    {
        margin: 0;
        font-size: inherit;
        font-weight: inherit;
    }

    .header
    {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 10px 12px;
        border: none;
        background: none;
        color: var(--text);
        text-align: left;
        cursor: pointer;
    }

    .header:hover
    {
        background: var(--surface-sunken);
    }

    .open .header
    {
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--surface-panel);
        box-shadow: inset 4px 0 0 var(--brand-rouge);
    }

    .badge
    {
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: 2px solid var(--border);
        border-radius: 50%;
        font-size: 12px;
        font-weight: 700;
        color: var(--text-muted);
    }

    .open .badge
    {
        border-color: var(--brand-rouge);
        color: var(--text);
    }

    .badge.done
    {
        border-color: var(--success-accent);
        background: var(--success-accent);
        color: #ffffff;
    }

    .title
    {
        font-family: var(--font-title);
        font-size: 19px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        white-space: nowrap;
    }

    .summary
    {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        font-size: 12px;
        color: var(--text-muted);
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .chevron
    {
        display: inline-flex;
        margin-left: auto;
        color: var(--text-muted);
        transition: transform 0.15s;
    }

    .open .chevron
    {
        transform: rotate(90deg);
    }

    .content
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 4px 12px 14px;
    }

    .content[hidden]
    {
        display: none;
    }

    .next
    {
        display: flex;
        justify-content: flex-end;
        margin-top: 4px;
    }

    @media (prefers-reduced-motion: reduce)
    {
        .chevron
        {
            transition: none;
        }
    }
</style>
