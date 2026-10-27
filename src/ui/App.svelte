<script lang="ts">
    import { onMount } from "svelte";
    import { APP_VERSION } from "@core/index";
    import logoUrl from "../../assets/brand/logo-generique-horizontal.svg";
    import { LOCALES, type Locale } from "./i18n";
    import { help } from "./help";
    import HelpPanel from "./help/HelpPanel.svelte";
    import HelpTipLayer from "./help/HelpTipLayer.svelte";
    import { help as helpState } from "./state/help.svelte";
    import { i18n } from "./state/i18n.svelte";
    import { project } from "./state/project.svelte";
    import { theme, type ThemeMode } from "./state/theme.svelte";
    import AboutDialog from "./components/AboutDialog.svelte";
    import Button from "./components/base/Button.svelte";
    import IconButton from "./components/base/IconButton.svelte";
    import CanvasView from "./components/CanvasView.svelte";
    import EmptyState from "./components/EmptyState.svelte";
    import Icon from "./components/Icon.svelte";
    import LayerPanel from "./components/LayerPanel.svelte";
    import SidebarTabs from "./components/SidebarTabs.svelte";
    import AnalysisPanel from "./analysis/AnalysisPanel.svelte";
    import { toolLibrary } from "./state/tools.svelte";
    import ToolLibraryPanel from "./tools/ToolLibraryPanel.svelte";

    const t = i18n.t;

    let fileInput: HTMLInputElement;
    let dragDepth = $state(0);
    let aboutOpen = $state(false);
    let sidebarTab = $state("project");

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
        // The analysis needs the tool library even before the Tools tab is opened
        void toolLibrary.load();
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
        <Button variant="onDark" icon="open" help="fileOpen" onclick={openFiles}>
            <span class="button-text">{t("header.open")}</span>
        </Button>
        <Button variant="onDark" icon="board" help="fileExample" onclick={() => project.loadExample()}>
            <span class="button-text">{t("header.example")}</span>
        </Button>
        <label class="select">
            <span class="visually-hidden">{t("app.language")}</span>
            <select value={i18n.locale} use:help={"language"}
                onchange={(event) => i18n.setLocale(event.currentTarget.value as Locale)}>
                {#each LOCALES as option (option)}
                    <option value={option}>{option.toUpperCase()}</option>
                {/each}
            </select>
        </label>
        <label class="select">
            <span class="visually-hidden">{t("help.theme.title")}</span>
            <select value={theme.mode} use:help={"theme"}
                onchange={(event) => theme.setMode(event.currentTarget.value as ThemeMode)}>
                <option value="auto">{t("theme.auto")}</option>
                <option value="light">{t("theme.light")}</option>
                <option value="dark">{t("theme.dark")}</option>
            </select>
        </label>
        <IconButton icon="help" label={t("header.help")} help="helpPanel" tone="onDark" pressed={helpState.panelOpen}
            onclick={() => (helpState.panelOpen ? helpState.closePanel() : helpState.openPanel())} />
        <IconButton icon="about" label={t("header.about")} help="about" tone="onDark" onclick={() => (aboutOpen = true)} />
        <input bind:this={fileInput} class="visually-hidden" type="file" multiple tabindex="-1" aria-hidden="true"
            onchange={onFilesChosen} />
    </header>

    <main>
        <aside>
            <SidebarTabs label={t("tabs.label")} bind:active={sidebarTab} tabs={[
                { id: "project", label: t("tabs.project"), help: "tabProject" },
                { id: "tools", label: t("tabs.tools"), help: "tabTools" },
                { id: "analysis", label: t("tabs.analysis"), help: "tabAnalysis" }
            ]} />
            <div class="tab-panel" id={`panel-${sidebarTab}`} role="tabpanel" aria-labelledby={`tab-${sidebarTab}`}>
                {#if sidebarTab === "project"}
                    <LayerPanel />
                {:else if sidebarTab === "tools"}
                    <ToolLibraryPanel />
                {:else}
                    <AnalysisPanel />
                {/if}
            </div>
            <p class="version">{t("app.version", { version: APP_VERSION })}</p>
        </aside>
        <section class="viewport">
            <CanvasView layers={project.layers} fitRequest={project.fitRequest} focus={project.focus} />
            {#if showEmpty}
                <EmptyState onOpen={openFiles} onExample={() => project.loadExample()} />
            {/if}
            <HelpPanel />
        </section>
    </main>

    <HelpTipLayer />
    <AboutDialog bind:open={aboutOpen} />

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
        white-space: nowrap;
        font-family: var(--font-title);
        font-size: 26px;
        font-weight: 400;
        letter-spacing: 0.05em;
    }

    .tagline
    {
        font-size: 13px;
        opacity: 0.8;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .spacer
    {
        flex: 1;
    }

    .select select
    {
        padding: 5px 6px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: var(--radius);
        background: transparent;
        color: inherit;
    }

    .select option
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
        overflow: hidden;
        border-right: 1px solid var(--border);
        background: var(--surface-panel);
    }

    .tab-panel
    {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
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

    /* The tagline gives way first when the header gets crowded */
    @media (max-width: 1180px)
    {
        .tagline
        {
            display: none;
        }
    }

    @media (max-width: 760px)
    {
        main
        {
            grid-template-columns: 1fr;
            grid-template-rows: 40% 60%;
        }

        .tagline,
        .button-text
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
