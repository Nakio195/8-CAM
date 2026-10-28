<script lang="ts">
    import type { Component } from "svelte";
    import { i18n } from "../state/i18n.svelte";
    import { exportState } from "../state/export.svelte";
    import { machining } from "../state/machining.svelte";
    import { navigation, type SidebarTab } from "../state/navigation.svelte";
    import { project } from "../state/project.svelte";
    import Button from "../components/base/Button.svelte";
    import Icon from "../components/Icon.svelte";
    import CutoutTabs from "../illustrations/CutoutTabs.svelte";
    import DrillCycle from "../illustrations/DrillCycle.svelte";
    import IsolationPasses from "../illustrations/IsolationPasses.svelte";
    import NonIsolated from "../illustrations/NonIsolated.svelte";
    import OriginMirror from "../illustrations/OriginMirror.svelte";
    import ToolProfile from "../illustrations/ToolProfile.svelte";
    import ZHeights from "../illustrations/ZHeights.svelte";

    // "Ma première carte" (specification 6.11): the whole path from the files to the machine, step by step, on the
    // example board or the user's own. Each step says whether it is done (read from the project) and has a button doing
    // it, or opening the place where it is done.
    const t = i18n.t;

    type StepId = "import" | "analysis" | "tools" | "isolation" | "drilling" | "cutout" | "export" | "machine";

    interface Step
    {
        id: StepId;
        done: boolean;
        /** Skipped steps (no drill file) count as done but say so. */
        skipped?: boolean;
        action: (() => void) | null;
        figure: { component: Component<Record<string, unknown>>; props: Record<string, unknown> } | null;
    }

    function as<Props extends Record<string, unknown>>(component: Component<Props>): Component<Record<string, unknown>>
    {
        return component as unknown as Component<Record<string, unknown>>;
    }

    function goTo(tab: SidebarTab, then?: () => void): () => void
    {
        return () =>
        {
            navigation.open(tab);
            then?.();
        };
    }

    /** Opens the step of the Machining or Machine tab where the guide step is done. */
    function goToStep(open: () => void, then?: () => void): () => void
    {
        return () =>
        {
            open();
            then?.();
        };
    }

    let hasBoard = $derived(project.layers.length > 0);
    let hasDrills = $derived(machining.drillLayers().length > 0);
    let steps = $derived<Step[]>([
        {
            id: "import",
            done: hasBoard,
            action: hasBoard ? goTo("project") : () => void project.loadExample(),
            figure: null
        },
        {
            id: "analysis",
            done: hasBoard && navigation.visited.analysis === true,
            action: goTo("analysis"),
            figure: { component: as(NonIsolated), props: { gap: 0.4, width: 0.25 } }
        },
        {
            id: "tools",
            done: navigation.visited.tools === true,
            action: goTo("tools"),
            figure: { component: as(ToolProfile), props: { type: "vbit", diameter: 3.175, tipDiameter: 0.2, tipAngle: 30 } }
        },
        {
            id: "isolation",
            done: machining.operations.some((operation) => operation.result !== null),
            action: goToStep(() => navigation.openSection("machining", "isolation"), () =>
            {
                if (machining.operations.length === 0)
                {
                    machining.addIsolation();
                }
            }),
            figure: { component: as(IsolationPasses), props: { width: 0.254, passes: 2, overlap: 0.15 } }
        },
        {
            id: "drilling",
            done: machining.drillings.some((operation) => operation.result !== null) || (hasBoard && !hasDrills),
            skipped: hasBoard && !hasDrills,
            action: goToStep(() => navigation.openSection("machining", "drilling"), () =>
            {
                if (machining.drillings.length === 0)
                {
                    machining.addDrilling();
                }
            }),
            figure: { component: as(DrillCycle), props: { cycle: "simple", depth: 1.8, peckDepth: 0.5 } }
        },
        {
            id: "cutout",
            done: machining.cutouts.some((operation) => operation.result !== null),
            action: goToStep(() => navigation.openSection("machining", "cutout"), () =>
            {
                if (machining.cutouts.length === 0)
                {
                    machining.addCutout();
                }
            }),
            figure: { component: as(CutoutTabs), props: { count: 4, tabWidth: 2, tabHeight: 0.5 } }
        },
        {
            id: "export",
            done: exportState.output !== null,
            action: goToStep(() => navigation.openSection("machine", "export"), () => void exportState.run()),
            figure: { component: as(OriginMirror), props: { origin: 0, mirror: false } }
        },
        {
            id: "machine",
            done: false,
            action: null,
            figure: { component: as(ZHeights), props: { travelZ: 2, safeZ: 15, depth: 0.1 } }
        }
    ]);
    let doneCount = $derived(steps.filter((step) => step.done).length);
    // The first step not done yet is the one to do now
    let current = $derived(steps.find((step) => !step.done)?.id ?? null);
</script>

<div class="guide">
    <p class="intro">{t("guide.intro")}</p>
    <progress max={steps.length - 1} value={Math.min(doneCount, steps.length - 1)} aria-label={t("guide.progress", { done: doneCount, total: steps.length - 1 })}></progress>
    <ol class="steps">
        {#each steps as step, index (step.id)}
            <li class="step" class:done={step.done} class:current={current === step.id}>
                <div class="head">
                    <span class="number" aria-hidden="true">
                        {#if step.done}<Icon name="check" size={14} />{:else}{index + 1}{/if}
                    </span>
                    <h4>{t(`guide.${step.id}.title`)}</h4>
                    {#if step.done}
                        <span class="visually-hidden">{t(step.skipped ? "guide.skipped" : "guide.done")}</span>
                    {/if}
                </div>
                <p>{t(`guide.${step.id}.body`)}</p>
                {#if step.skipped}
                    <p class="note">{t("guide.drilling.none")}</p>
                {/if}
                {#if current === step.id && step.figure}
                    {@const Figure = step.figure.component}
                    <div class="figure"><Figure {...step.figure.props} /></div>
                {/if}
                {#if step.action && !step.skipped}
                    <div>
                        <Button variant={current === step.id ? "primary" : "ghost"} icon={step.done ? "chevron" : "plus"} help="guideStep"
                            onclick={step.action}>
                            {t(step.done ? "guide.show" : `guide.${step.id as Exclude<StepId, "machine">}.action`)}
                        </Button>
                    </div>
                {/if}
            </li>
        {/each}
    </ol>
</div>

<style>
    .guide
    {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .intro,
    .note
    {
        margin: 0;
    }

    .note
    {
        font-size: 12px;
        color: var(--text-muted);
    }

    progress
    {
        width: 100%;
        accent-color: var(--accent-formation);
    }

    .steps
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .step
    {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-left: 4px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
    }

    .step.current
    {
        border-left-color: var(--brand-rouge);
    }

    .step.done
    {
        border-left-color: var(--accent-formation);
    }

    .step p
    {
        margin: 0;
        font-size: 13px;
    }

    .head
    {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    h4
    {
        margin: 0;
        font-size: 14px;
    }

    .number
    {
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--surface-sunken);
        font-family: var(--font-title);
        font-size: 14px;
    }

    .done .number
    {
        background: var(--accent-formation);
        color: #ffffff;
    }

    .current .number
    {
        background: var(--brand-rouge-strong);
        color: #ffffff;
    }

    .figure
    {
        padding: 6px;
        border-radius: var(--radius);
        background: var(--surface-panel);
    }
</style>
