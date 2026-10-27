<script lang="ts">
    import { i18n } from "../state/i18n.svelte";
    import { machining } from "../state/machining.svelte";
    import Button from "../components/base/Button.svelte";
    import Callout from "../components/base/Callout.svelte";
    import IsolationCard from "./IsolationCard.svelte";
    import ToolComparator from "./ToolComparator.svelte";

    // Machining operations (specification 6.4 and 6.9); drilling and cutout join them in J7 and J8
    const t = i18n.t;

    let hasCopper = $derived(machining.copperLayers().length > 0);
    let hasTool = $derived(machining.isolationTools().length > 0);
</script>

<section class="panel" aria-labelledby="machining-title">
    <h2 id="machining-title">{t("machining.isolation")}</h2>
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
</section>

<style>
    .panel
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
    }

    h2
    {
        margin: 0;
        font-family: var(--font-title);
        font-size: 20px;
        font-weight: 400;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
</style>
