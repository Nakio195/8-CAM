<script lang="ts">
    import { APP_VERSION } from "@core/index";
    import { detectLocale, LOCALES, translate, type Locale, type MessageKey } from "./i18n";

    let locale: Locale = $state(detectLocale(navigator.languages));

    function t(key: MessageKey, values: Record<string, string | number> = {}): string
    {
        return translate(locale, key, values);
    }
</script>

<main>
    <h1>{t("app.title")}</h1>
    <p>{t("app.tagline")}</p>
    <p>{t("app.status.skeleton")}</p>
    <p><small>{t("app.version", { version: APP_VERSION })}</small></p>
    <label>
        {t("app.language")}
        <select bind:value={locale}>
            {#each LOCALES as option (option)}
                <option value={option}>{option.toUpperCase()}</option>
            {/each}
        </select>
    </label>
</main>

<style>
    main
    {
        font-family: system-ui, sans-serif;
        max-width: 40rem;
        margin: 4rem auto;
        padding: 0 1rem;
        color: #4b2a46;
    }
</style>
