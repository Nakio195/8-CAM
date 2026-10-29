<script lang="ts">
    import { onMount } from "svelte";
    import cartoucheUrl from "../../../assets/brand/Logo-cartouche.svg";
    import horizontalUrl from "../../../assets/brand/logo-generique-horizontal.svg";
    import facettesUrl from "../../../assets/brand/habillage/logo-facettes.svg";
    import pointsUrl from "../../../assets/brand/habillage/logo-points.svg";
    import splashUrl from "../../../assets/brand/habillage/logo-splash.svg";
    import { LOCALES, type Locale } from "../i18n";
    import { help } from "../help";
    import HelpPanel from "../help/HelpPanel.svelte";
    import HelpTipLayer from "../help/HelpTipLayer.svelte";
    import { i18n } from "../state/i18n.svelte";
    import { theme, type ThemeMode } from "../state/theme.svelte";
    import { contrastRatio, AA_NORMAL_TEXT } from "../theme/contrast";
    import Button from "../components/base/Button.svelte";
    import Callout from "../components/base/Callout.svelte";
    import IconButton from "../components/base/IconButton.svelte";
    import NumberField from "../components/base/NumberField.svelte";
    import Sticker from "../components/base/Sticker.svelte";
    import Icon, { ICON_NAMES } from "../components/Icon.svelte";

    const t = i18n.t;

    const BRAND = [
        ["--brand-prune", "Prune"], ["--brand-prune-light", "Prune clair"],
        ["--brand-rouge", "Rouge"], ["--brand-rouge-light", "Rouge clair"],
        ["--brand-rose", "Rose"], ["--brand-rose-light", "Rose clair"],
        ["--accent-formation", "Formation"], ["--accent-formation-light", "Formation clair"],
        ["--accent-pro", "Service PRO"], ["--accent-pro-light", "Service PRO clair"],
        ["--accent-cowork", "Co-working"], ["--accent-cowork-light", "Co-working clair"],
        ["--brand-rouge-strong", "Rouge (texte blanc)"]
    ] as const;

    const PAIRS = [
        ["--text", "--surface"], ["--text-muted", "--surface"], ["--header-text", "--header-background"],
        ["--action-text", "--action-background"], ["--secondary-text", "--secondary-background"],
        ["--success-text", "--success-background"], ["--warning-text", "--warning-background"],
        ["--error-text", "--error-background"], ["--info-text", "--info-background"],
        ["--tooltip-text", "--tooltip-background"], ["--sticker-success-text", "--sticker-success"],
        ["--sticker-warning-text", "--sticker-warning"], ["--sticker-error-text", "--sticker-error"],
        ["--sticker-info-text", "--sticker-info"]
    ] as const;

    // Values are read from the live CSS so the page always shows what the application uses, in the current theme
    let values: Record<string, string> = $state({});

    function readTokens(): void
    {
        const style = getComputedStyle(document.documentElement);
        const names = [...BRAND.map(([name]) => name), ...PAIRS.flat()];
        values = Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim().toLowerCase()]));
    }

    function ratio(text: string, background: string): number
    {
        const foreground = values[text];
        const back = values[background];
        return foreground && back && /^#[0-9a-f]{6}$/.test(foreground) && /^#[0-9a-f]{6}$/.test(back)
            ? contrastRatio(foreground, back)
            : 0;
    }

    function setMode(mode: ThemeMode): void
    {
        theme.setMode(mode);
        // Wait for the new custom properties before reading them
        requestAnimationFrame(readTokens);
    }

    onMount(() =>
    {
        readTokens();
        const media = matchMedia("(prefers-color-scheme: dark)");
        media.addEventListener("change", readTokens);
        return () => media.removeEventListener("change", readTokens);
    });

    let diameter = $state(0.8);
    let depth = $state(-0.1);
    let overlap = $state(15);
</script>

