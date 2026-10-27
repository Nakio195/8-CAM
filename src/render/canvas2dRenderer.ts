// Canvas 2D implementation of the renderer.
// Each layer's geometry is converted once into a Path2D in millimetres; panning and zooming only change the
// canvas transform, so a dense board stays fluid (no re-tessellation per frame).

import { DEFAULT_ARC_TOLERANCE, forEachPackedRing, simplifyPacked, type PackedPolygons } from "@core/geometry/index";
import { INTERNAL_UNITS_PER_MM } from "@core/units/index";
import type { RenderLayer, RenderOverlay, Renderer, RenderQuality, RenderStyle, RenderTheme } from "./renderer";
import { DARK_THEME } from "./renderer";
import { gridStep, viewChangeTransform, visibleRect, worldToScreen, type Viewport } from "./viewport";

/** Points closer than this on screen are merged when drawing at low zoom. */
const LOD_TOLERANCE_PIXELS = 0.5;
const FULL_DETAIL_TOLERANCE = 2 * DEFAULT_ARC_TOLERANCE;

function sameView(a: Viewport, b: Viewport): boolean
{
    return a.centerX === b.centerX && a.centerY === b.centerY && a.scale === b.scale
        && a.width === b.width && a.height === b.height;
}

/** Path of packed rings in millimetres; rings are closed unless they are open lines (travel moves). */
function buildPath(geometry: PackedPolygons, closed = true): Path2D
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
        if (closed)
        {
            path.closePath();
        }
    });
    return path;
}

export class Canvas2DRenderer implements Renderer
{
    private mCanvas: HTMLCanvasElement;
    private mContext: CanvasRenderingContext2D;
    private mTheme: RenderTheme;
    private mLayers: readonly RenderLayer[] = [];
    private mPaths = new WeakMap<PackedPolygons, Map<string, Path2D>>();
    private mPixelRatio = 1;
    /** Layers are drawn here, then copied to the visible canvas; the last full image doubles as the snapshot. */
    private mLayerCanvas: HTMLCanvasElement;
    private mLayerContext: CanvasRenderingContext2D;
    private mSnapshot: { canvas: HTMLCanvasElement; view: Viewport } | null = null;

    constructor(canvas: HTMLCanvasElement, theme: RenderTheme = DARK_THEME)
    {
        const context = canvas.getContext("2d", { alpha: false });
        const layerCanvas = document.createElement("canvas");
        const layerContext = layerCanvas.getContext("2d");
        if (!context || !layerContext)
        {
            throw new Error("Canvas 2D is not available");
        }
        this.mCanvas = canvas;
        this.mContext = context;
        this.mLayerCanvas = layerCanvas;
        this.mLayerContext = layerContext;
        this.mTheme = theme;
    }

    public setLayers(layers: readonly RenderLayer[]): void
    {
        this.mLayers = layers;
        this.mSnapshot = null;
    }

    public resize(width: number, height: number, pixelRatio: number): void
    {
        this.mPixelRatio = pixelRatio;
        this.mCanvas.width = Math.max(1, Math.round(width * pixelRatio));
        this.mCanvas.height = Math.max(1, Math.round(height * pixelRatio));
        this.mSnapshot = null;
    }

    public render(view: Viewport, overlay: RenderOverlay, quality: RenderQuality = "full"): void
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

        const snapshot = this.mSnapshot;
        // The last full image is exact when the view has not changed (only overlays moved)
        if (snapshot && (quality === "interactive" || sameView(snapshot.view, view)))
        {
            // Moves and scales the last full image instead of filling every layer again
            const transform = viewChangeTransform(snapshot.view, view);
            context.setTransform(transform.scale, 0, 0, transform.scale, ratio * transform.x, ratio * transform.y);
            context.drawImage(snapshot.canvas, 0, 0);
        }
        else
        {
            this.drawLayers(view);
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.drawImage(this.mLayerCanvas, 0, 0);
        }

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        if (overlay.showOrigin)
        {
            this.drawOrigin(view);
        }
        if (overlay.highlight)
        {
            this.drawHighlight(view, overlay.highlight.from, overlay.highlight.to);
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
        this.mSnapshot = null;
    }

    /** Fills the visible layers into the layer canvas, which then serves as the snapshot for interactive frames. */
    private drawLayers(view: Viewport): void
    {
        const canvas = this.mLayerCanvas;
        if (canvas.width !== this.mCanvas.width || canvas.height !== this.mCanvas.height)
        {
            canvas.width = this.mCanvas.width;
            canvas.height = this.mCanvas.height;
        }
        const context = this.mLayerContext;
        const ratio = this.mPixelRatio;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
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
            context.globalAlpha = layer.opacity;
            const style = layer.style ?? "fill";
            if (style === "fill")
            {
                context.fillStyle = layer.color;
                context.fill(this.pathFor(layer.geometry, view.scale, style), "evenodd");
                continue;
            }
            // Widths in board millimetres; 0 means a thin line of 1.5 screen pixels at any zoom
            const width = layer.strokeWidth ?? 0;
            context.strokeStyle = layer.color;
            context.lineWidth = width > 0 ? width : 1.5 / view.scale;
            context.lineJoin = "round";
            context.lineCap = "round";
            context.setLineDash(layer.dashed ? [6 / view.scale, 5 / view.scale] : []);
            context.stroke(this.pathFor(layer.geometry, view.scale, style));
        }
        context.setLineDash([]);
        context.globalAlpha = 1;
        this.mSnapshot = { canvas, view: { ...view } };
    }

    /**
     * Path of the geometry at the level of detail matching the zoom: one level per power of two of the scale,
     * points at least half a pixel apart. Drawing 280 000 points when the whole board fits in 900 pixels would
     * cost 100 ms per frame; the simplified copy keeps pan and zoom fluid with an error below one pixel.
     */
    private pathFor(geometry: PackedPolygons, scale: number, style: RenderStyle): Path2D
    {
        let levels = this.mPaths.get(geometry);
        if (!levels)
        {
            levels = new Map<string, Path2D>();
            this.mPaths.set(geometry, levels);
        }
        const level = Math.floor(Math.log2(scale));
        const tolerance = (LOD_TOLERANCE_PIXELS / 2 ** level) * INTERNAL_UNITS_PER_MM;
        // Below the arc discretisation tolerance, the full geometry is already as fine as it gets
        // Open lines are never simplified: the simplification is meant for closed rings
        const full = tolerance <= FULL_DETAIL_TOLERANCE || style === "line";
        const key = `${style}:${full ? "full" : level}`;
        let path = levels.get(key);
        if (!path)
        {
            path = buildPath(full ? geometry : simplifyPacked(geometry, tolerance), style !== "line");
            levels.set(key, path);
        }
        return path;
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

    /** Ring around a spot and the segment joining its two points, visible on any layer colour. */
    private drawHighlight(view: Viewport, from: { x: number; y: number }, to: { x: number; y: number }): void
    {
        const context = this.mContext;
        const start = worldToScreen(view, from.x, from.y);
        const end = worldToScreen(view, to.x, to.y);
        const centre = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        const radius = Math.max(16, Math.hypot(end.x - start.x, end.y - start.y) / 2 + 10);
        context.lineWidth = 3;
        context.strokeStyle = "rgba(31, 16, 28, 0.85)";
        context.beginPath();
        context.arc(centre.x, centre.y, radius + 2, 0, 2 * Math.PI);
        context.stroke();
        context.lineWidth = 2;
        context.strokeStyle = this.mTheme.measure;
        context.beginPath();
        context.arc(centre.x, centre.y, radius, 0, 2 * Math.PI);
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
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
