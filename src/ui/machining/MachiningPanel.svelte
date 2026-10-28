<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import { machining } from "../state/machining.svelte";
    import { navigation } from "../state/navigation.svelte";
    import { project } from "../state/project.svelte";
    import Button from "../components/base/Button.svelte";
    import Callout from "../components/base/Callout.svelte";
    import StepSection from "../components/base/StepSection.svelte";
    import CutoutCard from "./CutoutCard.svelte";
    import DrillingCard from "./DrillingCard.svelte";
    import IsolationCard from "./IsolationCard.svelte";
    import ToolComparator from "./ToolComparator.svelte";

    // Machining operations (specification 6.4, 6.5 and 6.6), one step each, one step open at a time. The G-code is
    // written in the Machine tab, the step after the cutout.
    const t = i18n.t;

    let hasCopper = $derived(machining.copperLayers().length > 0);
    let hasTool = $derived(machining.isolationTools().length > 0);
    let hasDrills = $derived(machining.drillLayers().length > 0);
    let hasCutoutTool = $derived(machining.cutoutTools().length > 0);
    let noDrilling = $derived(project.layers.length > 0 && !hasDrills);

    /** "2 operations, 1 computed", or nothing yet. */
    function summary(operations: readonly { result: unknown }[]): string
    {
        return operations.length === 0
            ? t("steps.noOperation")
            : t("steps.operations", { count: operations.length, done: operations.filter((operation) => operation.result !== null).length });
    }

    function computed(operations: readonly { result: unknown }[]): boolean
    {
        return operations.some((operation) => operation.result !== null);
    }
</script>

<StepSection id="isolation" index={1} title={t("machining.isolation")}
    summary={summary(machining.operations)} done={computed(machining.operations)}
    open={navigation.sections.machining === "isolation"} ontoggle={() => navigation.toggleSection("machining", "isolation")}
    next={{ label: t("steps.next", { step: t("machining.drilling") }), onclick: () => navigation.openSection("machining", "drilling") }}>
    {#if !hasCopper}
        <Callout tone="help">{t("machining.empty")}</Callout>
    {:else if !hasTool}
        <Callout tone="warning">{t("machining.noTool")}</Callout>
    {:else}
        <div>
            <Button variant="primary" icon="plus" help="isolationNew" onclick={() => machining.addIsolation()}>{t("machining.add")}</Button>
        </div>
        {#each machining.operations as operation (operation.id)}
            <IsolationCard {operation} />
        {/each}
        <ToolComparator />
    {/if}
</StepSection>

<StepSection id="drilling" index={2} title={t("machining.drilling")}
    summary={noDrilling ? t("steps.noDrilling") : summary(machining.drillings)} done={computed(machining.drillings) || noDrilling}
    open={navigation.sections.machining === "drilling"} ontoggle={() => navigation.toggleSection("machining", "drilling")}
    next={{ label: t("steps.next", { step: t("machining.cutout") }), onclick: () => navigation.openSection("machining", "cutout") }}>
    {#if !hasDrills}
        <Callout tone="help">{t("machining.drillingEmpty")}</Callout>
    {:else}
        <div>
            <Button variant="primary" icon="plus" help="drillingNew" onclick={() => machining.addDrilling()}>{t("machining.drillingAdd")}</Button>
        </div>
        {#each machining.drillings as operation (operation.id)}
            <DrillingCard {operation} />
        {/each}
    {/if}
</StepSection>

<StepSection id="cutout" index={3} title={t("machining.cutout")}
    summary={summary(machining.cutouts)} done={computed(machining.cutouts)}
    open={navigation.sections.machining === "cutout"} ontoggle={() => navigation.toggleSection("machining", "cutout")}
    next={{ label: t("steps.toExport"), onclick: () => navigation.openSection("machine", "export") }}>
    {#if project.layers.length === 0}
        <Callout tone="help">{t("machining.cutoutEmpty")}</Callout>
    {:else if !hasCutoutTool}
        <Callout tone="warning">{t("machining.cutoutNoTool")}</Callout>
    {:else}
        <div>
            <Button variant="primary" icon="plus" help="cutoutNew" onclick={() => machining.addCutout()}>{t("machining.cutoutAdd")}</Button>
        </div>
        {#each machining.cutouts as operation (operation.id)}
            <CutoutCard {operation} />
        {/each}
    {/if}
</StepSection>
