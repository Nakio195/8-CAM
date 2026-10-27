// Drawing engine interface: the user interface only talks to this, so Canvas 2D can be replaced by WebGL
// without touching the rest (specification section 3).

import type { PackedPolygons } from "@core/geometry/index";
import type { ScreenPoint, Viewport } from "./viewport";

/**
 * How a layer is drawn: filled areas (copper, holes), closed outlines (isolation loops) or open lines (travel moves).
 */
export type RenderStyle = "fill" | "loop" | "line";

export interface RenderLayer
{
    id: string;
    /** Polygons in internal units (see core/geometry/packing); for outlines and lines, each ring is one path. */
    geometry: PackedPolygons;
    color: string;
    opacity: number;
    visible: boolean;
    /** Filled by default. */
    style?: RenderStyle;
    /** Outlines and lines: width on the board in millimetres (a tool width), or 0 for a thin line of constant width on screen. */
    strokeWidth?: number;
    dashed?: boolean;
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
    /** Spot to point out (board millimetres), e.g. the tightest clearance: a ring and the segment between the two points. */
    highlight?: { from: ScreenPoint; to: ScreenPoint } | null;
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
