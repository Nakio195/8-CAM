<script lang="ts">
    import { onMount } from "svelte";
    import { checkGcode, checkJob, MACHINE_PRESETS, sampleJob, writeGcode, type SampleTools } from "@post/index";
    import { APP_VERSION } from "@core/index";
    import { downloadText, readChosenFile } from "../files";
    import { help } from "../help";
    import { isMessageKey, type MessageKey } from "../i18n";
    import { i18n } from "../state/i18n.svelte";
    import { machineState } from "../state/machine.svelte";
    import { machining } from "../state/machining.svelte";
    import { toolLibrary } from "../state/tools.svelte";
    import Button from "../components/base/Button.svelte";
    import Callout from "../components/base/Callout.svelte";
    import StepSection from "../components/base/StepSection.svelte";
    import ExportPanel from "../machining/ExportPanel.svelte";
    import { formatDuration } from "../machining/format";
    import SimulationPanel from "../machining/SimulationPanel.svelte";
    import { exportState } from "../state/export.svelte";
    import { navigation } from "../state/navigation.svelte";
    import { toolLabel } from "../tools/labels";
    import GcodePreview from "./GcodePreview.svelte";
    import MachineEditor from "./MachineEditor.svelte";
    import PostProfileEditor from "./PostProfileEditor.svelte";

    // Machine tab (docs/architecture.md section 5.1, specification 6.8 and 6.9), one step open at a time: the machine
    // profiles; the post-processor of the active machine with its editor and a live preview of the G-code it writes for
    // a sample board; the G-code of the board; its simulation.
    const t = i18n.t;

    let message = $state<{ tone: "success" | "error"; text: string } | null>(null);
    let machineInput: HTMLInputElement;
    let profileInput: HTMLInputElement;

    onMount(() =>
    {
        void machineState.load();
        void toolLibrary.load();
    });

    let machine = $derived(machineState.active);
    let profile = $derived(machineState.activeProfile);

    /** Sample job with the tools the user would pick: the recommended ones of the library. */
    let tools = $derived.by((): SampleTools | null =>
    {
        const isolation = machining.isolationTools()[0];
        const drill = toolLibrary.tools.filter((tool) => tool.type === "drill").sort((a, b) => a.diameter - b.diameter)[0];
        const cutout = machining.cutoutTools()[0];
        if (!isolation || !drill || !cutout)
        {
            return null;
        }
        const entry = (tool: typeof isolation): { tool: typeof isolation; label: string } => ({ tool: $state.snapshot(tool), label: toolLabel(tool, t, i18n.number) });
        return { isolation: entry(isolation), drill: entry(drill), cutout: entry(cutout) };
    });
    // The date is fixed while the tab is open: the preview changes only with the profile
    const previewDate = new Date();
    let job = $derived(tools ? sampleJob(tools, previewDate, APP_VERSION) : null);
    let output = $derived(job ? writeGcode(job, profile, machine) : null);
    let jobIssues = $derived(job ? checkJob(job, machine) : []);
    let textIssues = $derived(job && output
        ? checkGcode(output.text, Math.min(...job.operations.map((operation) => operation.tool.travelZ)),
            Math.max(...job.operations.map((operation) => operation.tool.safeZ)))
        : []);

    let exported = $derived(exportState.output !== null && !exportState.stale);
    let exportSummary = $derived(exportState.output
        ? t(exportState.stale ? "steps.stale" : "steps.files", { count: exportState.output.files.length })
        : t("steps.toDo"));

    function addMachine(): void
    {
        machineState.addMachine(t("machine.newName"));
    }

    function addPreset(id: string): void
    {
        const preset = MACHINE_PRESETS.find((entry) => entry.id === id);
        if (preset)
        {
            machineState.addPreset(preset);
            message = { tone: "success", text: t("machine.presetAdded", { name: preset.name }) };
        }
    }

    function removeMachine(): void
    {
        if (window.confirm(t("machine.removeConfirm", { name: machine.name })))
        {
            machineState.removeMachine(machine.id);
        }
    }

    async function importMachine(event: Event & { currentTarget: HTMLInputElement }): Promise<void>
    {
        const text = await readChosenFile(event);
        if (text === null)
        {
            return;
        }
        const result = machineState.importMachine(text);
        message = "machine" in result
            ? { tone: "success", text: t("machine.imported", { name: result.machine.name }) }
            : { tone: "error", text: t("machine.importFailed") };
    }

    async function importProfile(event: Event & { currentTarget: HTMLInputElement }): Promise<void>
    {
        const text = await readChosenFile(event);
        if (text === null)
        {
            return;
        }
        const result = machineState.importProfile(text);
        message = "profile" in result
            ? { tone: "success", text: t("post.imported", { name: result.profile.name }) }
            : { tone: "error", text: t("post.importFailed", { problems: result.issues.map((issue) => t(`post.issue.${issue.code}`)).join(" ") }) };
    }

    function exportProfile(): void
    {
        const text = machineState.exportProfile(profile.id);
        if (text)
        {
            downloadText(`${profile.name.replace(/[^\w.-]+/g, "_")}.8cam-post.json`, text);
        }
    }

    function removeProfile(): void
    {
        if (window.confirm(t("post.removeConfirm", { name: profile.name })))
        {
            machineState.removeProfile(profile.id);
        }
    }
