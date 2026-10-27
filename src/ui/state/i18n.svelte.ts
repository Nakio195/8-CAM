// Current language, shared by all components.

import { detectLocale, formatNumber, translate, type Locale, type MessageKey } from "../i18n";

const STORAGE_KEY = "8cam.locale";

function initialLocale(): Locale
{
    try
    {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === "fr" || stored === "en")
        {
            return stored;
        }
    }
    catch
    {
        // Storage can be unavailable (private mode): fall back to the browser language
    }
    return detectLocale(typeof navigator === "undefined" ? [] : navigator.languages);
}

class I18nState
{
    public locale: Locale = $state(initialLocale());

    public setLocale(locale: Locale): void
    {
        this.locale = locale;
        document.documentElement.lang = locale;
        try
        {
            localStorage.setItem(STORAGE_KEY, locale);
        }
        catch
        {
            // Not remembered, nothing else to do
        }
    }

    public t = (key: MessageKey, values: Record<string, string | number> = {}): string =>
    {
        return translate(this.locale, key, values);
    };

    public number = (value: number, decimals: number): string =>
    {
        return formatNumber(this.locale, value, decimals);
    };
}

export const i18n = new I18nState();
