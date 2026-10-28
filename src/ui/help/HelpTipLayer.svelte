<script lang="ts">
    import { untrack } from "svelte";
    import { isMessageKey } from "../i18n";
    import { i18n } from "../state/i18n.svelte";
    import { help } from "../state/help.svelte";
    import Icon from "../components/Icon.svelte";
    import { ILLUSTRATIONS } from "../illustrations/registry";
    import { TOOLTIP_ID } from "./helpAction";
    import { modalLayer } from "./modalLayer";

    // The single tooltip of the application (specification 6.11): title, explanation, advice, warning,
    // "learn more" link to the help panel, and a pin. Parametric illustrations join it with the parameters (J5+).

    const t = i18n.t;
    const GAP = 8;
    const MARGIN = 8;

    let tooltip: HTMLDivElement | undefined = $state();
    let position = $state({ left: 0, top: 0, above: false });

    function text(key: string): string | null
    {
        return isMessageKey(key) ? t(key) : null;
    }

    let content = $derived(help.tip
        ? {
            title: text(`help.${help.tip.id}.title`) ?? help.tip.id,
            body: text(`help.${help.tip.id}.body`),
            advice: text(`help.${help.tip.id}.advice`),
            warning: text(`help.${help.tip.id}.warning`)
        }
        : null);

    function place(): void
    {
        if (!help.tip || !tooltip)
        {
            return;
        }
        const anchor = help.tip.anchor.getBoundingClientRect();
        const box = tooltip.getBoundingClientRect();
        const below = anchor.bottom + GAP;
        const above = window.innerHeight - below < box.height + MARGIN && anchor.top - GAP - box.height > MARGIN;
        const left = Math.min(Math.max(MARGIN, anchor.left + anchor.width / 2 - box.width / 2),
            window.innerWidth - box.width - MARGIN);
        const next = { left, top: above ? anchor.top - GAP - box.height : below, above };
        // Writing an unchanged position would render again for nothing
        if (next.left !== position.left || next.top !== position.top || next.above !== position.above)
        {
            position = next;
        }
    }

    $effect(() =>
    {
        if (help.tip && tooltip)
        {
            // Placing reads the position and the tooltip size: only a new tip or a new tooltip element places it again
            untrack(place);
        }
    });

    function onWindowKey(event: KeyboardEvent): void
    {
        if (event.key === "Escape" && help.tip)
        {
            help.hide(true);
        }
    }

    function onWindowPointerDown(event: PointerEvent): void
    {
        // A pinned tooltip closes when clicking elsewhere
        const target = event.target as Node | null;
        if (help.tip?.pinned && tooltip && target && !tooltip.contains(target) && !help.tip.anchor.contains(target))
        {
            help.hide(true);
        }
    }
</script>

<svelte:window onkeydown={onWindowKey} onpointerdown={onWindowPointerDown} onresize={place} onscrollcapture={place} />

{#if help.tip && content}
    <div
        bind:this={tooltip}
        id={TOOLTIP_ID}
        class="tooltip"
        class:pinned={help.tip.pinned}
        class:above={position.above}
        role="tooltip"
        use:modalLayer={help.tip.id}
        style:left={`${position.left}px`}
        style:top={`${position.top}px`}
        onpointerenter={() => help.keep()}
        onpointerleave={() => help.scheduleHide()}
    >
        <div class="head">
            <strong class="title">{content.title}</strong>
            <button class="pin" type="button" aria-pressed={help.tip.pinned}
                aria-label={t(help.tip.pinned ? "help.unpin" : "help.pin")} onclick={() => help.togglePin()}>
                <Icon name={help.tip.pinned ? "close" : "pin"} size={14} />
            </button>
        </div>
        {#if content.body}
            <p>{content.body}</p>
        {/if}
        {#if ILLUSTRATIONS[help.tip.id]}
            {@const illustration = ILLUSTRATIONS[help.tip.id]}
            {#if illustration}
                {@const Illustration = illustration.component}
                <div class="figure"><Illustration {...illustration.props(help.tip.values ?? {})} /></div>
            {/if}
        {/if}
        {#if content.advice}
            <p class="advice">
                <Icon name="check" size={14} />
                <span><span class="visually-hidden">{t("help.adviceLabel")} : </span>{content.advice}</span>
            </p>
        {/if}
        {#if content.warning}
            <p class="warning">
                <Icon name="warning" size={14} />
                <span><span class="visually-hidden">{t("help.warningLabel")} : </span>{content.warning}</span>
            </p>
        {/if}
        <button class="more" type="button" onclick={() => help.openPanel(help.tip?.id ?? null)}>
            <Icon name="book" size={14} />
            {t("help.more")}
        </button>
    </div>
{/if}

<style>
    .tooltip
    {
        position: fixed;
        z-index: 100;
        width: max-content;
        max-width: min(320px, calc(100vw - 16px));
        padding: 10px 12px;
        border: 1px solid var(--tooltip-border);
        border-radius: var(--radius);
        background: var(--tooltip-background);
        color: var(--tooltip-text);
        box-shadow: var(--shadow);
        font-size: 13px;
        line-height: 1.45;
        animation: appear 120ms ease-out;
    }

    .tooltip.pinned
    {
        border-width: 2px;
    }

    @keyframes appear
    {
        from
        {
            opacity: 0;
            transform: translateY(-4px);
        }
    }

    .above
    {
        animation-name: appear-above;
    }

    @keyframes appear-above
    {
        from
        {
            opacity: 0;
            transform: translateY(4px);
        }
    }

    .head
    {
        display: flex;
        align-items: flex-start;
        gap: 8px;
    }

    .title
    {
        flex: 1;
        font-size: 14px;
    }

    .pin
    {
        display: inline-flex;
        padding: 2px;
        border: none;
        border-radius: 4px;
        background: transparent;
        cursor: pointer;
    }

    .pin:hover
    {
        background: rgba(75, 42, 70, 0.12);
    }

    p
    {
        margin: 6px 0 0;
    }

    .figure
    {
        margin-top: 8px;
        padding: 4px;
        border-radius: 4px;
        background: var(--surface);
    }

    .advice,
    .warning
    {
        display: flex;
        gap: 6px;
        align-items: flex-start;
    }

    .advice :global(svg),
    .warning :global(svg)
    {
        margin-top: 2px;
    }

    .warning
    {
        font-weight: 600;
    }

    .more
    {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-top: 8px;
        padding: 0;
        border: none;
        background: none;
        font-size: 12px;
        font-weight: 700;
        text-decoration: underline;
        cursor: pointer;
    }
</style>
