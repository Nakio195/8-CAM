<script lang="ts">
    import { untrack } from "svelte";
    import { validateMachine, type MachineProfile } from "@post/index";
    import { help } from "../help";
    import type { MessageKey } from "../i18n";
    import { i18n } from "../state/i18n.svelte";
    import { machineState } from "../state/machine.svelte";
    import NumberField from "../components/base/NumberField.svelte";
    import Callout from "../components/base/Callout.svelte";

    // Fields of the active machine (docs/architecture.md section 5.1). The editor is keyed by machine: its fields are
    // seeded once and pushed back on every valid change.
    let { machine }: { machine: MachineProfile } = $props();

    const t = i18n.t;
    let draft = $state(untrack(() => ({ ...machine })));
    let issues = $derived(validateMachine(draft));

    $effect(() =>
    {
        const next = { ...draft };
        if (validateMachine(next).length === 0 && JSON.stringify(next) !== JSON.stringify(untrack(() => machine)))
        {
            untrack(() => machineState.saveMachine(next));
        }
    });

    // machineX / Y / Z: the travel drawn by the machine illustration; travelZ is the tool travel height of the Z heights drawing
    let helpValues = $derived({ machineX: draft.travelX, machineY: draft.travelY, machineZ: draft.travelZ, safeZ: draft.safeZ, travelZ: 2 });
    const id = (field: string): string => `machine-${field}`;
    const helpLabel = (title: MessageKey): string => `${t("header.help")} : ${t(title)}`;
</script>

<div class="editor">
    <label class="field">
        <span>{t("machine.name")}</span>
        <input type="text" bind:value={draft.name} use:help={"machineName"} />
    </label>
    <div class="grid three">
        <NumberField id={id("travel-x")} label={t("machine.travelX")} help="machineTravel" unit="mm" step={1} min={1} bind:value={draft.travelX}
            helpLabel={helpLabel("help.machineTravel.title")} {helpValues} />
        <NumberField id={id("travel-y")} label={t("machine.travelY")} help="machineTravel" unit="mm" step={1} min={1} bind:value={draft.travelY}
            helpLabel={helpLabel("help.machineTravel.title")} {helpValues} />
        <NumberField id={id("travel-z")} label={t("machine.travelZ")} help="machineTravel" unit="mm" step={1} min={1} bind:value={draft.travelZ}
            helpLabel={helpLabel("help.machineTravel.title")} {helpValues} />
    </div>
    <div class="grid">
        <NumberField id={id("safe-z")} label={t("machine.safeZ")} help="safeZ" unit="mm" step={0.5} min={0.5} bind:value={draft.safeZ}
            helpLabel={helpLabel("help.safeZ.title")} {helpValues} />
        <NumberField id={id("spindle")} label={t("machine.maxSpindle")} help="maxSpindleSpeed" unit={t("unit.rpm")} step={100} min={1}
            bind:value={draft.maxSpindleSpeed} helpLabel={helpLabel("help.maxSpindleSpeed.title")} />
        <NumberField id={id("min-spindle")} label={t("machine.minSpindle")} help="minSpindleSpeed" unit={t("unit.rpm")} step={100} min={0}
            bind:value={draft.minSpindleSpeed} helpLabel={helpLabel("help.minSpindleSpeed.title")} />
        <NumberField id={id("feed-xy")} label={t("machine.maxFeedXY")} help="maxFeed" unit="mm/min" step={10} min={1} bind:value={draft.maxFeedXY}
            helpLabel={helpLabel("help.maxFeed.title")} />
        <NumberField id={id("feed-z")} label={t("machine.maxFeedZ")} help="maxFeed" unit="mm/min" step={10} min={1} bind:value={draft.maxFeedZ}
            helpLabel={helpLabel("help.maxFeed.title")} />
        <NumberField id={id("rapid")} label={t("machine.rapidFeed")} help="rapidFeed" unit="mm/min" step={10} min={1} bind:value={draft.rapidFeed}
            helpLabel={helpLabel("help.rapidFeed.title")} />
    </div>
    {#each issues as issue (issue.code + issue.field)}
        <Callout tone="error">{t(`machine.issue.${issue.code}`)}</Callout>
    {/each}
</div>

<style>
    .editor
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .field
    {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-weight: 600;
    }

    input[type="text"]
    {
        padding: 6px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        font-weight: 400;
    }

    .grid
    {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    .grid.three
    {
        grid-template-columns: repeat(3, 1fr);
    }
</style>
