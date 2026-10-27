// Display of machining quantities.

import type { MessageKey } from "../i18n";

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

/** "45 s", "12 min 05 s", "1 h 20 min". */
export function formatDuration(seconds: number, t: Translate): string
{
    const total = Math.max(0, Math.round(seconds));
    if (total < 60)
    {
        return t("duration.seconds", { seconds: total });
    }
    if (total < 3600)
    {
        return t("duration.minutes", { minutes: Math.floor(total / 60), seconds: String(total % 60).padStart(2, "0") });
    }
    return t("duration.hours", { hours: Math.floor(total / 3600), minutes: String(Math.floor((total % 3600) / 60)).padStart(2, "0") });
}
