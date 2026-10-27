<script lang="ts">
    import { tick } from "svelte";
    import { isMessageKey } from "../i18n";
    import { help } from "../state/help.svelte";
    import { i18n } from "../state/i18n.svelte";
    import Icon from "../components/Icon.svelte";
    import { ILLUSTRATIONS } from "../illustrations/registry";
    import { HELP_GROUPS, HELP_TOPICS } from "./topics";

    // Side help panel (specification 6.11): every topic grouped by theme, opened at the requested one.
    // The illustrated glossary and the "Ma première carte" guide are completed in milestone J11.

    const t = i18n.t;
    let panel: HTMLElement | undefined = $state();

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
    <div class="panel" bind:this={panel} tabindex="-1" role="dialog" aria-modal="false" aria-labelledby="help-panel-title"
        onkeydown={(event) => event.key === "Escape" && help.closePanel()}>
        <header>
            <Icon name="book" />
            <h2 id="help-panel-title">{t("help.panelTitle")}</h2>
            <button class="close" type="button" aria-label={t("help.close")} onclick={() => help.closePanel()}>
                <Icon name="close" />
            </button>
        </header>
        <div class="scroll">
            <p class="intro">{t("help.panelIntro")}</p>
            {#each HELP_GROUPS as group (group)}
                <section aria-labelledby={`help-group-${group}`}>
                    <h3 id={`help-group-${group}`}>{t(`help.group.${group}`)}</h3>
                    {#each HELP_TOPICS.filter((topic) => topic.group === group) as topic (topic.id)}
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
            {/each}
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
