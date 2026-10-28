<script lang="ts">
    import { APP_VERSION } from "@core/index";
    import cartoucheUrl from "../../../assets/brand/Logo-cartouche.svg";
    import patternUrl from "../../../assets/brand/habillage/logo-points.svg";
    import { i18n } from "../state/i18n.svelte";
    import Button from "./base/Button.svelte";

    // "About" screen (specification 6.13): the "8FABLAB.FR" cartouche and a two-colour brand pattern in the background
    let { open = $bindable(false) }: { open: boolean } = $props();

    const t = i18n.t;
    let dialog: HTMLDialogElement | undefined = $state();

    $effect(() =>
    {
        if (!dialog)
        {
            return;
        }
        if (open && !dialog.open)
        {
            dialog.showModal();
        }
        else if (!open && dialog.open)
        {
            dialog.close();
        }
    });
</script>

<dialog bind:this={dialog} aria-labelledby="about-title" onclose={() => (open = false)}>
    <div class="pattern" style:--pattern={`url("${patternUrl}")`} aria-hidden="true"></div>
    <div class="content">
        <img class="cartouche" src={cartoucheUrl} alt="8FABLAB.FR" />
        <h2 id="about-title">{t("about.title")}</h2>
        <p>{t("about.body")}</p>
        <p>{t("about.privacy")}</p>
        <p class="muted">{t("about.reference")}</p>
        <p class="muted">{t("app.version", { version: APP_VERSION })}</p>
        <div class="actions">
            <a class="link" href="https://8fablab.fr" target="_blank" rel="noopener noreferrer">{t("about.site")}</a>
            <Button variant="primary" help="" onclick={() => (open = false)}>{t("about.close")}</Button>
        </div>
    </div>
</dialog>

<style>
    dialog
    {
        position: relative;
        width: min(520px, calc(100vw - 32px));
        padding: 0;
        border: none;
        border-radius: var(--radius-large);
        background: var(--brand-rose-light);
        color: var(--brand-prune);
        box-shadow: var(--shadow);
        overflow: hidden;
    }

    dialog::backdrop
    {
        background: rgba(31, 16, 28, 0.6);
    }

    /* Two-colour pattern: the brand "8" with dots, in pink on the light pink background, kept away from the text
       and shown whole (the lettering of a logo is never cut) */
    .pattern
    {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 120px;
        height: calc(100% - 32px);
        background-color: var(--brand-rose);
        mask: var(--pattern) no-repeat center / contain;
        opacity: 0.7;
        pointer-events: none;
    }

    .content
    {
        position: relative;
        padding: 28px 32px 24px;
        max-width: calc(100% - 150px);
    }

    .cartouche
    {
        height: 64px;
    }

    h2
    {
        margin: 16px 0 8px;
        font-family: var(--font-title);
        font-size: 30px;
        font-weight: 400;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }

    p
    {
        margin: 8px 0;
        line-height: 1.5;
    }

    .muted
    {
        font-size: 12px;
    }

    .actions
    {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-top: 20px;
    }

    .link
    {
        color: var(--brand-prune);
        font-weight: 700;
    }
</style>
