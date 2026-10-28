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
export async function readChosenFile(event: Event & { currentTarget: HTMLInputElement }): Promise<string | null>
{
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    return file ? file.text() : null;
}

/** Current date and time as written in saved files. */
export function isoNow(): string
{
    return new Date().toISOString();
}
