<script lang="ts">
    import { DEFAULT_BOARD_THICKNESS, CUTOUT_EXTRA_DEPTH } from "@cam/analysis/index";
    import { passCount, toolWidth, type Tool } from "@cam/tools/index";
    import { help } from "../help";
    import { help as helpState } from "../state/help.svelte";
    import { i18n } from "../state/i18n.svelte";
    import IconButton from "../components/base/IconButton.svelte";
    import Sticker from "../components/base/Sticker.svelte";
    import ToolProfile from "../illustrations/ToolProfile.svelte";
    import { decimalsFor, toolLabel } from "./labels";

    // Illustrated tool card (specification 6.10): profile drawn from the parameters, speeds, use and limits
    let { tool, thickness = DEFAULT_BOARD_THICKNESS, onEdit, onDuplicate, onDelete }: {
        tool: Tool;
        thickness?: number;
        onEdit: () => void;
        onDuplicate: () => void;
        onDelete: () => void;
    } = $props();

    const t = i18n.t;
    const n = (value: number): string => i18n.number(value, decimalsFor(value));

    let label = $derived(toolLabel(tool, t, i18n.number));
    let width = $derived(toolWidth(tool));

    let limit = $derived.by((): string =>
    {
        if (tool.type === "vbit")
        {
            return t("tools.limitVbit", { width: i18n.number(width, 3), depth: n(tool.cutDepth) });
        }
        if (tool.type === "drill")
        {
            return t("tools.limitDrill");
        }
        if (tool.usages.includes("cutout"))
        {
            return t("tools.limitCutout", {
                passes: passCount(thickness + CUTOUT_EXTRA_DEPTH, tool.depthPerPass),
                thickness: i18n.number(thickness, 1)
            });
        }
        return tool.diameter < 1 ? t("tools.limitThin") : "";
    });
</script>

<article class="card" aria-label={label}>
    <div class="profile">
        <ToolProfile type={tool.type} diameter={tool.diameter} tipDiameter={tool.tipDiameter} tipAngle={tool.tipAngle} />
    </div>
    <div class="content">
        <h3>{label}</h3>
        <div class="stickers">
            <Sticker tone={tool.type === "vbit" ? "info" : tool.type === "drill" ? "neutral" : "accent"}
                icon={tool.type === "drill" ? "drill" : "tool"} shape="tag">{t(`toolType.${tool.type}`)}</Sticker>
            {#if tool.builtIn}
                <button class="sticker-button" type="button" use:help={"toolBuiltIn"}
                    onclick={(event) => helpState.show("toolBuiltIn", event.currentTarget, true)}>
                    <Sticker tone="warning" icon="warning">{t("tools.toValidate")}</Sticker>
                </button>
            {/if}
        </div>
        {#if tool.type !== "drill"}
            <button class="value" type="button" use:help={"toolWidth"}
                onclick={(event) => helpState.show("toolWidth", event.currentTarget, true)}>
                {t("tools.width", { width: i18n.number(width, 3) })}
            </button>
        {/if}
        <p class="value">{t("tools.depth", { depth: n(tool.cutDepth), perPass: n(tool.depthPerPass) })}</p>
        <p class="value">
            {tool.type === "drill"
                ? t("tools.drillFeeds", { feedZ: n(tool.feedZ), rpm: i18n.number(tool.spindleSpeed, 0) })
                : t("tools.feeds", { feedXY: n(tool.feedXY), feedZ: n(tool.feedZ), rpm: i18n.number(tool.spindleSpeed, 0) })}
        </p>
        <p class="usages">{tool.usages.map((usage) => t(`toolUsage.${usage}`)).join(" · ")}</p>
        {#if limit}
            <p class="limit">{limit}</p>
        {/if}
        <div class="actions">
            <IconButton icon="edit" size={16} label={t("tools.edit")} help="" onclick={onEdit} />
            <IconButton icon="copy" size={16} label={t("tools.duplicate")} help="" onclick={onDuplicate} />
            <IconButton icon="remove" size={16} label={t("tools.delete")} help="" onclick={onDelete} />
        </div>
    </div>
</article>

<style>
    .card
    {
        display: grid;
        grid-template-columns: 76px 1fr;
        gap: 8px;
        padding: 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
    }

    .profile
    {
        align-self: start;
    }

    .content
    {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
    }

    h3
    {
        margin: 0;
        font-size: 14px;
        overflow-wrap: anywhere;
    }

    .stickers
    {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin: 2px 0;
    }

    .sticker-button
    {
        padding: 0;
        border: none;
        background: none;
        cursor: help;
    }

    .value
    {
        margin: 0;
        padding: 0;
        border: none;
        background: none;
        color: var(--text);
        font-family: var(--font-mono);
        font-size: 11px;
        text-align: left;
    }

    button.value
    {
        cursor: help;
        font-weight: 700;
    }

    .usages,
    .limit
    {
        margin: 0;
        font-size: 12px;
        color: var(--text-muted);
    }

    .limit
    {
        font-style: italic;
    }

    .actions
    {
        display: flex;
        gap: 2px;
        margin-top: 2px;
    }
</style>
