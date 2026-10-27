// Interface theme: follows the system unless the user forces light or dark (remembered in this browser).

export type ThemeMode = "auto" | "light" | "dark";

const STORAGE_KEY = "8cam.theme";

function storedMode(): ThemeMode
{
    try
    {
        const value = localStorage.getItem(STORAGE_KEY);
        if (value === "light" || value === "dark" || value === "auto")
        {
            return value;
        }
    }
    catch
    {
        // Storage unavailable: automatic theme
    }
    return "auto";
}

function apply(mode: ThemeMode): void
{
    if (mode === "auto")
    {
        delete document.documentElement.dataset.theme;
    }
    else
    {
        document.documentElement.dataset.theme = mode;
    }
}

class ThemeState
{
    public mode: ThemeMode = $state(storedMode());

    constructor()
    {
        apply(this.mode);
    }

    public setMode(mode: ThemeMode): void
    {
        this.mode = mode;
        apply(mode);
        try
        {
            localStorage.setItem(STORAGE_KEY, mode);
        }
        catch
        {
            // Not remembered, nothing else to do
        }
    }
}

export const theme = new ThemeState();
