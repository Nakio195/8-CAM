<script lang="ts">
    import { sameAsDefaults, type DefaultsKind } from "@project/index";
    import { defaults } from "../state/defaults.svelte";
    import { i18n } from "../state/i18n.svelte";
    import Button from "../components/base/Button.svelte";
    import Icon from "../components/Icon.svelte";

    // Bottom of an operation card: keeps its settings as the defaults of the next operations of its kind, or goes back
    // to the built-in settings.
    let { kind, values }: { kind: DefaultsKind; values: object } = $props();

    const t = i18n.t;

    let custom = $derived(defaults.values[kind] !== undefined);
    let same = $derived(sameAsDefaults(kind, values, defaults.values));
</script>

<div class="defaults">
    {#if same}
        <span class="note"><Icon name="check" size={14} />{t("defaults.current")}</span>
    {:else}
        <Button variant="ghost" icon="save" help="operationDefaults" onclick={() => defaults.save(kind, values)}>{t("defaults.save")}</Button>
    {/if}
    {#if custom}
        <Button variant="ghost" icon="reset" help="operationDefaultsReset" onclick={() => defaults.reset(kind)}>{t("defaults.reset")}</Button>
    {/if}
</div>

<style>
    .defaults
    {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        padding-top: 6px;
        border-top: 1px dashed var(--border);
    }

    .note
    {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--text-muted);
    }
</style>
