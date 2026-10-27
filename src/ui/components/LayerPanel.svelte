<script lang="ts">
    import { INTERNAL_UNITS_PER_MM } from "@core/units/index";
    import type { ProjectLayer } from "@project/index";
    import { isMessageKey } from "../i18n";
    import { i18n } from "../state/i18n.svelte";
    import { project } from "../state/project.svelte";
    import Icon from "./Icon.svelte";

    const t = i18n.t;

    function typeLabel(layer: ProjectLayer): string
    {
        const kind = t(`layerKind.${layer.file.layerType.kind}`);
        const side = t(`layerSide.${layer.file.layerType.side}`);
        return side ? `${kind} — ${side}` : kind;
    }

    function warningText(code: string): string
    {
        const key = `warning.${code}`;
        return isMessageKey(key) ? t(key) : code;
    }

    // Layers are listed top first, like a stack seen from above; the model stores them bottom first
    let ordered = $derived([...project.layers].reverse());
</script>

<section class="panel" aria-labelledby="layers-title">
    <h2 id="layers-title">{t("layers.title")}</h2>

    {#each project.tasks as task (task.id)}
        <div class="task" role="status">
            <span class="task-label">
                {t(task.stage === "parsing" ? "import.parsing" : "import.building", { file: task.fileName })}
            </span>
            <progress max="1" value={task.fraction}></progress>
            <button class="icon-button" type="button" title={t("import.cancel")} aria-label={t("import.cancel")}
                onclick={() => task.cancel()}>
                <Icon name="close" size={16} />
            </button>
        </div>
    {/each}

    {#each project.failures as failure (failure.id)}
        <div class="failure" role="alert">
            <Icon name="warning" size={16} />
            <span>{t("import.failed", { file: failure.fileName, message: failure.message })}</span>
            <button class="icon-button" type="button" title={t("import.dismiss")} aria-label={t("import.dismiss")}
                onclick={() => project.dismissFailure(failure.id)}>
                <Icon name="close" size={16} />
            </button>
        </div>
    {/each}

    {#if project.layers.length === 0 && project.tasks.length === 0}
        <p class="empty">{t("layers.empty")}</p>
    {/if}

    <ul class="layers">
        {#each ordered as layer, index (layer.id)}
            <li class="layer" class:hidden={!layer.visible}>
                <div class="row">
                    <button class="icon-button" type="button" aria-pressed={layer.visible}
                        title={t(layer.visible ? "layers.hide" : "layers.show")}
                        aria-label={t(layer.visible ? "layers.hide" : "layers.show")}
                        onclick={() => project.setVisible(layer.id, !layer.visible)}>
                        <Icon name={layer.visible ? "eye" : "eyeOff"} size={16} />
                    </button>
                    <input class="swatch" type="color" value={layer.color} title={t("layers.color")}
                        aria-label={t("layers.color")}
                        oninput={(event) => project.setColor(layer.id, event.currentTarget.value)} />
                    <span class="name" title={layer.file.fileName}>{layer.name}</span>
                    <button class="icon-button" type="button" disabled={index === 0} title={t("layers.up")}
                        aria-label={t("layers.up")} onclick={() => project.move(layer.id, "up")}>
                        <Icon name="up" size={16} />
                    </button>
                    <button class="icon-button" type="button" disabled={index === ordered.length - 1}
                        title={t("layers.down")} aria-label={t("layers.down")}
                        onclick={() => project.move(layer.id, "down")}>
                        <Icon name="down" size={16} />
                    </button>
                    <button class="icon-button" type="button" title={t("layers.remove")} aria-label={t("layers.remove")}
                        onclick={() => project.remove(layer.id)}>
                        <Icon name="remove" size={16} />
                    </button>
                </div>
                <div class="meta">
                    <span class="badge">{typeLabel(layer)}</span>
                    {#if layer.file.warnings.length > 0}
                        <span class="badge warning">
                            <Icon name="warning" size={12} />
                            {layer.file.warnings.length}
                        </span>
                    {/if}
                </div>
                <details>
                    <summary>{t("layers.details")}</summary>
                    <p>{t("layers.detection", { source: t(`source.${layer.file.layerType.source}`) })}</p>
                    <p>{t("layers.stats", { polygons: layer.file.stats.polygons, points: layer.file.stats.points })}</p>
                    <p>{t("layers.timing", {
                        parse: Math.round(layer.file.stats.parseMs),
                        build: Math.round(layer.file.stats.buildMs)
                    })}</p>
                    {#if layer.file.drill}
                        <p>{t("layers.drill", {
                            tools: layer.file.drill.tools.length,
                            hits: layer.file.drill.hits.length,
                            slots: layer.file.drill.slots.length
                        })}</p>
                        <ul class="tools">
                            {#each layer.file.drill.summary as entry (entry.tool)}
                                <li>{t("layers.drillTool", {
                                    tool: entry.tool,
                                    diameter: i18n.number(entry.diameter / INTERNAL_UNITS_PER_MM, 3),
                                    hits: entry.hits,
                                    slots: entry.slots,
                                    plating: t(`plating.${entry.plating}`)
                                })}</li>
                            {/each}
                        </ul>
                    {/if}
                    {#if layer.file.warnings.length === 0}
                        <p>{t("layers.noWarnings")}</p>
                    {:else}
                        <p>{t("layers.warnings", { count: layer.file.warnings.length })}</p>
                        <ul class="warnings">
                            {#each layer.file.warnings as warning, warningIndex (warningIndex)}
                                <li title={warning.detail}>
                                    <span class="line">{t("layers.warningLine", { line: warning.line })}</span>
                                    {warningText(warning.code)}
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </details>
            </li>
        {/each}
    </ul>
</section>

<style>
    .panel
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        overflow-y: auto;
        height: 100%;
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

    .empty
    {
        color: var(--text-muted);
        margin: 0;
    }

    .layers
    {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .layer
    {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 6px 8px;
    }

    .layer.hidden .name
    {
        color: var(--text-muted);
    }

    .row
    {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .name
    {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
    }

    .swatch
    {
        width: 22px;
        height: 22px;
        padding: 0;
        border: 1px solid var(--border);
        border-radius: 4px;
        background: none;
        cursor: pointer;
    }

    .meta
    {
        display: flex;
        gap: 6px;
        margin: 4px 0 2px 30px;
    }

    .badge
    {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--surface-sunken);
        font-size: 12px;
    }

    .badge.warning
    {
        background: var(--warning-background);
    }

    details
    {
        margin-left: 30px;
        font-size: 12px;
        color: var(--text-muted);
    }

    details p
    {
        margin: 4px 0;
    }

    summary
    {
        cursor: pointer;
    }

    .tools,
    .warnings
    {
        margin: 2px 0;
        padding-left: 16px;
    }

    .line
    {
        font-family: var(--font-mono);
        margin-right: 4px;
    }

    .icon-button
    {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        padding: 0;
        border: none;
        border-radius: 4px;
        background: transparent;
        cursor: pointer;
    }

    .icon-button:hover:not(:disabled)
    {
        background: var(--surface-sunken);
    }

    .icon-button:disabled
    {
        opacity: 0.3;
        cursor: default;
    }

    .task,
    .failure
    {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        border-radius: var(--radius);
        font-size: 12px;
    }

    .task
    {
        background: var(--accent-cowork-light);
        color: var(--brand-prune);
    }

    .task-label
    {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    progress
    {
        width: 70px;
        accent-color: var(--accent-cowork);
    }

    .failure
    {
        background: var(--error-background);
    }

    .failure span
    {
        flex: 1;
    }
</style>
