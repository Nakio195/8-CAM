// Geometry of the parametric illustrations (specification 6.12), kept apart from the Svelte components so it can be
// tested. Every scene is drawn in a fixed SVG frame; real proportions are kept unless stated (copper is thickened).

import { effectiveWidth, passDepths, type ToolType } from "@cam/tools/index";

export const FRAME_WIDTH = 240;
export const FRAME_HEIGHT = 150;

export interface Point2
{
    x: number;
    y: number;
}

export function pointsAttribute(points: readonly Point2[]): string
{
    return points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
}

export function round(value: number): number
{
    return Math.round(value * 10) / 10;
}

// ----- Tool profile (side view) -----

export interface ToolProfileParams
{
    type: ToolType;
    diameter: number;
    tipDiameter: number;
    tipAngle: number;
}

export interface ToolProfileShape
{
    /** Shank, drawn above the cutting part. */
    shank: Point2[];
    /** Cutting part outline. */
    body: Point2[];
    /** Flute lines (end mill, drill). */
    flutes: [Point2, Point2][];
    /** Width dimension: left and right x, at height y. */
    widthDimension: { left: number; right: number; y: number };
    /** V-bit and drill: the two lines and the arc showing the angle. */
    angle: { apex: Point2; left: Point2; right: Point2 } | null;
}

/**
 * Side view of a tool, 100 px wide area centred in the frame; the cutting width is drawn to scale against the shank
 * (3.175 mm, the usual 1/8" shank) so a 0.8 mm end mill looks thin next to it.
 */
export function toolProfile(params: ToolProfileParams): ToolProfileShape
{
    const shankDiameter = 3.175;
    const scale = 60 / Math.max(shankDiameter, params.diameter);
    const centre = FRAME_WIDTH / 2;
    const shankHalf = (shankDiameter * scale) / 2;
    const shank = [
        { x: centre - shankHalf, y: 8 }, { x: centre + shankHalf, y: 8 },
        { x: centre + shankHalf, y: 62 }, { x: centre - shankHalf, y: 62 }
    ];
    const bottom = 132;
    const half = Math.max(1.5, (params.diameter * scale) / 2);

    if (params.type === "vbit")
    {
        // The cone goes from the shank width down to the tip flat
        const tipHalf = Math.max(0.6, (params.tipDiameter * scale) / 2);
        const halfAngle = Math.max(5, Math.min(85, params.tipAngle / 2)) * (Math.PI / 180);
        const coneHeight = Math.min(bottom - 62, (shankHalf - tipHalf) / Math.tan(halfAngle));
        const top = bottom - coneHeight;
        const body = [
            { x: centre - shankHalf, y: 62 }, { x: centre + shankHalf, y: 62 },
            { x: centre + shankHalf, y: top }, { x: centre + tipHalf, y: bottom },
            { x: centre - tipHalf, y: bottom }, { x: centre - shankHalf, y: top }
        ];
        const apex = { x: centre, y: bottom + tipHalf / Math.tan(halfAngle) };
        return {
            shank,
            body,
            flutes: [[{ x: centre, y: 66 }, { x: centre, y: bottom - 4 }]],
            widthDimension: { left: centre - tipHalf, right: centre + tipHalf, y: bottom + 10 },
            angle: { apex, left: { x: centre - shankHalf, y: top }, right: { x: centre + shankHalf, y: top } }
        };
    }

    if (params.type === "drill")
    {
        // 118° point by default
        const halfAngle = Math.max(30, Math.min(85, (params.tipAngle || 118) / 2)) * (Math.PI / 180);
        const pointHeight = half / Math.tan(halfAngle);
        const body = [
            { x: centre - half, y: 62 }, { x: centre + half, y: 62 },
            { x: centre + half, y: bottom - pointHeight }, { x: centre, y: bottom },
            { x: centre - half, y: bottom - pointHeight }
        ];
        const flutes: [Point2, Point2][] = [];
        for (let y = 70; y < bottom - pointHeight - 6; y += 12)
        {
            flutes.push([{ x: centre - half, y }, { x: centre + half, y: y + 8 }]);
        }
        return {
            shank,
            body,
            flutes,
            widthDimension: { left: centre - half, right: centre + half, y: 74 },
            angle: { apex: { x: centre, y: bottom }, left: { x: centre - half, y: bottom - pointHeight }, right: { x: centre + half, y: bottom - pointHeight } }
        };
    }

    // End mill: straight body with helical flutes
    const body = [
        { x: centre - half, y: 62 }, { x: centre + half, y: 62 },
        { x: centre + half, y: bottom }, { x: centre - half, y: bottom }
    ];
    const flutes: [Point2, Point2][] = [];
    for (let y = 70; y < bottom - 4; y += 10)
    {
        flutes.push([{ x: centre - half, y }, { x: centre + half, y: Math.min(bottom, y + 7) }]);
    }
    return { shank, body, flutes, widthDimension: { left: centre - half, right: centre + half, y: bottom + 10 }, angle: null };
}

