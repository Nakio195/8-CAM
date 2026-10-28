import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import { effectiveWidth } from "@cam/tools/index";
import { HELP_TOPICS } from "@ui/help/topics";
import { cutoutTabs, depthPasses, drillCycle, machineTravel, holeMilling, isolationPasses, nonIsolated, toolProfile, vbitSection, zHeights } from "@ui/illustrations/geometry";
import { ILLUSTRATIONS, PENDING_ILLUSTRATIONS } from "@ui/illustrations/registry";
import BoardThickness from "@ui/illustrations/BoardThickness.svelte";
import CutoutTabs from "@ui/illustrations/CutoutTabs.svelte";
import DepthPasses from "@ui/illustrations/DepthPasses.svelte";
import DrillCycle from "@ui/illustrations/DrillCycle.svelte";
import HoleMilling from "@ui/illustrations/HoleMilling.svelte";
import IsolationPasses from "@ui/illustrations/IsolationPasses.svelte";
import MachineTravel from "@ui/illustrations/MachineTravel.svelte";
import MillingDirection from "@ui/illustrations/MillingDirection.svelte";
import NonIsolated from "@ui/illustrations/NonIsolated.svelte";
import ToolProfile from "@ui/illustrations/ToolProfile.svelte";
import VbitSection from "@ui/illustrations/VbitSection.svelte";
import ZHeights from "@ui/illustrations/ZHeights.svelte";

describe("illustration geometry", () =>
{
    it("draws one plunge for a simple cycle and one per peck down to the hole depth", () =>
    {
        const simple = drillCycle("simple", 1.8, 0.5);
        expect(simple.plungeCount).toBe(1);
        const peck = drillCycle("peck", 1.8, 0.5);
        expect(peck.plungeCount).toBe(4);
        // The deepest point of the profile is the bottom of the hole, below the board
        expect(Math.max(...peck.profile.map((point) => point.y))).toBeCloseTo(peck.depthY, 0);
        expect(peck.depthY).toBeGreaterThan(peck.bottomY);
        // Between pecks the drill comes out above the surface
        expect(peck.profile.filter((point) => point.y < peck.surfaceY).length).toBeGreaterThan(4);
    });

    it("spreads the tabs on the sides of the cut and shows the board they keep", () =>
    {
        const shape = cutoutTabs(4, 2, 0.5, 1.6, 0, 1.5);
        expect(shape.tabs).toHaveLength(4);
        // One tab in the middle of each side of the cut
        const centreX = shape.path.x + shape.path.width / 2;
        const centreY = shape.path.y + shape.path.height / 2;
        const middles = shape.tabs.filter((tab) => Math.abs(tab.x + tab.width / 2 - centreX) < 0.2 || Math.abs(tab.y + tab.height / 2 - centreY) < 0.2);
        expect(middles).toHaveLength(4);
        expect(shape.side.tabHeight / shape.side.boardHeight).toBeCloseTo(0.5 / 1.6, 2);
        expect(cutoutTabs(0, 2, 0.5, 1.6, 0, 1.5).tabs).toEqual([]);
    });

    it("draws the machine bed to scale with a 10 x 10 cm board", () =>
    {
        const shape = machineTravel(300, 180, 45);
        expect(shape.bed.width / shape.bed.height).toBeCloseTo(300 / 180, 1);
        expect(shape.board.width / shape.bed.width).toBeCloseTo(100 / 300, 1);
        expect(shape.tooSmall).toBe(false);
        expect(machineTravel(80, 200, 30).tooSmall).toBe(true);
    });

    it("draws the circle followed by the tool centre inside a milled hole", () =>
    {
        const shape = holeMilling(3, 1.5);
        expect(shape.pathRadius + shape.toolRadius).toBeCloseTo(shape.holeRadius, 6);
        expect(shape.blocked).toBe(false);
        expect(holeMilling(1, 1.5).blocked).toBe(true);
        expect(holeMilling(1.5, 1.5).pathRadius).toBe(0);
    });

    it("shows the V-bit width of the cutting depth, the same as the tool model", () =>
    {
        const shape = vbitSection({ tipDiameter: 0.2, tipAngle: 30, depth: 0.1 });
        expect(shape.width).toBe(effectiveWidth({ type: "vbit", diameter: 0, tipDiameter: 0.2, tipAngle: 30 }, 0.1));
        // The groove is as wide on screen as the width dimension
        expect((shape.groove[1]?.x ?? 0) - (shape.groove[0]?.x ?? 0)).toBeCloseTo(shape.widthDimension.right - shape.widthDimension.left, 6);
        expect(shape.depthY).toBeGreaterThan(shape.surfaceY);
        // A deeper cut is drawn deeper and wider
        const deeper = vbitSection({ tipDiameter: 0.2, tipAngle: 30, depth: 0.3 });
        expect(deeper.width).toBeGreaterThan(shape.width);
    });

    it("draws each tool type with its own outline", () =>
    {
        expect(toolProfile({ type: "endmill", diameter: 0.8, tipDiameter: 0, tipAngle: 0 }).angle).toBeNull();
        expect(toolProfile({ type: "vbit", diameter: 3.175, tipDiameter: 0.1, tipAngle: 20 }).body).toHaveLength(6);
        expect(toolProfile({ type: "drill", diameter: 1, tipDiameter: 0, tipAngle: 118 }).body).toHaveLength(5);
        // Wider tools are drawn wider
        const thin = toolProfile({ type: "endmill", diameter: 0.8, tipDiameter: 0, tipAngle: 0 }).widthDimension;
        const wide = toolProfile({ type: "endmill", diameter: 1.5, tipDiameter: 0, tipAngle: 0 }).widthDimension;
        expect(wide.right - wide.left).toBeGreaterThan(thin.right - thin.left);
    });

    it("stacks the passes down to the total depth", () =>
    {
        const shape = depthPasses(1.7, 0.4);
        expect(shape.passCount).toBe(5);
        expect(shape.passes).toHaveLength(5);
        expect([...shape.passes].sort((a, b) => a - b)).toEqual(shape.passes);
        // 1.7 mm goes below the 1.6 mm board
        expect(shape.passes[4]).toBeGreaterThan(shape.bottomY);
    });

    it("lays the isolation passes below the copper edge with their overlap", () =>
    {
        const shape = isolationPasses(0.8, 2, 0.25);
        expect(shape.bands).toHaveLength(2);
        expect(shape.bands[0]?.top).toBeCloseTo(shape.edgeY, 6);
        // The second band starts inside the first one by the overlap
        expect((shape.bands[0]?.bottom ?? 0) - (shape.bands[1]?.top ?? 0)).toBeCloseTo(shape.overlapPx, 6);
        expect(isolationPasses(0.8, 1, 0.25).overlapPx).toBe(0);
        expect(isolationPasses(0.8, 20, 0.1).bands).toHaveLength(6);
        // An extra offset leaves a copper border between the edge and the first band
        const offset = isolationPasses(0.8, 2, 0.25, 0.1);
        expect(offset.offsetPx).toBeGreaterThan(0);
        expect(offset.bands[0]?.top).toBeCloseTo(offset.edgeY + offset.offsetPx, 6);
        expect(shape.offsetPx).toBe(0);
    });

    it("shows a tool blocked by a gap narrower than its width", () =>
    {
        expect(nonIsolated(0.4, 0.8).blocked).toBe(true);
        expect(nonIsolated(0.4, 0.25).blocked).toBe(false);
        const shape = nonIsolated(0.4, 0.8);
        expect(shape.right.x1 - shape.left.x2).toBeLessThan(2 * shape.toolRadius);
    });

    it("orders the heights: safe above travel above the surface above the cut", () =>
    {
        const shape = zHeights(2, 15, 0.1);
        expect(shape.safeY).toBeLessThan(shape.travelY);
        expect(shape.travelY).toBeLessThan(shape.surfaceY);
        expect(shape.depthY).toBeGreaterThan(shape.surfaceY);
    });
});

