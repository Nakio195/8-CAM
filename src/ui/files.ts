// Files given to the user (exports) and read from the user (imports), in the browser only.

/** Saves text as a file through the browser download. */
export function downloadText(fileName: string, text: string, type = "application/json"): void
{
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

/** Text of the file chosen in a file input, which is cleared so the same file can be chosen again. */
/** Largest settings file read (machine, post-processor, tool library), bytes: they weigh a few kilobytes. */
export const MAX_SETTINGS_BYTES = 10 * 1024 * 1024;

/**
 * Text of the file chosen in a file input, which is cleared so the same file can be chosen again. A file larger than
 * maxBytes is not read (it would freeze the page): its size in megabytes is returned instead.
 */
export async function readChosenFile(event: Event & { currentTarget: HTMLInputElement }, maxBytes = MAX_SETTINGS_BYTES): Promise<{ text: string } | { tooLarge: number } | null>
{
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file)
    {
        return null;
    }
    return file.size > maxBytes ? { tooLarge: Math.round(file.size / 1048576) } : { text: await file.text() };
}

/** Current date and time as written in saved files. */
export function isoNow(): string
{
    return new Date().toISOString();
}