// ----- V-bit in the copper (cross-section) -----

export interface VbitSectionParams
{
    tipDiameter: number;
    tipAngle: number;
    depth: number;
}

export interface VbitSectionShape
{
    /** Effective width at the cutting depth, mm. */
    width: number;
    surfaceY: number;
    depthY: number;
    copperBottomY: number;
    /** Cone outline, from above the surface down to the tip. */
    cone: Point2[];
    /** Material removed (the groove in the board), as a polygon. */
    groove: Point2[];
    widthDimension: { left: number; right: number; y: number };
    depthDimension: { x: number; top: number; bottom: number };
}

/** Copper is 35 µm; it is drawn at least 6 px thick so it stays visible. */
export const COPPER_THICKNESS = 0.035;

export function vbitSection(params: VbitSectionParams): VbitSectionShape
{
    const depth = Math.max(0, params.depth);
    const width = effectiveWidth({ type: "vbit", diameter: 0, tipDiameter: params.tipDiameter, tipAngle: params.tipAngle }, depth);
    const halfAngle = Math.max(1, Math.min(89, params.tipAngle / 2)) * (Math.PI / 180);
    // Show the groove with some board around it, same scale on both axes
    const scale = Math.min(140 / Math.max(width * 2.2, 0.2), 70 / Math.max(depth * 1.6, 0.05));
    const centre = FRAME_WIDTH / 2;
    const surfaceY = 60;
    const depthY = surfaceY + depth * scale;
    const copperBottomY = surfaceY + Math.max(6, COPPER_THICKNESS * scale);
    const tipHalf = (params.tipDiameter * scale) / 2;
    const halfWidth = (width * scale) / 2;
    // The cone continues above the surface to show the tool
    const aboveHeight = 30;
    const aboveHalf = halfWidth + aboveHeight * Math.tan(halfAngle);
    return {
        width,
        surfaceY,
        depthY,
        copperBottomY,
        cone: [
            { x: centre - aboveHalf, y: surfaceY - aboveHeight }, { x: centre + aboveHalf, y: surfaceY - aboveHeight },
            { x: centre + tipHalf, y: depthY }, { x: centre - tipHalf, y: depthY }
        ],
        groove: [
            { x: centre - halfWidth, y: surfaceY }, { x: centre + halfWidth, y: surfaceY },
            { x: centre + tipHalf, y: depthY }, { x: centre - tipHalf, y: depthY }
        ],
        widthDimension: { left: centre - halfWidth, right: centre + halfWidth, y: surfaceY - aboveHeight - 8 },
        // Kept far enough from the right edge for its label
        depthDimension: { x: Math.min(centre + Math.max(halfWidth, 20) + 24, FRAME_WIDTH - 64), top: surfaceY, bottom: depthY }
    };
}

// ----- Depth passes -----

export interface DepthPassesShape
{
    surfaceY: number;
    bottomY: number;
    /** y of the bottom of each pass, shallowest first. */
    passes: number[];
    passCount: number;
}

export function depthPasses(depth: number, depthPerPass: number, boardThickness = 1.6): DepthPassesShape
{
    const depths = passDepths(depth, depthPerPass);
    const surfaceY = 16;
    const reference = Math.max(depth, boardThickness);
    // Room is left below the board for two lines of text
    const scale = 88 / Math.max(reference, 0.1);
    return {
        surfaceY,
        bottomY: surfaceY + boardThickness * scale,
        passes: depths.map((value) => surfaceY + value * scale),
        passCount: depths.length
    };
}

// ----- Z heights -----

export interface ZHeightsShape
{
    surfaceY: number;
    travelY: number;
    safeY: number;
    depthY: number;
}

/**
 * Heights of the tool above (and below) the board surface. The vertical scale is compressed with a square root so
 * a 15 mm safe height and a 0.1 mm depth both stay readable; the drawing says it is not to scale.
 */
export function zHeights(travelZ: number, safeZ: number, depth: number): ZHeightsShape
{
    const surfaceY = 112;
    const compress = (value: number): number => Math.sqrt(Math.max(0, value));
    const maxHeight = Math.max(compress(safeZ), compress(travelZ), 1);
    const scale = 92 / maxHeight;
    return {
        surfaceY,
        travelY: surfaceY - compress(travelZ) * scale,
        safeY: surfaceY - compress(safeZ) * scale,
        depthY: surfaceY + Math.max(6, compress(depth) * scale * 0.6)
    };
}
