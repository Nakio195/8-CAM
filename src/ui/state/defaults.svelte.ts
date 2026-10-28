// Defaults of new operations chosen by the user, remembered in this browser (like the theme). Without them, new
// operations take the built-in settings.

import { parseDefaults, pickDefaults, type DefaultsKind, type OperationDefaults } from "@project/index";

const STORAGE_KEY = "8cam.defaults";

function stored(): OperationDefaults
{
    try
    {
        return parseDefaults(localStorage.getItem(STORAGE_KEY));
    }
    catch
    {
        // Storage unavailable: built-in settings
        return {};
    }
}

class DefaultsState
{
    public values: OperationDefaults = $state(stored());

    /** Keeps the settings of an operation as the defaults of its kind. */
    public save(kind: DefaultsKind, values: object): void
    {
        this.values = { ...this.values, [kind]: pickDefaults(kind, values) };
        this.write();
    }

    /** Back to the built-in settings for this kind. */
    public reset(kind: DefaultsKind): void
    {
        this.values = Object.fromEntries(Object.entries(this.values).filter(([key]) => key !== kind));
        this.write();
    }

    private write(): void
    {
        try
        {
            localStorage.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(this.values)));
        }
        catch
        {
            // Storage unavailable: the defaults last until the page is closed
        }
    }
}

export const defaults = new DefaultsState();
