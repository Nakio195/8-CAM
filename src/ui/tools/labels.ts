// Display labels of tools: a user name, or an automatic one built from the parameters in the user's language.

import type { Tool } from "@cam/tools/index";
import type { MessageKey } from "../i18n";

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;
type FormatNumber = (value: number, decimals: number) => string;

/** Fewest decimals that show the value exactly, up to 3 (0.8 → "0,8", 3.175 → "3,175"). */
export function decimalsFor(value: number): number
{
    for (let decimals = 0; decimals < 3; decimals++)
    {
        if (Math.abs(Math.round(value * 10 ** decimals) - value * 10 ** decimals) < 1e-9)
        {
            return decimals;
        }
    }
    return 3;
}

export function automaticLabel(tool: Tool, t: Translate, number: FormatNumber): string
{
    const size = (value: number): string => number(value, decimalsFor(value));
    switch (tool.type)
    {
        case "vbit":
            return t("toolLabel.vbit", { angle: size(tool.tipAngle), tip: size(tool.tipDiameter) });
        case "drill":
            return t("toolLabel.drill", { diameter: size(tool.diameter) });
        case "endmill":
            // Built-in corn cob mills keep their own name; copies of them are plain end mills
            return t(tool.builtIn && tool.id.startsWith("cornmill") ? "toolLabel.cornmill" : "toolLabel.endmill",
                { diameter: size(tool.diameter) });
    }
}

export function toolLabel(tool: Tool, t: Translate, number: FormatNumber): string
{
    return tool.name.trim() || automaticLabel(tool, t, number);
}
