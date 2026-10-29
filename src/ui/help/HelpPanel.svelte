<script lang="ts">
    import { tick } from "svelte";
    import { isMessageKey } from "../i18n";
    import { help } from "../state/help.svelte";
    import { i18n } from "../state/i18n.svelte";
    import Icon from "../components/Icon.svelte";
    import { ILLUSTRATIONS } from "../illustrations/registry";
    import FirstBoardGuide from "./FirstBoardGuide.svelte";
    import { helpAction } from "./helpAction";
    import { modalLayer } from "./modalLayer";
    import { HELP_GROUPS, HELP_TOPICS } from "./topics";

    // Side help panel (specification 6.11): the "Ma première carte" guide, and the illustrated glossary of every topic
    // grouped by theme, opened at the requested one, with a search.

    const t = i18n.t;
    let panel: HTMLElement | undefined = $state();
    let search = $state("");

    /** Accents and case do not matter when searching: "decalage" finds "Décalage". */
    function plain(value: string): string
    {
        return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    let query = $derived(plain(search.trim()));
    let matches = $derived(query === ""
        ? null
        : new Set(HELP_TOPICS.filter((topic) =>
            ["title", "body", "advice", "warning"].some((part) => plain(text(`help.${topic.id}.${part}`) ?? "").includes(query)))
            .map((topic) => topic.id)));

    function text(key: string): string | null
    {
        return isMessageKey(key) ? t(key) : null;
    }

    $effect(() =>
    {
        if (help.panelOpen && panel)
        {
            const topic = help.panelTopic;
            void tick().then(() =>
            {
                const target = topic ? panel?.querySelector<HTMLElement>(`#help-topic-${topic}`) : null;
                (target ?? panel)?.focus();
                target?.scrollIntoView({ block: "start" });
            });
        }
    });
</script>

{#if help.panelOpen}
    <div class="panel" bind:this={panel} data-modal-dock use:modalLayer tabindex="-1" role="dialog" aria-modal="false" aria-labelledby="help-panel-title"
        onkeydown={(event) => event.key === "Escape" && help.closePanel()}>
        <header>
            <Icon name="book" />
            <h2 id="help-panel-title">{t("help.panelTitle")}</h2>
            <button class="close" type="button" aria-label={t("help.close")} onclick={() => help.closePanel()}>
                <Icon name="close" />
            </button>
        </header>
        <div class="views" role="tablist" aria-label={t("help.panelTitle")}>
            <button type="button" role="tab" aria-selected={help.panelView === "guide"} use:helpAction={"guideOpen"}
                onclick={() => (help.panelView = "guide")}>{t("guide.title")}</button>
            <button type="button" role="tab" aria-selected={help.panelView === "glossary"} use:helpAction={"glossary"}
                onclick={() => (help.panelView = "glossary")}>{t("help.glossary")}</button>
        </div>
        <div class="scroll" role="tabpanel">
            {#if help.panelView === "guide"}
                <FirstBoardGuide />
            {:else}
            <p class="intro">{t("help.panelIntro")}</p>
            <input class="search" type="search" bind:value={search} placeholder={t("help.searchPlaceholder")}
                aria-label={t("help.search")} use:helpAction={"helpSearch"} />
            {#if matches && matches.size === 0}
                <p class="intro">{t("help.noResult")}</p>
            {/if}
            {#each HELP_GROUPS as group (group)}
                {@const topics = HELP_TOPICS.filter((topic) => topic.group === group && (!matches || matches.has(topic.id)))}
                {#if topics.length > 0}
                <section aria-labelledby={`help-group-${group}`}>
                    <h3 id={`help-group-${group}`}>{t(`help.group.${group}`)}</h3>
                    {#each topics as topic (topic.id)}
                        <article id={`help-topic-${topic.id}`} tabindex="-1" class:current={help.panelTopic === topic.id}>
                            <h4>{text(`help.${topic.id}.title`)}</h4>
                            <p>{text(`help.${topic.id}.body`)}</p>
                            {#if ILLUSTRATIONS[topic.id]}
                                {@const illustration = ILLUSTRATIONS[topic.id]}
                                {#if illustration}
                                    {@const Illustration = illustration.component}
                                    <div class="figure"><Illustration {...illustration.props({})} /></div>
                                {/if}
                            {/if}
                            {#if text(`help.${topic.id}.advice`)}
                                <p class="advice">
                                    <Icon name="check" size={14} />
                                    <span>{text(`help.${topic.id}.advice`)}</span>
                                </p>
                            {/if}
                            {#if text(`help.${topic.id}.warning`)}
                                <p class="warning">
                                    <Icon name="warning" size={14} />
                                    <span>{text(`help.${topic.id}.warning`)}</span>
                                </p>
                            {/if}
                        </article>
                    {/each}
                </section>
                {/if}
            {/each}
            {/if}
        </div>
    </div>
{/if}

<style>
    .panel
    {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        z-index: 20;
        display: flex;
        flex-direction: column;
        width: min(400px, 100%);
        background: var(--surface);
        color: var(--text);
        border-left: 1px solid var(--border);
        box-shadow: var(--shadow);
    }

    /* Inside an open dialog (tool editor...): docked on the right of the screen, the dialog moved aside to make room */
    .panel:global([data-in-modal])
    {
        position: fixed;
        height: 100vh;
        max-height: none;
    }

    .panel:focus
    {
        outline: none;
    }

    header
    {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: var(--help-background);
        color: var(--help-text);
    }

    h2
    {
        flex: 1;
        margin: 0;
        font-family: var(--font-title);
        font-size: 24px;
        font-weight: 400;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }

    .close
    {
        display: inline-flex;
        padding: 4px;
        border: none;
        border-radius: 4px;
        background: transparent;
        cursor: pointer;
    }

    .views
    {
        display: flex;
        border-bottom: 1px solid var(--border);
    }

    .views button
    {
        flex: 1;
        padding: 8px 6px 6px;
        border: none;
        border-bottom: 3px solid transparent;
        background: none;
        color: var(--text);
        font-family: var(--font-title);
        font-size: 17px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        cursor: pointer;
    }

    .views button[aria-selected="true"]
    {
        border-bottom-color: var(--brand-rouge);
    }

    .search
    {
        width: 100%;
        margin-bottom: 8px;
        padding: 6px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        color: var(--text);
    }

    .scroll
    {
        flex: 1;
        overflow-y: auto;
        padding: 4px 16px 24px;
    }

    .intro
    {
        color: var(--text-muted);
    }

    h3
    {
        margin: 20px 0 6px;
        font-family: var(--font-title);
        font-size: 20px;
        font-weight: 400;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        border-bottom: 2px solid var(--success-accent);
    }

    article
    {
        padding: 8px 10px;
        border-radius: var(--radius);
        scroll-margin-top: 8px;
    }

    article.current
    {
        background: var(--help-background);
    }

    article:focus
    {
        outline: 2px solid var(--focus);
    }

    h4
    {
        margin: 0 0 2px;
        font-size: 14px;
    }

    p
    {
        margin: 4px 0;
        line-height: 1.45;
    }

    .figure
    {
        max-width: 280px;
        margin: 6px 0;
    }

    .advice,
    .warning
    {
        display: flex;
        gap: 6px;
    }

    .warning
    {
        font-weight: 600;
    }
</style>
