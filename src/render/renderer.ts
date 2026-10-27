// Drawing engine interface: the user interface only talks to this, so Canvas 2D can be replaced by WebGL
// without touching the rest (specification section 3).

import type { PackedPolygons } from "@core/geometry/index";
import type { ScreenPoint, Viewport } from "./viewport";

export interface RenderLayer
{
    id: string;
    /** Filled polygons in internal units (see core/geometry/packing). */
    geometry: PackedPolygons;
    color: string;
    opacity: number;
    visible: boolean;
}

export interface RenderTheme
{
    background: string;
    gridMinor: string;
    gridMajor: string;
    axisX: string;
    axisY: string;
    measure: string;
}

export interface RenderOverlay
{
    showGrid: boolean;
    showOrigin: boolean;
    /** Measurement segment in board millimetres, end point following the cursor while measuring. */
    measure: { from: ScreenPoint; to: ScreenPoint } | null;
}

/**
 * "full" draws every layer exactly; "interactive" may reuse the last full image, moved and scaled, while the user pans
 * or zooms (a full frame must follow when the interaction stops).
 */
export type RenderQuality = "full" | "interactive";

export interface Renderer
{
    /** Sets the layers, bottom first. Geometry is cached per typed array: pass the same array to reuse it. */
    setLayers(layers: readonly RenderLayer[]): void;
    /** Canvas size in CSS pixels and the device pixel ratio. */
    resize(width: number, height: number, pixelRatio: number): void;
    render(view: Viewport, overlay: RenderOverlay, quality?: RenderQuality): void;
    dispose(): void;
}

/**
 * Canvas background proposed for the brand (specification 6.13): a very dark plum derived from #4b2a46,
 * so copper red, drill yellow and back copper purple stand out.
 */
export const DARK_THEME: RenderTheme = {
    background: "#1f101c",
    gridMinor: "rgba(228, 223, 227, 0.07)",
    gridMajor: "rgba(228, 223, 227, 0.16)",
    axisX: "rgba(250, 160, 205, 0.75)",
    axisY: "rgba(30, 190, 150, 0.75)",
    measure: "#ffe600"
};
