<script lang="ts">
    import { help } from "../help";

    // Tabs of the side panel (WAI-ARIA tabs pattern: arrow keys move between tabs, Home / End to the ends)
    let { tabs, active = $bindable(), label }: {
        tabs: readonly { id: string; label: string; help: string }[];
        active: string;
        label: string;
    } = $props();

    let buttons: HTMLButtonElement[] = $state([]);

    function onKeyDown(event: KeyboardEvent, index: number): void
    {
        const last = tabs.length - 1;
        const target = event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
            : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
                : event.key === "Home" ? 0
                    : event.key === "End" ? last
                        : -1;
        if (target >= 0)
        {
            event.preventDefault();
            active = tabs[target]?.id ?? active;
            buttons[target]?.focus();
        }
    }
</script>

<div class="tabs" role="tablist" aria-label={label}>
    {#each tabs as tab, index (tab.id)}
        <button
            bind:this={buttons[index]}
            id={`tab-${tab.id}`}
            class="tab"
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabindex={active === tab.id ? 0 : -1}
            use:help={tab.help}
            onclick={() => (active = tab.id)}
            onkeydown={(event) => onKeyDown(event, index)}
        >{tab.label}</button>
    {/each}
</div>

<style>
    .tabs
    {
        display: flex;
        border-bottom: 1px solid var(--border);
    }

    .tab
    {
        flex: 1;
        padding: 8px 6px 6px;
        border: none;
        border-bottom: 3px solid transparent;
        background: none;
        color: var(--text-muted);
        font-family: var(--font-title);
        font-size: 17px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        cursor: pointer;
    }

    .tab[aria-selected="true"]
    {
        border-bottom-color: var(--brand-rouge);
        color: var(--text);
    }

    .tab:hover
    {
        color: var(--text);
    }
</style>
