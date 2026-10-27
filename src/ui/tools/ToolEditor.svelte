<script lang="ts">
    import { DEFAULT_BOARD_THICKNESS } from "@cam/analysis/index";
    import { validateTool, type Tool, type ToolType, type ToolUsage } from "@cam/tools/index";
    import { help } from "../help";
    import { i18n } from "../state/i18n.svelte";
    import Button from "../components/base/Button.svelte";
    import Callout from "../components/base/Callout.svelte";
    import NumberField from "../components/base/NumberField.svelte";
    import DepthPasses from "../illustrations/DepthPasses.svelte";
    import ToolProfile from "../illustrations/ToolProfile.svelte";
    import VbitSection from "../illustrations/VbitSection.svelte";
    import ZHeights from "../illustrations/ZHeights.svelte";
    import { automaticLabel } from "./labels";

    // Tool card editor: every parameter with its HelpTip, and the drawings following the values typed (6.11, 6.12)
    let { tool = $bindable(null), isNew = false, thickness = DEFAULT_BOARD_THICKNESS, onSave }: {
        tool: Tool | null;
        isNew?: boolean;
        thickness?: number;
        onSave: (tool: Tool) => void;
    } = $props();

    const t = i18n.t;
    const TYPES: ToolType[] = ["vbit", "endmill", "drill"];
    const USAGES: ToolUsage[] = ["isolation", "drilling", "holeMilling", "cutout"];
    // Tool type as a number for the illustrations of the help (see illustrations/registry.ts)
    const TYPE_INDEX: Record<ToolType, number> = { endmill: 0, vbit: 1, drill: 2 };

    let dialog: HTMLDialogElement | undefined = $state();
    let draft = $state<Tool | null>(null);

    $effect(() =>
    {
        if (!dialog)
        {
            return;
        }
        if (tool && !dialog.open)
        {
            draft = { ...tool, usages: [...tool.usages] };
            dialog.showModal();
        }
        else if (!tool && dialog.open)
        {
            dialog.close();
        }
    });

    let issues = $derived(draft ? validateTool(draft) : []);
    let values: Record<string, number> = $derived(draft
        ? {
            toolType: TYPE_INDEX[draft.type],
            diameter: draft.diameter,
            tipDiameter: draft.tipDiameter,
            tipAngle: draft.tipAngle,
            cutDepth: draft.cutDepth,
            depthPerPass: draft.depthPerPass,
            travelZ: draft.travelZ,
            safeZ: draft.safeZ,
            thickness
        }
        : ({} as Record<string, number>));

    function helpLabel(topic: string): string
    {
        return `${t("header.help")} : ${t(`help.${topic}.title` as Parameters<typeof t>[0])}`;
    }

    function toggleUsage(usage: ToolUsage, checked: boolean): void
    {
        if (draft)
        {
            draft.usages = checked ? [...draft.usages, usage] : draft.usages.filter((entry) => entry !== usage);
        }
    }

    function save(): void
    {
        if (draft && issues.length === 0)
        {
            onSave({ ...draft, name: draft.name.trim() });
            tool = null;
        }
    }
</script>

