// Help topics shown by HelpTip and the help panel (specification 6.11).
// Texts live in the i18n files: help.<id>.title, help.<id>.body, and optionally help.<id>.advice / help.<id>.warning.

export type HelpGroup = "view" | "project" | "application" | "tool" | "analysis" | "machining" | "setup";

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

export const HELP_GROUPS: readonly HelpGroup[] = ["view", "project", "application", "tool", "analysis", "machining", "setup"];

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
    { id: "messageDismiss", group: "project" },
    // Application
    { id: "language", group: "application" },
    { id: "theme", group: "application" },
    { id: "helpPanel", group: "application" },
    { id: "about", group: "application" },
    { id: "tabProject", group: "application" },
    { id: "tabTools", group: "application" },
    { id: "tabAnalysis", group: "application" },
    { id: "tabMachining", group: "application" },
    { id: "tabMachine", group: "application" },
    // Tools (specification 6.11 table)
    { id: "diameter", group: "tool", geometric: true },
    { id: "tipAngle", group: "tool", geometric: true },
    { id: "tipDiameter", group: "tool", geometric: true },
    { id: "feedXY", group: "tool" },
    { id: "feedZ", group: "tool" },
    { id: "spindleSpeed", group: "tool" },
    { id: "toolWidth", group: "tool" },
    { id: "toolName", group: "tool" },
    { id: "toolType", group: "tool" },
    { id: "toolUsage", group: "tool" },
    { id: "toolNotes", group: "tool" },
    { id: "toolBuiltIn", group: "tool" },
    { id: "toolAdd", group: "tool" },
    { id: "toolEdit", group: "tool" },
    { id: "toolDuplicate", group: "tool" },
    { id: "toolDelete", group: "tool" },
    { id: "toolSave", group: "tool" },
    { id: "toolCancel", group: "tool" },
    { id: "toolImport", group: "tool" },
    { id: "toolExport", group: "tool" },
    { id: "toolReset", group: "tool" },
    // Board analysis and recommendations
    { id: "minClearance", group: "analysis" },
    { id: "minTrackWidth", group: "analysis" },
    { id: "holeSizes", group: "analysis" },
    { id: "zoomToSpot", group: "analysis" },
    { id: "isolationAdvice", group: "analysis" },
    { id: "drillingAdvice", group: "analysis" },
    { id: "drillGrouping", group: "analysis" },
    { id: "cutoutAdvice", group: "analysis" },
    // Machining
    { id: "isolationNew", group: "machining" },
    { id: "isolationLayer", group: "machining" },
    { id: "isolationTool", group: "machining" },
    { id: "combinePasses", group: "machining" },
    { id: "isolationAdvanced", group: "machining" },
    { id: "extraOffset", group: "machining", geometric: true },
    { id: "isolationRun", group: "machining" },
    { id: "isolationCancel", group: "machining" },
    { id: "isolationVisibility", group: "machining" },
    { id: "isolationRemove", group: "machining" },
    { id: "cutLength", group: "machining" },
    { id: "estimatedTime", group: "machining" },
    { id: "zoneList", group: "machining" },
    { id: "compareTools", group: "machining" },
    { id: "compareRun", group: "machining" },
    { id: "compareUse", group: "machining" },
    { id: "drillingNew", group: "machining" },
    { id: "drillingLayers", group: "machining" },
    { id: "holeTool", group: "machining" },
    { id: "holeMilling", group: "machining", geometric: true },
    { id: "drillCycle", group: "machining", geometric: true },
    { id: "drillDepth", group: "machining", geometric: true },
    { id: "dwell", group: "machining" },
    { id: "drillingRun", group: "machining" },
    { id: "drillingCancel", group: "machining" },
    { id: "drillingVisibility", group: "machining" },
    { id: "drillingRemove", group: "machining" },
    { id: "drillDistance", group: "machining" },
    { id: "showFileOrder", group: "machining" },
    { id: "cutoutNew", group: "machining" },
    { id: "cutoutSource", group: "machining" },
    { id: "cutoutMode", group: "machining" },
    { id: "cutoutTool", group: "machining" },
    { id: "cutoutDepth", group: "machining", geometric: true },
    { id: "tabWidth", group: "machining", geometric: true },
    { id: "tabsAuto", group: "machining" },
    { id: "tabsEdit", group: "machining" },
    { id: "cutoutVisibility", group: "machining" },
    { id: "cutoutRemove", group: "machining" },
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
    { id: "postProcessor", group: "setup" },
    { id: "machineSelect", group: "setup" },
    { id: "machineName", group: "setup" },
    { id: "machineTravel", group: "setup", geometric: true },
    { id: "maxSpindleSpeed", group: "setup" },
    { id: "maxFeed", group: "setup" },
    { id: "rapidFeed", group: "setup" },
    { id: "machineAdd", group: "setup" },
    { id: "machineImport", group: "setup" },
    { id: "machineExport", group: "setup" },
    { id: "machineRemove", group: "setup" },
    { id: "postCopy", group: "setup" },
    { id: "postImport", group: "setup" },
    { id: "postExport", group: "setup" },
    { id: "postRemove", group: "setup" },
    { id: "postName", group: "setup" },
    { id: "postUnits", group: "setup" },
    { id: "postComments", group: "setup" },
    { id: "postDecimals", group: "setup" },
    { id: "postArcs", group: "setup" },
    { id: "postFeeds", group: "setup" },
    { id: "postRapidFeed", group: "setup" },
    { id: "postLineNumbers", group: "setup" },
    { id: "postCommands", group: "setup" },
    { id: "postHeader", group: "setup" },
    { id: "postToolChange", group: "setup" },
    { id: "postSpindle", group: "setup" },
    { id: "postDwell", group: "setup" },
    { id: "postFooter", group: "setup" },
    { id: "postForbidden", group: "setup" },
    { id: "postPreview", group: "setup" },
    { id: "boardThickness", group: "setup", geometric: true }
];

export type HelpId = (typeof HELP_TOPICS)[number]["id"];

export function findTopic(id: string): HelpTopic | undefined
{
    return HELP_TOPICS.find((topic) => topic.id === id);
}
