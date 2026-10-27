import fr from "./fr.json";
import en from "./en.json";

export type Locale = "fr" | "en";
export type MessageKey = keyof typeof fr;

// English must define exactly the same keys as French (checked at compile time)
const english: Record<MessageKey, string> = en;

const CATALOGS: Record<Locale, Record<MessageKey, string>> = {
    fr,
    en: english
};

export const LOCALES: readonly Locale[] = ["fr", "en"];

export function isMessageKey(key: string): key is MessageKey
{
    return key in fr;
}

/**
 * Returns the message for a key, replacing {name} placeholders with the given values.
 */
export function translate(locale: Locale, key: MessageKey, values: Record<string, string | number> = {}): string
{
    const template = CATALOGS[locale][key];
    return template.replace(/\{(\w+)\}/g, (match: string, name: string) =>
    {
        const value = values[name];
        return value === undefined ? match : String(value);
    });
}

/**
 * Picks the initial locale from the browser languages, French by default.
 */
export function detectLocale(languages: readonly string[]): Locale
{
    for (const language of languages)
    {
        const prefix = language.slice(0, 2).toLowerCase();
        if (prefix === "fr" || prefix === "en")
        {
            return prefix;
        }
    }
    return "fr";
}

/** Formats a number with the locale's decimal separator. */
export function formatNumber(locale: Locale, value: number, decimals: number): string
{
    return value.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}
