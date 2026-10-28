<script lang="ts">
    import { help as helpAction } from "../../help";
    import Icon from "../Icon.svelte";

    // Numeric parameter with its unit and its help topic (specification 6.11: every parameter has a complete tooltip).
    // The help opens with the small "?" next to the label, on click only: typing in the field is not covered by it.
    let {
        label,
        help,
        value = $bindable(),
        unit,
        min,
        max,
        step = "any",
        id,
        helpLabel,
        helpValues
    }: {
        label: string;
        help: string;
        value: number;
        unit?: string;
        min?: number;
        max?: number;
        step?: number | "any";
        id: string;
        /** Accessible name of the "?" button, e.g. "Help: Diameter". */
        helpLabel: string;
        /** Values drawn by the illustration of the help topic (this field and its neighbours). */
        helpValues?: Readonly<Record<string, number>>;
    } = $props();

    let button = $derived({ topic: help, values: helpValues, trigger: "click" as const });
    let field = $derived({ topic: help, values: helpValues, trigger: "none" as const });

    let invalid = $derived(!Number.isFinite(value) || (min !== undefined && value < min) || (max !== undefined && value > max));
</script>

<div class="field" class:invalid>
    <div class="label-row">
        <label for={id}>{label}</label>
        <button class="help" type="button" aria-label={helpLabel} use:helpAction={button}>
            <Icon name="help" size={14} />
        </button>
    </div>
    <div class="input-row">
        <input {id} type="number" bind:value {min} {max} {step} aria-invalid={invalid} use:helpAction={field} />
        {#if invalid}
            <!-- Never by colour alone: an icon marks the invalid value besides the red border -->
            <span class="invalid-icon"><Icon name="warning" size={14} /></span>
        {/if}
        {#if unit}
            <span class="unit">{unit}</span>
        {/if}
    </div>
</div>

<style>
    .field
    {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
    }

    .label-row
    {
        display: flex;
        align-items: center;
        gap: 4px;
        font-weight: 600;
    }

    .help
    {
        display: inline-flex;
        padding: 2px;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--text-muted);
        cursor: help;
    }

    .input-row
    {
        display: flex;
        align-items: center;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        overflow: hidden;
    }

    .input-row:focus-within
    {
        border-color: var(--focus);
        box-shadow: 0 0 0 1px var(--focus);
    }

    input
    {
        flex: 1;
        min-width: 0;
        padding: 6px 8px;
        border: none;
        background: transparent;
        font-family: var(--font-mono);
        outline: none;
    }

    .unit
    {
        padding: 6px 8px;
        background: var(--surface-sunken);
        color: var(--text-muted);
        font-size: 12px;
    }

    .invalid .input-row
    {
        border-color: var(--error-accent);
    }

    .invalid-icon
    {
        display: inline-flex;
        padding: 0 6px;
        color: var(--error-accent);
    }
</style>
