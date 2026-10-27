// Help topics shown by HelpTip and the help panel (specification 6.11).
// Texts live in the i18n files: help.<id>.title, help.<id>.body, and optionally help.<id>.advice / help.<id>.warning.

export type HelpGroup = "view" | "project" | "application" | "tool" | "machining" | "setup";

export interface HelpTopic
{
    id: string;
    group: HelpGroup;
    /**
     * Geometric parameter: its tooltip must show an illustration (specification 6.12). The parametric illustrations
     * are added with the parameters themselves (J5 onwards); the help texts are ready now.
     */
    geometric?: boolean;
}

export const HELP_GROUPS: readonly HelpGroup[] = ["view", "project", "application", "tool", "machining", "setup"];

export const HELP_TOPICS: readonly HelpTopic[] = [
    // Board view
    { id: "viewFit", group: "view" },
    { id: "viewZoomIn", group: "view" },
    { id: "viewZoomOut", group: "view" },
    { id: "viewGrid", group: "view" },
    { id: "viewOrigin", group: "view" },
    { id: "viewMeasure", group: "view" },
    { id: "viewCursor", group: "view" },
    { id: "viewScale", group: "view" },
    { id: "viewGridStep", group: "view" },
    // Project and layers
    { id: "fileOpen", group: "project" },
    { id: "fileExample", group: "project" },
    { id: "layerVisibility", group: "project" },
    { id: "layerColor", group: "project" },
    { id: "layerUp", group: "project" },
    { id: "layerDown", group: "project" },
    { id: "layerRemove", group: "project" },
    { id: "layerType", group: "project" },
    { id: "layerWarnings", group: "project" },
    { id: "importCancel", group: "project" },
    // Application
    { id: "language", group: "application" },
    { id: "theme", group: "application" },
    { id: "helpPanel", group: "application" },
    { id: "about", group: "application" },
    // Tools (specification 6.11 table)
    { id: "diameter", group: "tool", geometric: true },
    { id: "tipAngle", group: "tool", geometric: true },
    { id: "tipDiameter", group: "tool", geometric: true },
    { id: "feedXY", group: "tool" },
    { id: "feedZ", group: "tool" },
    { id: "spindleSpeed", group: "tool" },
    // Machining
    { id: "cutDepth", group: "machining", geometric: true },
    { id: "depthPerPass", group: "machining", geometric: true },
    { id: "passes", group: "machining", geometric: true },
    { id: "overlap", group: "machining", geometric: true },
    { id: "millingDirection", group: "machining", geometric: true },
    { id: "peck", group: "machining", geometric: true },
    { id: "tabs", group: "machining", geometric: true },
    { id: "tabHeight", group: "machining", geometric: true },
    { id: "cutoutMargin", group: "machining", geometric: true },
    { id: "nonIsolated", group: "machining", geometric: true },
    // Machine setup
    { id: "travelZ", group: "setup", geometric: true },
    { id: "safeZ", group: "setup", geometric: true },
    { id: "origin", group: "setup", geometric: true },
    { id: "mirror", group: "setup", geometric: true },
    { id: "postProcessor", group: "setup" }
];

export type HelpId = (typeof HELP_TOPICS)[number]["id"];

export function findTopic(id: string): HelpTopic | undefined
{
    return HELP_TOPICS.find((topic) => topic.id === id);
}
