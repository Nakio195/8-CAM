import { describe, expect, it } from "vitest";
import {
    clampScale,
    fitRect,
    gridStep,
    MAX_SCALE,
    MIN_SCALE,
    pan,
    screenToWorld,
    viewChangeTransform,
    visibleRect,
    worldToScreen,
    zoomAt,
    type Viewport
} from "@render/viewport";

const VIEW: Viewport = { centerX: 10, centerY: 20, scale: 4, width: 800, height: 600 };

describe("viewport", () =>
{
    it("maps the board centre to the screen centre with Y pointing up", () =>
    {
        expect(worldToScreen(VIEW, 10, 20)).toEqual({ x: 400, y: 300 });
        expect(worldToScreen(VIEW, 11, 21)).toEqual({ x: 404, y: 296 });
        expect(screenToWorld(VIEW, 404, 296)).toEqual({ x: 11, y: 21 });
    });

    it("keeps the point under the cursor fixed when zooming", () =>
    {
        const before = screenToWorld(VIEW, 123, 456);
        const zoomed = zoomAt(VIEW, 123, 456, 2.5);
        expect(zoomed.scale).toBe(10);
        const after = screenToWorld(zoomed, 123, 456);
        expect(after.x).toBeCloseTo(before.x, 10);
        expect(after.y).toBeCloseTo(before.y, 10);
    });

    it("limits the zoom", () =>
    {
        expect(zoomAt(VIEW, 0, 0, 1e9).scale).toBe(MAX_SCALE);
        expect(zoomAt(VIEW, 0, 0, 1e-9).scale).toBe(MIN_SCALE);
        expect(clampScale(5)).toBe(5);
    });

    it("pans with the drag direction", () =>
    {
        const moved = pan(VIEW, 40, -20);
        // Dragging right shows what was on the left; dragging up shows what was below
        expect(moved.centerX).toBe(0);
        expect(moved.centerY).toBe(15);
    });

    it("fits a rectangle with a margin", () =>
    {
        const fitted = fitRect(VIEW, { minX: 0, minY: 0, maxX: 100, maxY: 50 }, 50);
        expect(fitted.scale).toBe(7);
        expect([fitted.centerX, fitted.centerY]).toEqual([50, 25]);
        const rect = visibleRect(fitted);
        expect(rect.minX).toBeLessThanOrEqual(0);
        expect(rect.maxX).toBeGreaterThanOrEqual(100);
        expect(rect.minY).toBeLessThanOrEqual(0);
        expect(fitRect(VIEW, { minX: 5, minY: 5, maxX: 5, maxY: 5 }).scale).toBe(MAX_SCALE);
    });

    it("chooses grid steps of the 1-2-5 sequence", () =>
    {
        expect(gridStep(4)).toBe(10);
        expect(gridStep(24)).toBe(1);
        expect(gridStep(25)).toBe(1);
        expect(gridStep(100)).toBe(0.5);
        expect(gridStep(1000)).toBeCloseTo(0.05);
        expect(gridStep(0.1)).toBe(500);
        expect(gridStep(12)).toBe(2);
    });
});

describe("reusing a frame for another view", () =>
{
    it("maps every board point to where the new view draws it", () =>
    {
        const from = VIEW;
        const to = zoomAt(pan(VIEW, 37, -12), 210, 90, 1.7);
        const transform = viewChangeTransform(from, to);
        for (const [x, y] of [[10, 20], [0, 0], [-35.5, 72.25]] as const)
        {
            const before = worldToScreen(from, x, y);
            const after = worldToScreen(to, x, y);
            expect(transform.scale * before.x + transform.x).toBeCloseTo(after.x, 9);
            expect(transform.scale * before.y + transform.y).toBeCloseTo(after.y, 9);
        }
    });
});