describe("illustration components", () =>
{
    // Rendering snapshots (specification 6.12): any change of a drawing shows up in review
    it("renders the tool profiles", () =>
    {
        for (const [type, diameter, tipDiameter, tipAngle] of [["endmill", 0.8, 0, 0], ["vbit", 3.175, 0.2, 30], ["drill", 1, 0, 118]] as const)
        {
            expect(render(ToolProfile, { props: { type, diameter, tipDiameter, tipAngle } }).body).toMatchSnapshot(type);
        }
    });

    it("renders the cutting, depth, height and thickness drawings", () =>
    {
        expect(render(VbitSection, { props: { tipDiameter: 0.1, tipAngle: 20, depth: 0.075 } }).body).toMatchSnapshot();
        expect(render(DepthPasses, { props: { depth: 1.7, depthPerPass: 0.4 } }).body).toMatchSnapshot();
        expect(render(ZHeights, { props: { travelZ: 2, safeZ: 15, depth: 0.1 } }).body).toMatchSnapshot();
        expect(render(BoardThickness, { props: { thickness: 1.6 } }).body).toMatchSnapshot();
        expect(render(IsolationPasses, { props: { width: 0.254, passes: 2, overlap: 0.15 } }).body).toMatchSnapshot();
        expect(render(MillingDirection, { props: { direction: "conventional" } }).body).toMatchSnapshot();
        expect(render(NonIsolated, { props: { gap: 0.4, width: 0.8 } }).body).toMatchSnapshot();
    });

    it("renders the cutout and machine drawings", () =>
    {
        expect(render(MachineTravel, { props: { travelX: 300, travelY: 180, travelZ: 45 } }).body).toMatchSnapshot();
        expect(render(CutoutTabs, { props: { count: 4, tabWidth: 2, tabHeight: 0.5, margin: 1 } }).body).toMatchSnapshot();
    });

    it("renders the drilling drawings", () =>
    {
        expect(render(DrillCycle, { props: { cycle: "simple", depth: 1.8, peckDepth: 0.5 } }).body).toMatchSnapshot();
        expect(render(DrillCycle, { props: { cycle: "peck", depth: 1.8, peckDepth: 0.5 } }).body).toMatchSnapshot();
        expect(render(HoleMilling, { props: { hole: 3, tool: 1.5 } }).body).toMatchSnapshot();
    });

    it("describes each drawing for screen readers", () =>
    {
        const body = render(VbitSection, { props: { tipDiameter: 0.2, tipAngle: 30, depth: 0.1 } }).body;
        expect(body).toMatch(/role="img"/);
        expect(body).toMatch(/aria-label="[^"]*0[,.]254 mm/);
    });
});

describe("illustrated help topics", () =>
{
    it("illustrates every geometric topic, or schedules it with its parameter", () =>
    {
        const missing = HELP_TOPICS
            .filter((topic) => topic.geometric && !ILLUSTRATIONS[topic.id] && !PENDING_ILLUSTRATIONS[topic.id])
            .map((topic) => topic.id);
        expect(missing).toEqual([]);
        // Nothing is both illustrated and pending
        expect(Object.keys(PENDING_ILLUSTRATIONS).filter((id) => ILLUSTRATIONS[id])).toEqual([]);
    });

    it("renders every registered illustration with typical values", () =>
    {
        for (const [topic, illustration] of Object.entries(ILLUSTRATIONS))
        {
            const body = render(illustration.component, { props: illustration.props({}) }).body;
            expect(body, topic).toContain("<svg");
        }
    });
});
