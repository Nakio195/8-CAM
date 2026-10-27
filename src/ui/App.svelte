<script lang="ts">
    import { onMount } from "svelte";
    import { APP_VERSION } from "@core/index";
    import logoUrl from "../../assets/brand/logo-generique-horizontal.svg";
    import { LOCALES, type Locale } from "./i18n";
    import { i18n } from "./state/i18n.svelte";
    import { project } from "./state/project.svelte";
    import CanvasView from "./components/CanvasView.svelte";
    import EmptyState from "./components/EmptyState.svelte";
    import Icon from "./components/Icon.svelte";
    import LayerPanel from "./components/LayerPanel.svelte";

    const t = i18n.t;

    let fileInput: HTMLInputElement;
    let dragDepth = $state(0);

    function openFiles(): void
    {
        fileInput.click();
    }

    function onFilesChosen(event: Event & { currentTarget: HTMLInputElement }): void
    {
        const files = event.currentTarget.files;
        if (files && files.length > 0)
        {
            void project.importFiles(files);
        }
        // Allows choosing the same file again
        event.currentTarget.value = "";
    }

    function hasFiles(event: DragEvent): boolean
    {
        return event.dataTransfer?.types.includes("Files") ?? false;
    }

    function onDragEnter(event: DragEvent): void
    {
        if (hasFiles(event))
        {
            event.preventDefault();
            dragDepth++;
        }
    }

    function onDragOver(event: DragEvent): void
    {
        if (hasFiles(event))
        {
            event.preventDefault();
            if (event.dataTransfer)
            {
                event.dataTransfer.dropEffect = "copy";
            }
        }
    }

    function onDragLeave(event: DragEvent): void
    {
        if (hasFiles(event))
        {
            dragDepth = Math.max(0, dragDepth - 1);
        }
    }

    function onDrop(event: DragEvent): void
    {
        event.preventDefault();
        dragDepth = 0;
        const files = event.dataTransfer?.files;
        if (files && files.length > 0)
        {
            void project.importFiles(files);
        }
    }

    onMount(() =>
    {
        document.documentElement.lang = i18n.locale;
        // Development helper: ?load=url1,url2 imports files served by the dev server (performance checks)
        if (import.meta.env.DEV)
        {
            const urls = new URLSearchParams(window.location.search).get("load");
            for (const url of urls ? urls.split(",") : [])
            {
                void fetch(url).then(async (response) =>
                    project.importText(decodeURIComponent(url.replace(/^.*\//, "")), await response.text()));
            }
        }
    });

    let showEmpty = $derived(project.layers.length === 0 && project.tasks.length === 0);
</script>

<svelte:window ondragenter={onDragEnter} ondragover={onDragOver} ondragleave={onDragLeave} ondrop={onDrop} />

<div class="app">
    <header>
        <span class="logo" style:--logo={`url("${logoUrl}")`} role="img" aria-label="8 Fablab Drôme"></span>
        <h1>{t("app.title")}</h1>
        <span class="tagline">{t("app.tagline")}</span>
        <span class="spacer"></span>
        <button class="header-button" type="button" title={t("header.openHint")} onclick={openFiles}>
            <Icon name="open" />
            <span>{t("header.open")}</span>
        </button>
        <button class="header-button" type="button" title={t("header.exampleHint")} onclick={() => project.loadExample()}>
            <Icon name="board" />
            <span>{t("header.example")}</span>
        </button>
        <label class="language" title={t("app.language")}>
            <span class="visually-hidden">{t("app.language")}</span>
            <select value={i18n.locale} onchange={(event) => i18n.setLocale(event.currentTarget.value as Locale)}>
                {#each LOCALES as option (option)}
                    <option value={option}>{option.toUpperCase()}</option>
                {/each}
            </select>
        </label>
        <input bind:this={fileInput} class="visually-hidden" type="file" multiple tabindex="-1" aria-hidden="true"
            onchange={onFilesChosen} />
    </header>

    <main>
        <aside>
            <LayerPanel />
            <p class="version">{t("app.version", { version: APP_VERSION })}</p>
        </aside>
        <section class="viewport">
            <CanvasView layers={project.layers} fitRequest={project.fitRequest} />
            {#if showEmpty}
                <EmptyState onOpen={openFiles} onExample={() => project.loadExample()} />
            {/if}
        </section>
    </main>

    {#if dragDepth > 0}
        <div class="drop" aria-hidden="true">
            <Icon name="open" size={48} />
            <p>{t("drop.hint")}</p>
        </div>
    {/if}
</div>

<style>
    .app
    {
        display: flex;
        flex-direction: column;
        height: 100vh;
    }

    header
    {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 16px;
        background: var(--header-background);
        color: var(--header-text);
    }

    .logo
    {
        width: 44px;
        height: 36px;
        background-color: #ffffff;
        mask: var(--logo) no-repeat center / contain;
    }

    h1
    {
        margin: 0;
        font-family: var(--font-title);
        font-size: 26px;
        font-weight: 400;
        letter-spacing: 0.05em;
    }

    .tagline
    {
        font-size: 13px;
        opacity: 0.8;
    }

    .spacer
    {
        flex: 1;
    }

    .header-button
    {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: var(--radius);
        background: transparent;
        color: inherit;
        cursor: pointer;
    }

    .header-button:hover
    {
        background: rgba(255, 255, 255, 0.12);
    }

    .language select
    {
        padding: 5px 6px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: var(--radius);
        background: transparent;
        color: inherit;
    }

    .language option
    {
        color: #4b2a46;
    }

    main
    {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: 340px 1fr;
    }

    aside
    {
        display: flex;
        flex-direction: column;
        min-height: 0;
        border-right: 1px solid var(--border);
        background: var(--surface-panel);
    }

    .version
    {
        margin: 0;
        padding: 6px 12px;
        font-size: 11px;
        color: var(--text-muted);
    }

    .viewport
    {
        position: relative;
        min-width: 0;
        min-height: 0;
    }

    .drop
    {
        position: fixed;
        inset: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 3px dashed var(--brand-rose);
        border-radius: 16px;
        background: rgba(31, 16, 28, 0.85);
        color: #ffffff;
        font-size: 18px;
        pointer-events: none;
        z-index: 10;
    }

    .visually-hidden
    {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
    }

    @media (max-width: 760px)
    {
        main
        {
            grid-template-columns: 1fr;
            grid-template-rows: 40% 60%;
        }

        .tagline,
        .header-button span
        {
            display: none;
        }

        aside
        {
            border-right: none;
            border-bottom: 1px solid var(--border);
        }
    }
</style>
