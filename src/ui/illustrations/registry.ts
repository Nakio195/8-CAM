// Illustration of each geometric help topic (specification 6.11: illustration required for geometric parameters).
// The HelpTip shows it with the values of the field it belongs to, or typical values in the help panel.

import type { Component } from "svelte";
import BoardThickness from "./BoardThickness.svelte";
import DepthPasses from "./DepthPasses.svelte";
import ToolProfile from "./ToolProfile.svelte";
import VbitSection from "./VbitSection.svelte";
import ZHeights from "./ZHeights.svelte";

/** Values given by the field showing the help (millimetres, degrees); missing ones take typical values. */
export type IllustrationValues = Readonly<Record<string, number>>;

export interface TopicIllustration
{
    component: Component<Record<string, unknown>>;
    props: (values: IllustrationValues) => Record<string, unknown>;
}

function as<Props extends Record<string, unknown>>(component: Component<Props>): Component<Record<string, unknown>>
{
    return component as unknown as Component<Record<string, unknown>>;
}

const TYPES = ["endmill", "vbit", "drill"] as const;

const vbit = (values: IllustrationValues): Record<string, unknown> => ({
    tipDiameter: values.tipDiameter ?? 0.2,
    tipAngle: values.tipAngle ?? 30,
    depth: values.cutDepth ?? 0.1
});

const heights = (values: IllustrationValues): Record<string, unknown> => ({
    travelZ: values.travelZ ?? 2,
    safeZ: values.safeZ ?? 15,
    depth: values.cutDepth ?? 0.1
});

export const ILLUSTRATIONS: Readonly<Record<string, TopicIllustration>> = {
    diameter: {
        component: as(ToolProfile),
        props: (values) => ({
            // values.toolType: 0 end mill, 1 V-bit, 2 drill
            type: TYPES[values.toolType ?? 0] ?? "endmill",
            diameter: values.diameter ?? 0.8,
            tipDiameter: values.tipDiameter ?? 0.2,
            tipAngle: values.tipAngle ?? 30
        })
    },
    tipAngle: { component: as(VbitSection), props: vbit },
    tipDiameter: { component: as(VbitSection), props: vbit },
    cutDepth: { component: as(VbitSection), props: vbit },
    depthPerPass: {
        component: as(DepthPasses),
        props: (values) => ({
            depth: values.cutDepth ?? 1.7,
            depthPerPass: values.depthPerPass ?? 0.4,
            thickness: values.thickness ?? 1.6
        })
    },
    travelZ: { component: as(ZHeights), props: heights },
    safeZ: { component: as(ZHeights), props: heights },
    boardThickness: { component: as(BoardThickness), props: (values) => ({ thickness: values.thickness ?? 1.6 }) }
};

/**
 * Geometric topics whose parameters are not in the interface yet: their illustration comes with them.
 * The help test fails if a geometric topic is neither illustrated nor listed here.
 */
export const PENDING_ILLUSTRATIONS: Readonly<Record<string, string>> = {
    passes: "J6",
    overlap: "J6",
    millingDirection: "J6",
    nonIsolated: "J6",
    peck: "J7",
    tabs: "J8",
    tabHeight: "J8",
    cutoutMargin: "J8",
    origin: "J10",
    mirror: "J10"
};
