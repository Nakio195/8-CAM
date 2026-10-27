<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import Icon from "./Icon.svelte";

    let { onOpen, onExample }: { onOpen: () => void; onExample: () => void } = $props();

    const t = i18n.t;
</script>

<div class="empty">
    <div class="card">
        <Icon name="board" size={48} />
        <h2>{t("empty.title")}</h2>
        <p>{t("empty.body")}</p>
        <div class="actions">
            <button class="primary" type="button" title={t("header.openHint")} onclick={onOpen}>
                <Icon name="open" />
                {t("header.open")}
            </button>
            <button class="secondary" type="button" title={t("header.exampleHint")} onclick={onExample}>
                <Icon name="board" />
                {t("header.example")}
            </button>
        </div>
        <p class="formats">{t("empty.formats")}</p>
    </div>
</div>

<style>
    .empty
    {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        pointer-events: none;
    }

    .card
    {
        max-width: 460px;
        padding: 28px;
        border-radius: 12px;
        background: rgba(42, 23, 39, 0.94);
        color: #f1ecf0;
        text-align: center;
        pointer-events: auto;
    }

    h2
    {
        margin: 8px 0;
        font-family: var(--font-title);
        font-size: 28px;
        font-weight: 400;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    p
    {
        margin: 8px 0;
        line-height: 1.45;
    }

    .formats
    {
        font-size: 12px;
        color: #bfaebb;
    }

    .actions
    {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        margin: 16px 0 8px;
    }

    button
    {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: var(--radius);
        border: 2px solid transparent;
        font-weight: 700;
        cursor: pointer;
    }

    .primary
    {
        background: var(--brand-rouge);
        color: #ffffff;
    }

    .secondary
    {
        background: transparent;
        border-color: var(--brand-rose);
        color: var(--brand-rose);
    }
</style>