</script>

<StepSection id="machine" index={1} title={t("machine.title")} summary={machine.name}
    open={navigation.sections.machine === "machine"} ontoggle={() => navigation.toggleSection("machine", "machine")}
    next={{ label: t("steps.next", { step: t("post.title") }), onclick: () => navigation.openSection("machine", "post") }}>
    {#if !machineState.persistent}
        <Callout tone="warning">{t("machine.notPersistent")}</Callout>
    {/if}
    {#if message}
        <Callout tone={message.tone}>{message.text}</Callout>
    {/if}
    <label class="field">
        <span>{t("machine.active")}</span>
        <select value={machine.id} use:help={""} onchange={(event) => machineState.select(event.currentTarget.value)}>
            {#each machineState.machines as entry (entry.id)}
                <option value={entry.id}>{entry.name}</option>
            {/each}
        </select>
    </label>
    <div class="actions">
        <Button variant="secondary" icon="plus" help="" onclick={addMachine}>{t("machine.add")}</Button>
        <select class="preset" aria-label={t("machine.preset")} use:help={"machinePreset"} value=""
            onchange={(event) => { addPreset(event.currentTarget.value); event.currentTarget.value = ""; }}>
            <option value="" disabled>{t("machine.preset")}</option>
            {#each MACHINE_PRESETS as preset (preset.id)}
                <option value={preset.id}>{preset.name}</option>
            {/each}
        </select>
        <Button variant="ghost" icon="upload" help="" onclick={() => machineInput.click()}>{t("machine.import")}</Button>
        <Button variant="ghost" icon="download" help=""
            onclick={() => downloadText(`${machine.name.replace(/[^\w.-]+/g, "_")}.8cam-machine.json`, machineState.exportMachine())}>
            {t("machine.export")}
        </Button>
        {#if machineState.machines.length > 1}
            <Button variant="ghost" icon="remove" help="" onclick={removeMachine}>{t("machine.remove")}</Button>
        {/if}
        <input bind:this={machineInput} class="visually-hidden" type="file" accept=".json,application/json" tabindex="-1"
            aria-hidden="true" onchange={importMachine} />
    </div>
    {#key machine.id}
        <MachineEditor {machine} />
    {/key}
</StepSection>

<StepSection id="post" index={2} title={t("post.title")} summary={profile.name}
    open={navigation.sections.machine === "post"} ontoggle={() => navigation.toggleSection("machine", "post")}
    next={{ label: t("steps.next", { step: t("export.title") }), onclick: () => navigation.openSection("machine", "export") }}>
    <label class="field">
        <span>{t("post.profile")}</span>
        <select value={profile.id} use:help={"postProcessor"}
            onchange={(event) => machineState.saveMachine({ ...machine, postProfileId: event.currentTarget.value })}>
            {#each machineState.profiles as entry (entry.id)}
                <option value={entry.id}>{entry.name}{entry.builtIn ? "" : ` (${t("post.own")})`}</option>
            {/each}
        </select>
    </label>
    <!-- Built-in profiles are described in the user's language; the user's own keep the description they were given -->
    <p class="description">{profile.builtIn && isMessageKey(`post.description.${profile.id}`) ? t(`post.description.${profile.id}` as MessageKey) : profile.description}</p>
    <div class="actions">
        <Button variant="secondary" icon="copy" help="postCopy"
            onclick={() => machineState.copyProfile(profile.id, t("post.copyName", { name: profile.name }))}>{t("post.copy")}</Button>
        <Button variant="ghost" icon="upload" help="" onclick={() => profileInput.click()}>{t("post.import")}</Button>
        <Button variant="ghost" icon="download" help="" onclick={exportProfile}>{t("post.export")}</Button>
        {#if !profile.builtIn}
            <Button variant="ghost" icon="remove" help="" onclick={removeProfile}>{t("post.remove")}</Button>
        {/if}
        <input bind:this={profileInput} class="visually-hidden" type="file" accept=".json,application/json" tabindex="-1"
            aria-hidden="true" onchange={importProfile} />
    </div>
    {#if profile.builtIn}
        <Callout tone="info">{t("post.builtInNote")}</Callout>
    {:else}
        {#key profile.id}
            <PostProfileEditor {profile} />
        {/key}
    {/if}
    <h3 use:help={"postPreview"}>{t("post.preview")}</h3>
    {#if output}
        {#each output.forbidden as entry (entry.line)}
            <Callout tone="error">{t("post.forbiddenFound", { word: entry.word, line: entry.line })}</Callout>
        {/each}
        {#each textIssues as issue (issue.index)}
            <Callout tone="error">{t(`post.safety.${issue.reason}`)}</Callout>
        {/each}
        {#each jobIssues as issue (issue.code + String(issue.operation))}
            <Callout tone={issue.severity === "error" ? "error" : "warning"}>{t(`post.job.${issue.code}`)}</Callout>
        {/each}
        <p class="note">{t("post.previewNote")}</p>
        <GcodePreview text={output.text} label={t("post.preview")} />
    {:else}
        <Callout tone="warning">{t("post.previewNoTools")}</Callout>
    {/if}
</StepSection>

<StepSection id="export" index={3} title={t("export.title")} summary={exportSummary} done={exported}
    open={navigation.sections.machine === "export"} ontoggle={() => navigation.toggleSection("machine", "export")}
    next={{ label: t("steps.next", { step: t("export.simulation") }), onclick: () => navigation.openSection("machine", "simulation") }}>
    <ExportPanel />
</StepSection>

<StepSection id="simulation" index={4} title={t("export.simulation")}
    summary={exportState.output ? formatDuration(exportState.duration, t) : t("steps.afterExport")}
    open={navigation.sections.machine === "simulation"} ontoggle={() => navigation.toggleSection("machine", "simulation")}>
    <SimulationPanel />
</StepSection>

<style>
    h3
    {
        margin: 6px 0 0;
        font-family: var(--font-title);
        font-size: 16px;
        font-weight: 400;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .field
    {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-weight: 600;
    }

    select
    {
        padding: 6px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        font-weight: 400;
    }

    .preset
    {
        max-width: 180px;
    }

    .actions
    {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .description,
    .note
    {
        margin: 0;
        font-size: 12px;
        color: var(--text-muted);
    }
</style>
