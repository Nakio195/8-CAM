// Default settings of new operations, the same for every user: read from defaults.json next to the application when
// it starts (docs/architecture.md section 23). Until it is read, or when it cannot be, the built-in values are used.

import { BUILT_IN_DEFAULTS, parseAppDefaults, type AppDefaults } from "@project/index";

class DefaultsState
{
    public values: AppDefaults = $state(structuredClone(BUILT_IN_DEFAULTS) as AppDefaults);

    public async load(): Promise<void>
    {
        try
        {
            // Asked to the server each time: a value changed by the maintainer applies at the next page load
            const response = await fetch(`${import.meta.env.BASE_URL}defaults.json`, { cache: "no-cache" });
            if (!response.ok)
            {
                console.warn(`8-CAM: defaults.json not found (HTTP ${response.status}), built-in defaults used`);
                return;
            }
            const { defaults, issues } = parseAppDefaults(await response.text());
            for (const issue of issues)
            {
                console.warn(`8-CAM defaults.json, built-in value kept: ${issue}`);
            }
            this.values = defaults;
        }
        catch (error)
        {
            console.warn("8-CAM: defaults.json could not be read, built-in defaults used", error);
        }
    }
}

export const defaults = new DefaultsState();