<dialog bind:this={dialog} aria-labelledby="tool-editor-title" onclose={() => (tool = null)}>
    {#if draft}
        <form method="dialog" onsubmit={(event) => { event.preventDefault(); save(); }}>
            <h2 id="tool-editor-title">{t(isNew ? "editor.titleNew" : "editor.titleEdit")}</h2>
            <div class="layout">
                <div class="fields">
                    <label class="text-field">
                        <span>{t("editor.name")}</span>
                        <input type="text" bind:value={draft.name} use:help={"toolName"}
                            placeholder={t("editor.namePlaceholder", { label: automaticLabel(draft, t, i18n.number) })} />
                    </label>
                    <label class="text-field">
                        <span>{t("editor.type")}</span>
                        <select bind:value={draft.type} use:help={"toolType"}>
                            {#each TYPES as type (type)}
                                <option value={type}>{t(`toolType.${type}`)}</option>
                            {/each}
                        </select>
                    </label>

                    <h3>{t("editor.geometry")}</h3>
                    <div class="grid">
                        <NumberField id="tool-diameter" label={t("help.diameter.title")} help="diameter" unit="mm" step={0.01} min={0.01}
                            bind:value={draft.diameter} helpLabel={helpLabel("diameter")} helpValues={values} />
                        {#if draft.type === "vbit"}
                            <NumberField id="tool-tip" label={t("help.tipDiameter.title")} help="tipDiameter" unit="mm" step={0.01} min={0}
                                bind:value={draft.tipDiameter} helpLabel={helpLabel("tipDiameter")} helpValues={values} />
                            <NumberField id="tool-angle" label={t("help.tipAngle.title")} help="tipAngle" unit="°" step={1} min={1} max={179}
                                bind:value={draft.tipAngle} helpLabel={helpLabel("tipAngle")} helpValues={values} />
                        {/if}
                    </div>

                    <h3>{t("editor.cutting")}</h3>
                    <div class="grid">
                        <NumberField id="tool-depth" label={t("help.cutDepth.title")} help="cutDepth" unit="mm" step={0.01} min={0.001}
                            bind:value={draft.cutDepth} helpLabel={helpLabel("cutDepth")} helpValues={values} />
                        <NumberField id="tool-per-pass" label={t("help.depthPerPass.title")} help="depthPerPass" unit="mm" step={0.01} min={0.001}
                            bind:value={draft.depthPerPass} helpLabel={helpLabel("depthPerPass")} helpValues={values} />
                        {#if draft.type !== "drill"}
                            <NumberField id="tool-feed-xy" label={t("help.feedXY.title")} help="feedXY" unit="mm/min" step={1} min={1}
                                bind:value={draft.feedXY} helpLabel={helpLabel("feedXY")} />
                        {/if}
                        <NumberField id="tool-feed-z" label={t("help.feedZ.title")} help="feedZ" unit="mm/min" step={1} min={1}
                            bind:value={draft.feedZ} helpLabel={helpLabel("feedZ")} />
                        <NumberField id="tool-rpm" label={t("help.spindleSpeed.title")} help="spindleSpeed" unit={t("unit.rpm")} step={100} min={1}
                            bind:value={draft.spindleSpeed} helpLabel={helpLabel("spindleSpeed")} />
                    </div>

                    <h3>{t("editor.heights")}</h3>
                    <div class="grid">
                        <NumberField id="tool-travel" label={t("help.travelZ.title")} help="travelZ" unit="mm" step={0.1} min={0.1}
                            bind:value={draft.travelZ} helpLabel={helpLabel("travelZ")} helpValues={values} />
                        <NumberField id="tool-safe" label={t("help.safeZ.title")} help="safeZ" unit="mm" step={0.5} min={0.1}
                            bind:value={draft.safeZ} helpLabel={helpLabel("safeZ")} helpValues={values} />
                    </div>

                    <fieldset use:help={"toolUsage"}>
                        <legend>{t("editor.usages")}</legend>
                        {#each USAGES as usage (usage)}
                            <label class="check">
                                <input type="checkbox" checked={draft.usages.includes(usage)}
                                    onchange={(event) => toggleUsage(usage, event.currentTarget.checked)} />
                                {t(`toolUsage.${usage}`)}
                            </label>
                        {/each}
                    </fieldset>

                    <label class="text-field">
                        <span>{t("editor.notes")}</span>
                        <textarea rows="2" bind:value={draft.notes} use:help={"toolNotes"}></textarea>
                    </label>
                </div>

                <div class="figures" aria-live="polite">
                    <ToolProfile type={draft.type} diameter={draft.diameter} tipDiameter={draft.tipDiameter} tipAngle={draft.tipAngle} />
                    {#if draft.type === "vbit"}
                        <VbitSection tipDiameter={draft.tipDiameter} tipAngle={draft.tipAngle} depth={draft.cutDepth} />
                    {/if}
                    <DepthPasses depth={draft.cutDepth} depthPerPass={draft.depthPerPass} {thickness} />
                    <ZHeights travelZ={draft.travelZ} safeZ={draft.safeZ} depth={draft.cutDepth} />
                </div>
            </div>

            {#if issues.length > 0}
                <Callout tone="error" title={t("editor.issues")}>
                    <ul class="issues">
                        {#each issues as issue (issue.code)}
                            <li>{t(`issue.${issue.code}`)}</li>
                        {/each}
                    </ul>
                </Callout>
            {/if}

            <div class="actions">
                <Button variant="ghost" help="toolCancel" onclick={() => (tool = null)}>{t("editor.cancel")}</Button>
                <Button variant="primary" type="submit" help="toolSave" disabled={issues.length > 0}>{t("editor.save")}</Button>
            </div>
        </form>
    {/if}
</dialog>

<style>
    dialog
    {
        width: min(820px, calc(100vw - 24px));
        max-height: calc(100vh - 24px);
        padding: 0;
        border: none;
        border-radius: var(--radius-large);
        background: var(--surface);
        color: var(--text);
        box-shadow: var(--shadow);
    }

    dialog::backdrop
    {
        background: rgba(31, 16, 28, 0.6);
    }

    form
    {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 20px 24px;
    }

    h2
    {
        margin: 0;
        font-family: var(--font-title);
        font-size: 26px;
        font-weight: 400;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }

    h3
    {
        margin: 10px 0 4px;
        font-family: var(--font-title);
        font-size: 17px;
        font-weight: 400;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        border-bottom: 2px solid var(--brand-rose);
    }

    .layout
    {
        display: grid;
        grid-template-columns: 1fr 280px;
        gap: 20px;
    }

    .fields
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }

    .grid
    {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 10px;
    }

    .text-field
    {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-weight: 600;
    }

    .text-field input,
    .text-field select,
    .text-field textarea
    {
        padding: 6px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        font-weight: 400;
    }

    fieldset
    {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 16px;
        margin: 8px 0 0;
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
    }

    legend
    {
        font-weight: 600;
    }

    .check
    {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .figures
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
        border-radius: var(--radius);
        background: var(--surface-panel);
    }

    .issues
    {
        margin: 4px 0 0;
        padding-left: 18px;
    }

    .actions
    {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    @media (max-width: 760px)
    {
        .layout
        {
            grid-template-columns: 1fr;
        }
    }
</style>
