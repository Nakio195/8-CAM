// Canvas 2D implementation of the renderer.
// Each layer's geometry is converted once into a Path2D in millimetres; panning and zooming only change the
// canvas transform, so a dense board stays fluid (no re-tessellation per frame).

import { forEachPackedRing, type PackedPolygons } from "@core/geometry/index";
import { INTERNAL_UNITS_PER_MM } from "@core/units/index";
import type { RenderLayer, RenderOverlay, Renderer, RenderTheme } from "./renderer";
import { DARK_THEME } from "./renderer";
import { gridStep, visibleRect, worldToScreen, type Viewport } from "./viewport";

function buildPath(geometry: PackedPolygons): Path2D
{
    const path = new Path2D();
    forEachPackedRing(geometry, (start, pointCount) =>
    {
        if (pointCount < 2)
        {
            return;
        }
        path.moveTo((geometry[start] ?? 0) / INTERNAL_UNITS_PER_MM, (geometry[start + 1] ?? 0) / INTERNAL_UNITS_PER_MM);
        for (let i = 1; i < pointCount; i++)
        {
            const index = start + 2 * i;
            path.lineTo((geometry[index] ?? 0) / INTERNAL_UNITS_PER_MM, (geometry[index + 1] ?? 0) / INTERNAL_UNITS_PER_MM);
        }
        path.closePath();
    });
    return path;
}

export class Canvas2DRenderer implements Renderer
{
    private mCanvas: HTMLCanvasElement;
    private mContext: CanvasRenderingContext2D;
    private mTheme: RenderTheme;
    private mLayers: readonly RenderLayer[] = [];
    private mPaths = new WeakMap<PackedPolygons, Path2D>();
    private mPixelRatio = 1;

    constructor(canvas: HTMLCanvasElement, theme: RenderTheme = DARK_THEME)
    {
        const context = canvas.getContext("2d", { alpha: false });
        if (!context)
        {
            throw new Error("Canvas 2D is not available");
        }
        this.mCanvas = canvas;
        this.mContext = context;
        this.mTheme = theme;
    }

    public setLayers(layers: readonly RenderLayer[]): void
    {
        this.mLayers = layers;
    }

    public resize(width: number, height: number, pixelRatio: number): void
    {
        this.mPixelRatio = pixelRatio;
        this.mCanvas.width = Math.max(1, Math.round(width * pixelRatio));
        this.mCanvas.height = Math.max(1, Math.round(height * pixelRatio));
    }

    public render(view: Viewport, overlay: RenderOverlay): void
    {
        const context = this.mContext;
        const ratio = this.mPixelRatio;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.fillStyle = this.mTheme.background;
        context.fillRect(0, 0, this.mCanvas.width, this.mCanvas.height);

        if (overlay.showGrid)
        {
            this.drawGrid(view);
        }

        // Board space: millimetres, Y up
        context.setTransform(
            ratio * view.scale, 0, 0, -ratio * view.scale,
            ratio * (view.width / 2 - view.centerX * view.scale),
            ratio * (view.height / 2 + view.centerY * view.scale)
        );
        for (const layer of this.mLayers)
        {
            if (!layer.visible)
            {
                continue;
            }
            let path = this.mPaths.get(layer.geometry);
            if (!path)
            {
                path = buildPath(layer.geometry);
                this.mPaths.set(layer.geometry, path);
            }
            context.globalAlpha = layer.opacity;
            context.fillStyle = layer.color;
            context.fill(path, "evenodd");
        }
        context.globalAlpha = 1;

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        if (overlay.showOrigin)
        {
            this.drawOrigin(view);
        }
        if (overlay.measure)
        {
            this.drawMeasure(view, overlay.measure.from, overlay.measure.to);
        }
    }

    public dispose(): void
    {
        this.mLayers = [];
        this.mPaths = new WeakMap();
    }

    /** Grid lines in screen space so they stay one pixel wide; every fifth line is stronger. */
    private drawGrid(view: Viewport): void
    {
        const context = this.mContext;
        const ratio = this.mPixelRatio;
        const step = gridStep(view.scale);
        const rect = visibleRect(view);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.lineWidth = 1;
        for (const major of [false, true])
        {
            const spacing = major ? step * 5 : step;
            context.strokeStyle = major ? this.mTheme.gridMajor : this.mTheme.gridMinor;
            context.beginPath();
            for (let x = Math.ceil(rect.minX / spacing) * spacing; x <= rect.maxX; x += spacing)
            {
                const screenX = Math.round(worldToScreen(view, x, 0).x) + 0.5;
                context.moveTo(screenX, 0);
                context.lineTo(screenX, view.height);
            }
            for (let y = Math.ceil(rect.minY / spacing) * spacing; y <= rect.maxY; y += spacing)
            {
                const screenY = Math.round(worldToScreen(view, 0, y).y) + 0.5;
                context.moveTo(0, screenY);
                context.lineTo(view.width, screenY);
            }
            context.stroke();
        }
    }

    /** Gerber origin: short X (pink) and Y (green) axes. */
    private drawOrigin(view: Viewport): void
    {
        const context = this.mContext;
        const origin = worldToScreen(view, 0, 0);
        const length = 28;
        context.lineWidth = 2;
        context.lineCap = "round";
        context.strokeStyle = this.mTheme.axisX;
        context.beginPath();
        context.moveTo(origin.x, origin.y);
        context.lineTo(origin.x + length, origin.y);
        context.stroke();
        context.strokeStyle = this.mTheme.axisY;
        context.beginPath();
        context.moveTo(origin.x, origin.y);
        context.lineTo(origin.x, origin.y - length);
        context.stroke();
    }

    private drawMeasure(view: Viewport, from: { x: number; y: number }, to: { x: number; y: number }): void
    {
        const context = this.mContext;
        const start = worldToScreen(view, from.x, from.y);
        const end = worldToScreen(view, to.x, to.y);
        context.strokeStyle = this.mTheme.measure;
        context.fillStyle = this.mTheme.measure;
        context.lineWidth = 1.5;
        context.setLineDash([6, 4]);
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
        context.setLineDash([]);
        for (const point of [start, end])
        {
            context.beginPath();
            context.arc(point.x, point.y, 3.5, 0, 2 * Math.PI);
            context.fill();
        }
    }
}