<div class="page">
    <header>
        <span class="logo" style:--logo={`url("${horizontalUrl}")`} role="img" aria-label="8 Fablab Drôme"></span>
        <h1>{t("sg.title")}</h1>
        <span class="spacer"></span>
        <label>
            <span class="visually-hidden">{t("app.language")}</span>
            <select value={i18n.locale} use:help={"language"} onchange={(event) => i18n.setLocale(event.currentTarget.value as Locale)}>
                {#each LOCALES as option (option)}
                    <option value={option}>{option.toUpperCase()}</option>
                {/each}
            </select>
        </label>
        <label>
            <span class="visually-hidden">{t("help.theme.title")}</span>
            <select value={theme.mode} use:help={"theme"} onchange={(event) => setMode(event.currentTarget.value as ThemeMode)}>
                <option value="auto">{t("theme.auto")}</option>
                <option value="light">{t("theme.light")}</option>
                <option value="dark">{t("theme.dark")}</option>
            </select>
        </label>
        <a class="back" href="./">{t("sg.back")}</a>
    </header>

    <main>
        <p class="intro">{t("sg.intro")}</p>

        <section>
            <h2>{t("sg.colors")}</h2>
            <div class="swatches">
                {#each BRAND as [token, name] (token)}
                    <figure class="swatch">
                        <div class="chip" style:background={`var(${token})`}></div>
                        <figcaption>
                            <strong>{name}</strong>
                            <code>{token}</code>
                            <code>{values[token]}</code>
                        </figcaption>
                    </figure>
                {/each}
            </div>
        </section>

        <section>
            <h2>{t("sg.semantic")}</h2>
            <p class="note">{t("sg.contrastNote")}</p>
            <div class="pairs">
                {#each PAIRS as [text, background] (text + background)}
                    {@const value = ratio(text, background)}
                    <div class="pair" style:color={`var(${text})`} style:background={`var(${background})`}>
                        <span>Aa — {t("sg.example")}</span>
                        <code>{text} / {background}</code>
                        <span class="ratio">
                            <Icon name={value >= AA_NORMAL_TEXT ? "check" : "warning"} size={14} />
                            {i18n.number(value, 2)}:1
                        </span>
                    </div>
                {/each}
            </div>
        </section>

        <section>
            <h2>{t("sg.typography")}</h2>
            <p class="note">{t("sg.titles")}</p>
            <p class="bebas" style:font-size="40px">Isolation · Perçage · Détourage</p>
            <p class="bebas" style:font-size="24px">0,1 mm · 30° · 10 000 tr/min</p>
            <p class="note">{t("sg.homeTitle")}</p>
            <p class="bebas slanted">pcbCAM</p>
            <p class="note">{t("sg.body")}</p>
            {#each [300, 400, 500, 600, 700, 800] as weight (weight)}
                <p style:font-weight={weight}>{weight} — Le V-bit de 30° grave une piste de 0,2 mm sur du FR4.</p>
            {/each}
            <p><em>Italique — Le cuivre fait 35 µm : il suffit de le traverser.</em></p>
            <p class="note">{t("sg.mono")}</p>
            <pre class="mono">G21 G90 G17 G94
M03 S10000
G00 Z1.0000
G01 X12.7000 Y-3.4000 F150.00</pre>
        </section>

        <section>
            <h2>{t("sg.stickers")}</h2>
            <div class="row">
                <Sticker tone="success" icon="check">{t("sg.success")}</Sticker>
                <Sticker tone="warning" icon="warning">{t("sg.limit")}</Sticker>
                <Sticker tone="error" icon="error">{t("sg.tooWide")}</Sticker>
                <Sticker tone="neutral" shape="tag">GRBL</Sticker>
                <Sticker tone="info" icon="tool" shape="tag">{t("sg.vbit")}</Sticker>
                <Sticker tone="accent" icon="tool" shape="tag">{t("sg.endmill")}</Sticker>
                <Sticker tone="neutral" icon="drill" shape="tag">{t("sg.drill")}</Sticker>
                <Sticker tone="info" icon="clock">{t("sg.duration")}</Sticker>
            </div>
        </section>

        <section>
            <h2>{t("sg.buttons")}</h2>
            <div class="row">
                <Button variant="primary" icon="open" help="fileOpen">{t("header.open")}</Button>
                <Button variant="secondary" icon="board" help="fileExample">{t("header.example")}</Button>
                <Button variant="ghost" icon="fit" help="viewFit">{t("help.viewFit.title")}</Button>
                <Button variant="primary" disabled>{t("sg.disabled")}</Button>
                <IconButton icon="grid" label={t("view.grid")} help="viewGrid" />
                <IconButton icon="measure" label={t("view.measure")} help="viewMeasure" pressed={true} />
            </div>
            <div class="row dark-band">
                <span>{t("sg.onDark")}</span>
                <Button variant="onDark" icon="open" help="fileOpen">{t("header.open")}</Button>
                <IconButton icon="fit" tone="onDark" label={t("view.fit")} help="viewFit" />
                <IconButton icon="grid" tone="onDark" label={t("view.grid")} help="viewGrid" pressed={true} />
            </div>
        </section>

        <section>
            <h2>{t("sg.fields")}</h2>
            <div class="fields">
                <NumberField id="sg-diameter" label={t("help.diameter.title")} help="diameter" unit="mm" step={0.01} min={0.01}
                    bind:value={diameter} helpLabel={`${t("header.help")} : ${t("help.diameter.title")}`} />
                <NumberField id="sg-depth" label={t("help.cutDepth.title")} help="cutDepth" unit="mm" step={0.01} max={0}
                    bind:value={depth} helpLabel={`${t("header.help")} : ${t("help.cutDepth.title")}`} />
                <NumberField id="sg-overlap" label={t("help.overlap.title")} help="overlap" unit="%" step={1} min={0} max={50}
                    bind:value={overlap} helpLabel={`${t("header.help")} : ${t("help.overlap.title")}`} />
            </div>
        </section>

        <section>
            <h2>{t("sg.callouts")}</h2>
            <div class="stack">
                <Callout tone="success" title={t("sg.success")}>{t("sg.calloutSuccess")}</Callout>
                <Callout tone="warning" title={t("sg.limit")}>{t("sg.calloutWarning")}</Callout>
                <Callout tone="error" title={t("sg.tooWide")}>{t("sg.calloutError")}</Callout>
                <Callout tone="info">{t("sg.calloutInfo")}</Callout>
                <Callout tone="help">{t("sg.calloutHelp")}</Callout>
            </div>
        </section>

        <section>
            <h2>{t("sg.helptips")}</h2>
            <p class="note">{t("sg.helptipsNote")}</p>
            <div class="row">
                {#each ["diameter", "tipAngle", "tipDiameter", "cutDepth", "passes", "overlap", "millingDirection", "tabs", "safeZ", "nonIsolated"] as topic (topic)}
                    <button class="topic" type="button" use:help={topic}>{t(`help.${topic}.title` as Parameters<typeof t>[0])}</button>
                {/each}
            </div>
        </section>

        <section>
            <h2>{t("sg.icons")}</h2>
            <div class="icons">
                {#each ICON_NAMES as name (name)}
                    <figure>
                        <Icon {name} size={24} />
                        <figcaption><code>{name}</code></figcaption>
                    </figure>
                {/each}
            </div>
        </section>

        <section>
            <h2>{t("sg.patterns")}</h2>
            <p class="note">{t("sg.patternsNote")}</p>
            <div class="patterns">
                {#each [[facettesUrl, "var(--brand-prune)", "var(--brand-rose)"], [pointsUrl, "var(--brand-rose-light)", "var(--brand-rose)"], [splashUrl, "var(--accent-formation-light)", "var(--accent-formation)"]] as [url, back, front] (url)}
                    <div class="pattern-box" style:background={back}>
                        <div class="pattern" style:--pattern={`url("${url}")`} style:background-color={front}></div>
                    </div>
                {/each}
                <div class="logo-box light"><img src={horizontalUrl} alt="8 Fablab Drôme" /></div>
                <div class="logo-box light"><img src={cartoucheUrl} alt="8FABLAB.FR" /></div>
            </div>
        </section>
    </main>

    <HelpPanel />
    <HelpTipLayer />
</div>

<style>
    .page
    {
        position: relative;
        min-height: 100vh;
    }

    header
    {
        position: sticky;
        top: 0;
        z-index: 5;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 20px;
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
        font-size: 28px;
        font-weight: 400;
        letter-spacing: 0.05em;
    }

    header select
    {
        padding: 4px 6px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: var(--radius);
        background: transparent;
        color: inherit;
    }

    header option
    {
        color: #4b2a46;
    }

    .back
    {
        color: inherit;
        font-weight: 700;
    }

    .spacer
    {
        flex: 1;
    }

    main
    {
        max-width: 1100px;
        margin: 0 auto;
        padding: 20px;
    }

    section
    {
        margin: 32px 0;
    }

    h2
    {
        margin: 0 0 12px;
        font-family: var(--font-title);
        font-size: 26px;
        font-weight: 400;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        border-bottom: 3px solid var(--brand-rouge);
    }

    .intro,
    .note
    {
        color: var(--text-muted);
    }

    .swatches
    {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 12px;
    }

    .swatch
    {
        margin: 0;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        overflow: hidden;
    }

    .chip
    {
        height: 64px;
    }

    figcaption
    {
        display: flex;
        flex-direction: column;
        padding: 6px 8px;
        font-size: 12px;
    }

    .pairs
    {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 8px;
    }

    .pair
    {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
    }

    .pair code
    {
        font-size: 11px;
        opacity: 0.85;
    }

    .ratio
    {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-weight: 700;
    }

    .bebas
    {
        margin: 4px 0;
        font-family: var(--font-title);
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .slanted
    {
        font-size: 72px;
        line-height: 1;
        transform: skewX(-10deg);
        transform-origin: left bottom;
        color: var(--brand-rouge);
    }

    .mono
    {
        padding: 12px;
        border-radius: var(--radius);
        background: var(--canvas-background);
        color: var(--canvas-text);
        font-family: var(--font-mono);
    }

    .row
    {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        margin: 8px 0;
    }

    .dark-band
    {
        padding: 10px 12px;
        border-radius: var(--radius);
        background: var(--brand-prune);
        color: #ffffff;
    }

    .fields
    {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
    }

    .stack
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .topic
    {
        padding: 6px 12px;
        border: 1px dashed var(--border);
        border-radius: 999px;
        background: var(--surface-panel);
        cursor: help;
    }

    .icons
    {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
        gap: 8px;
    }

    .icons figure
    {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        margin: 0;
        padding: 10px 4px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
    }

    .patterns
    {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 12px;
    }

    .pattern-box,
    .logo-box
    {
        height: 200px;
        border-radius: var(--radius);
        overflow: hidden;
    }

    .pattern
    {
        width: 100%;
        height: 100%;
        mask: var(--pattern) no-repeat center / contain;
    }

    .logo-box
    {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    }

    .logo-box.light
    {
        background: #ffffff;
        border: 1px solid var(--border);
    }

    .logo-box img
    {
        max-width: 100%;
        max-height: 100%;
    }
</style>
