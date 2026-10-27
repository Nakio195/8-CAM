<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { isEmptyBBox } from "@core/geometry/index";
    import { INTERNAL_UNITS_PER_MM } from "@core/units/index";
    import { layersBBox, type ProjectLayer } from "@project/index";
    import type { FocusRequest } from "../state/project.svelte";
    import {
        Canvas2DRenderer,
        fitRect,
        gridStep,
        pan,
        screenToWorld,
        zoomAt,
        type Renderer,
        type RenderLayer,
        type RenderQuality,
        type ScreenPoint,
        type Viewport
    } from "@render/index";
    import { i18n } from "../state/i18n.svelte";
    import { help } from "../help";
    import { help as helpState } from "../state/help.svelte";
    import IconButton from "./base/IconButton.svelte";

    let { layers, fitRequest, focus = null, overlays = [] }: {
        layers: ProjectLayer[];
        fitRequest: number;
        focus?: FocusRequest | null;
        /** Drawn above the layers: toolpaths, non isolated areas. */
        overlays?: RenderLayer[];
    } = $props();

    const t = i18n.t;

    function pinHelp(topic: string, event: MouseEvent): void
    {
        helpState.show(topic, event.currentTarget as HTMLElement, true);
    }
    const WHEEL_SENSITIVITY = 0.0015;
    const KEY_PAN = 60;
    const MIN_FIT_SIZE = 64;

    let container: HTMLDivElement;
    let canvas: HTMLCanvasElement;
    let renderer: Renderer | null = null;
    let frame = 0;

    let view = $state<Viewport>({ centerX: 0, centerY: 0, scale: 4, width: 1, height: 1 });
    let showGrid = $state(true);
    let showOrigin = $state(true);
    let measuring = $state(false);
    let measureFrom = $state<ScreenPoint | null>(null);
    let measureTo = $state<ScreenPoint | null>(null);
    let measureFixed = $state(false);
    let cursor = $state<ScreenPoint | null>(null);
    let highlight = $state<FocusRequest["highlight"]>(null);
    let drag: { x: number; y: number; pointer: number } | null = null;
    // While panning or zooming, frames reuse the last full image; an exact frame follows once the user stops
    let interacting = false;
    let idleTimer = 0;
    const IDLE_DELAY = 120;

    function requestRender(): void
    {
        if (frame === 0)
        {
            frame = requestAnimationFrame(() =>
            {
                frame = 0;
                renderer?.render(view, {
                    showGrid,
                    showOrigin,
                    measure: measureFrom && measureTo ? { from: measureFrom, to: measureTo } : null,
                    highlight
                }, interacting ? "interactive" : "full");
            });
        }
    }

    function beginInteraction(): void
    {
        interacting = true;
        clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() =>
        {
            interacting = false;
            requestRender();
        }, IDLE_DELAY);
    }

    function fitAll(): void
    {
        highlight = null;
        const box = layersBBox(layers);
        if (isEmptyBBox(box))
        {
            return;
        }
        view = fitRect(view, {
            minX: box.minX / INTERNAL_UNITS_PER_MM,
            minY: box.minY / INTERNAL_UNITS_PER_MM,
            maxX: box.maxX / INTERNAL_UNITS_PER_MM,
            maxY: box.maxY / INTERNAL_UNITS_PER_MM
        });
    }

    function zoomCenter(factor: number): void
    {
        view = zoomAt(view, view.width / 2, view.height / 2, factor);
    }

    function localPoint(event: MouseEvent): ScreenPoint
    {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function toggleMeasure(): void
    {
        measuring = !measuring;
        measureFrom = null;
        measureTo = null;
        measureFixed = false;
    }

    function onPointerDown(event: PointerEvent): void
    {
        canvas.focus();
        const point = localPoint(event);
        if (measuring && event.button === 0)
        {
            const world = screenToWorld(view, point.x, point.y);
            if (!measureFrom || measureFixed)
            {
                measureFrom = world;
                measureTo = world;
                measureFixed = false;
            }
            else
            {
                measureTo = world;
                measureFixed = true;
            }
            return;
        }
        if (event.button === 0 || event.button === 1)
        {
            drag = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
            canvas.setPointerCapture(event.pointerId);
            event.preventDefault();
        }
    }

    function onPointerMove(event: PointerEvent): void
    {
        const point = localPoint(event);
        cursor = screenToWorld(view, point.x, point.y);
        if (drag && drag.pointer === event.pointerId)
        {
            beginInteraction();
            view = pan(view, event.clientX - drag.x, event.clientY - drag.y);
            drag = { ...drag, x: event.clientX, y: event.clientY };
        }
        else if (measuring && measureFrom && !measureFixed)
        {
            measureTo = cursor;
        }
    }

    function onPointerUp(event: PointerEvent): void
    {
        if (drag && drag.pointer === event.pointerId)
        {
            drag = null;
            canvas.releasePointerCapture(event.pointerId);
        }
    }

    function onWheel(event: WheelEvent): void
    {
        event.preventDefault();
        const point = localPoint(event);
        // Pixel deltas on trackpads, line deltas on some mice
        const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
        beginInteraction();
        view = zoomAt(view, point.x, point.y, Math.exp(-delta * WHEEL_SENSITIVITY));
    }

    function onKeyDown(event: KeyboardEvent): void
    {
        if (event.key.startsWith("Arrow") || ["+", "=", "-"].includes(event.key))
        {
            beginInteraction();
        }
        switch (event.key)
        {
            case "ArrowLeft":
                view = pan(view, KEY_PAN, 0);
                break;
            case "ArrowRight":
                view = pan(view, -KEY_PAN, 0);
                break;
            case "ArrowUp":
                view = pan(view, 0, KEY_PAN);
                break;
            case "ArrowDown":
                view = pan(view, 0, -KEY_PAN);
                break;
            case "+":
            case "=":
                zoomCenter(1.25);
                break;
            case "-":
                zoomCenter(0.8);
                break;
            case "f":
            case "F":
                fitAll();
                break;
            case "g":
            case "G":
                showGrid = !showGrid;
                break;
            case "o":
            case "O":
                showOrigin = !showOrigin;
                break;
            case "m":
            case "M":
                toggleMeasure();
                break;
            case "Escape":
                if (measuring)
                {
                    toggleMeasure();
                }
                break;
            default:
                return;
        }
        event.preventDefault();
    }

    onMount(() =>
    {
        renderer = new Canvas2DRenderer(canvas);
        const observer = new ResizeObserver(() =>
        {
            const rect = container.getBoundingClientRect();
            renderer?.resize(rect.width, rect.height, window.devicePixelRatio || 1);
            view = { ...view, width: rect.width, height: rect.height };
        });
        observer.observe(container);
        // Non passive so the page does not scroll while zooming
        canvas.addEventListener("wheel", onWheel, { passive: false });
        if (import.meta.env.DEV)
        {
            // Development only (performance checks of the specification section 3): draws a series of frames,
            // zooming in then out, and returns the mean cost per frame in milliseconds. A single pixel readback at the
            // end waits for the canvas: reading back after every frame would push Chrome to a software canvas.
            Object.assign(window, {
                measureFrames: (count: number, quality: RenderQuality, size?: { width: number; height: number }): number =>
                {
                    if (size)
                    {
                        renderer?.resize(size.width, size.height, 1);
                        view = { ...view, width: size.width, height: size.height };
                    }
                    fitAll();
                    renderer?.render(view, { showGrid, showOrigin, measure: null }, "full");
                    const start = performance.now();
                    for (let i = 0; i < count; i++)
                    {
                        const factor = i < count / 2 ? 1.03 : 1 / 1.03;
                        view = zoomAt(view, view.width / 2, view.height / 2, factor);
                        renderer?.render(view, { showGrid, showOrigin, measure: null }, quality);
                    }
                    canvas.getContext("2d")?.getImageData(0, 0, 1, 1);
                    return (performance.now() - start) / count;
                }
            });
        }
        return () =>
        {
            observer.disconnect();
            canvas.removeEventListener("wheel", onWheel);
            cancelAnimationFrame(frame);
            clearTimeout(idleTimer);
            renderer?.dispose();
        };
    });

    $effect(() =>
    {
        renderer?.setLayers([
            ...layers.map((layer) => ({
                id: layer.id,
                geometry: layer.file.geometry,
                color: layer.color,
                opacity: layer.opacity,
                visible: layer.visible
            })),
            ...overlays
        ]);
        requestRender();
    });

    $effect(() =>
    {
        // Redraw whenever something shown changes
        void [view, showGrid, showOrigin, measureFrom, measureTo, highlight];
        requestRender();
    });

    // Areas requested by other panels (analysis: tightest clearance), shown once per request
    let handledFocus = 0;
    $effect(() =>
    {
        if (focus && focus.id > handledFocus && view.width > MIN_FIT_SIZE && view.height > MIN_FIT_SIZE)
        {
            handledFocus = focus.id;
            const request = focus;
            untrack(() =>
            {
                view = fitRect(view, request.rect);
                highlight = request.highlight;
            });
        }
    });

    // Fit once per request, as soon as the canvas has a size (not again on later resizes)
    let handledFitRequest = 0;
    $effect(() =>
    {
        // A tab opened in the background can report a tiny size first: wait for a usable one
        if (fitRequest > handledFitRequest && view.width > MIN_FIT_SIZE && view.height > MIN_FIT_SIZE)
        {
            handledFitRequest = fitRequest;
            untrack(fitAll);
        }
    });

    let measure = $derived(measureFrom && measureTo
        ? { dx: measureTo.x - measureFrom.x, dy: measureTo.y - measureFrom.y }
        : null);
</script>

<div class="view">
    <div class="toolbar" role="toolbar" aria-label={t("view.toolbar")}>
        <IconButton icon="fit" tone="onDark" label={t("view.fit")} help="viewFit" onclick={fitAll} />
        <IconButton icon="zoomIn" tone="onDark" label={t("view.zoomIn")} help="viewZoomIn" onclick={() => zoomCenter(1.25)} />
        <IconButton icon="zoomOut" tone="onDark" label={t("view.zoomOut")} help="viewZoomOut" onclick={() => zoomCenter(0.8)} />
        <span class="separator"></span>
        <IconButton icon="grid" tone="onDark" label={t("view.grid")} help="viewGrid" pressed={showGrid}
            onclick={() => (showGrid = !showGrid)} />
        <IconButton icon="origin" tone="onDark" label={t("view.origin")} help="viewOrigin" pressed={showOrigin}
            onclick={() => (showOrigin = !showOrigin)} />
        <IconButton icon="measure" tone="onDark" label={t("view.measure")} help="viewMeasure" pressed={measuring}
            onclick={toggleMeasure} />
    </div>

    <div class="canvas-box" bind:this={container}>
        <canvas
            bind:this={canvas}
            class:measuring
            tabindex="0"
            aria-label={t("view.canvasLabel")}
            onpointerdown={onPointerDown}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
            onpointercancel={onPointerUp}
            onpointerleave={() => (cursor = null)}
            ondblclick={fitAll}
            onkeydown={onKeyDown}
        ></canvas>
        {#if measuring}
            <p class="hint" role="status">{t("view.measureHint")}</p>
        {/if}
    </div>

    <!-- Indicators are buttons so their help is reachable from the keyboard; a click pins it -->
    <div class="status">
        <button class="indicator mono" type="button" use:help={"viewCursor"} onclick={(event) => pinHelp("viewCursor", event)}>
            {#if cursor}
                {t("status.cursor", { x: i18n.number(cursor.x, 3), y: i18n.number(cursor.y, 3) })}
            {:else}
                {t("status.idle")}
            {/if}
        </button>
        <!-- Only the measurement is announced: the cursor position changes far too often -->
        <span class="mono measure" aria-live="polite">
            {#if measure}
                {t("status.measure", {
                    dx: i18n.number(measure.dx, 3),
                    dy: i18n.number(measure.dy, 3),
                    distance: i18n.number(Math.hypot(measure.dx, measure.dy), 3)
                })}
            {/if}
        </span>
        <span class="spacer"></span>
        <button class="indicator mono" type="button" use:help={"viewGridStep"} onclick={(event) => pinHelp("viewGridStep", event)}>
            {t("status.grid", { step: i18n.number(gridStep(view.scale), gridStep(view.scale) < 1 ? 2 : 0) })}
        </button>
        <button class="indicator mono" type="button" use:help={"viewScale"} onclick={(event) => pinHelp("viewScale", event)}>
            {t("status.zoom", { zoom: i18n.number(view.scale, view.scale < 10 ? 2 : 0) })}
        </button>
    </div>
</div>

<style>
    .view
    {
        position: relative;
        display: flex;
        flex-direction: column;
        height: 100%;
        min-width: 0;
        background: var(--canvas-background);
    }

    .toolbar
    {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 1;
        display: flex;
        gap: 2px;
        padding: 4px;
        border-radius: var(--radius);
        background: rgba(42, 23, 39, 0.92);
        color: #f1ecf0;
    }

    .toolbar :global(.icon-button)
    {
        width: 32px;
        height: 32px;
    }

    .indicator
    {
        padding: 0;
        border: none;
        background: none;
        color: inherit;
        font-size: inherit;
        cursor: help;
    }

    .separator
    {
        width: 1px;
        margin: 4px 3px;
        background: rgba(255, 255, 255, 0.2);
    }

    .canvas-box
    {
        position: relative;
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    canvas
    {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        cursor: grab;
        touch-action: none;
    }

    canvas:active
    {
        cursor: grabbing;
    }

    canvas.measuring
    {
        cursor: crosshair;
    }

    .hint
    {
        position: absolute;
        top: 10px;
        right: 10px;
        margin: 0;
        padding: 6px 10px;
        border-radius: var(--radius);
        background: var(--accent-pro);
        color: var(--brand-prune);
        font-size: 12px;
    }

    .status
    {
        display: flex;
        gap: 16px;
        align-items: center;
        padding: 4px 12px;
        background: #170b14;
        color: #d8cdd6;
        font-size: 12px;
        min-height: 26px;
    }

    .mono
    {
        font-family: var(--font-mono);
        white-space: pre;
    }

    .measure
    {
        color: var(--accent-pro);
    }

    .spacer
    {
        flex: 1;
    }
</style>
