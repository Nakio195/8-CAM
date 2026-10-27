// View transform between board coordinates (millimetres, Y up) and screen pixels (CSS pixels, Y down).
// Pure functions, independent of the drawing engine.

export interface Viewport
{
    /** Board point shown at the centre of the view, millimetres. */
    centerX: number;
    centerY: number;
    /** Pixels per millimetre. */
    scale: number;
    /** View size, CSS pixels. */
    width: number;
    height: number;
}

export interface ScreenPoint
{
    x: number;
    y: number;
}

/** Board rectangle in millimetres. */
export interface WorldRect
{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** From 1 µm to 10 m across the view. */
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 20_000;

export function clampScale(scale: number): number
{
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function worldToScreen(view: Viewport, x: number, y: number): ScreenPoint
{
    return {
        x: (x - view.centerX) * view.scale + view.width / 2,
        y: view.height / 2 - (y - view.centerY) * view.scale
    };
}

export function screenToWorld(view: Viewport, x: number, y: number): ScreenPoint
{
    return {
        x: view.centerX + (x - view.width / 2) / view.scale,
        y: view.centerY - (y - view.height / 2) / view.scale
    };
}

/** Zooms by factor keeping the board point under (x, y) in place, as with the mouse wheel. */
export function zoomAt(view: Viewport, x: number, y: number, factor: number): Viewport
{
    const scale = clampScale(view.scale * factor);
    const anchor = screenToWorld(view, x, y);
    return {
        ...view,
        scale,
        centerX: anchor.x - (x - view.width / 2) / scale,
        centerY: anchor.y + (y - view.height / 2) / scale
    };
}

/** Moves the view by a drag of (dx, dy) screen pixels. */
export function pan(view: Viewport, dx: number, dy: number): Viewport
{
    return { ...view, centerX: view.centerX - dx / view.scale, centerY: view.centerY + dy / view.scale };
}

/** Shows the whole rectangle with a margin in pixels on every side. */
export function fitRect(view: Viewport, rect: WorldRect, margin = 32): Viewport
{
    const width = Math.max(rect.maxX - rect.minX, 1e-3);
    const height = Math.max(rect.maxY - rect.minY, 1e-3);
    const availableWidth = Math.max(view.width - 2 * margin, 1);
    const availableHeight = Math.max(view.height - 2 * margin, 1);
    return {
        ...view,
        scale: clampScale(Math.min(availableWidth / width, availableHeight / height)),
        centerX: (rect.minX + rect.maxX) / 2,
        centerY: (rect.minY + rect.maxY) / 2
    };
}

/** Board area currently visible. */
export function visibleRect(view: Viewport): WorldRect
{
    const topLeft = screenToWorld(view, 0, 0);
    const bottomRight = screenToWorld(view, view.width, view.height);
    return { minX: topLeft.x, minY: bottomRight.y, maxX: bottomRight.x, maxY: topLeft.y };
}

/**
 * Grid spacing in millimetres: the smallest value of the 1-2-5 sequence giving at least minPixels between lines.
 */
export function gridStep(scale: number, minPixels = 24): number
{
    const raw = minPixels / scale;
    const power = 10 ** Math.floor(Math.log10(raw));
    for (const multiple of [1, 2, 5, 10])
    {
        if (multiple * power >= raw - 1e-12)
        {
            return multiple * power;
        }
    }
    return 10 * power;
}
