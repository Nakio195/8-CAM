<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import Button from "./base/Button.svelte";
    import Icon from "./Icon.svelte";

    // Home screen when no board is loaded: the actions over the whole view (the header already shows the brand).
    let { onOpen, onExample, onGuide }: { onOpen: () => void; onExample: () => void; onGuide: () => void } = $props();

    const t = i18n.t;
</script>

<div class="home">
    <div class="actions-area">
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
        display: flex;
        z-index: 2;
    }

    .actions-area
    {
        flex: 1;
        display: flex;
        /* "safe": a view too small for the card scrolls instead of spilling over the side panel */
        align-items: safe center;
        justify-content: safe center;
        padding: 24px;
        overflow-y: auto;
        background: var(--surface);
        color: var(--text);
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
</style>
