<script lang="ts">
    import patternUrl from "../../../assets/brand/habillage/logo-facettes.svg";
    import { i18n } from "../state/i18n.svelte";
    import Button from "./base/Button.svelte";
    import Icon from "./Icon.svelte";

    // Home screen when no board is loaded. Brand layout "jeu de moitiés" (specification 6.13): an axis splits the
    // space into two equal halves, identity on one side, actions on the other. The -10° slant is allowed here only.
    let { onOpen, onExample, onGuide }: { onOpen: () => void; onExample: () => void; onGuide: () => void } = $props();

    const t = i18n.t;
</script>

<div class="home">
    <div class="identity">
        <div class="pattern" style:--pattern={`url("${patternUrl}")`} aria-hidden="true"></div>
        <p class="title" aria-hidden="true">8-CAM</p>
        <p class="tagline">{t("app.tagline")}</p>
    </div>
    <div class="actions-half">
        <div class="card">
            <Icon name="board" size={40} />
            <h2>{t("empty.title")}</h2>
            <p>{t("empty.body")}</p>
            <div class="actions">
                <Button variant="primary" icon="open" help="fileOpen" onclick={onOpen}>{t("header.open")}</Button>
                <Button variant="secondary" icon="board" help="fileExample" onclick={onExample}>{t("header.example")}</Button>
                <Button variant="ghost" icon="book" help="guideOpen" onclick={onGuide}>{t("guide.open")}</Button>
            </div>
            <p class="formats">{t("empty.formats")}</p>
            <p class="drop">
                <Icon name="open" size={16} />
                {t("drop.hint")}
            </p>
        </div>
    </div>
</div>

<style>
    .home
    {
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        z-index: 2;
    }

    .identity
    {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 32px;
        background: var(--brand-prune);
        color: #ffffff;
        overflow: hidden;
    }

    /* Two-colour brand pattern in the corner, away from the text: only the faceted "8" of the decoration logo,
       its lettering stays outside the box so it is never shown cut */
    .pattern
    {
        position: absolute;
        right: -40px;
        bottom: -40px;
        width: 260px;
        height: 285px;
        background-color: var(--brand-rose);
        mask: var(--pattern) no-repeat top center / 260px auto;
        opacity: 0.55;
        pointer-events: none;
    }

    .title
    {
        position: relative;
        margin: 0;
        font-family: var(--font-title);
        font-size: clamp(56px, 9vw, 120px);
        line-height: 0.9;
        letter-spacing: 0.02em;
        transform: skewX(-10deg);
        transform-origin: left bottom;
    }

    .tagline
    {
        position: relative;
        max-width: 22ch;
        margin: 16px 0 0;
        font-size: 18px;
        line-height: 1.35;
    }

    .actions-half
    {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: var(--surface);
        color: var(--text);
        border-left: 4px solid var(--brand-rouge);
    }

    .card
    {
        max-width: 420px;
    }

    h2
    {
        margin: 8px 0;
        font-family: var(--font-title);
        font-size: 30px;
        font-weight: 400;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    p
    {
        margin: 8px 0;
        line-height: 1.5;
    }

    .actions
    {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 16px 0;
    }

    .formats,
    .drop
    {
        font-size: 12px;
        color: var(--text-muted);
    }

    .drop
    {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    @media (max-width: 760px)
    {
        .home
        {
            grid-template-columns: 1fr;
            grid-template-rows: auto 1fr;
        }

        .identity
        {
            padding: 20px;
        }

        .actions-half
        {
            border-left: none;
            border-top: 4px solid var(--brand-rouge);
        }
    }
</style>
