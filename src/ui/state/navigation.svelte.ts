// Tab of the side panel shown, and the section open in each tab, shared so the first board guide can lead the user
// from one step to the next.

export type SidebarTab = "project" | "tools" | "analysis" | "machining" | "machine";

/** Steps of the Machining tab, in their order. */
export const MACHINING_SECTIONS = ["isolation", "drilling", "cutout"] as const;
/** Steps of the Machine tab, in their order: the machine, its post-processor, then the G-code and its simulation. */
export const MACHINE_SECTIONS = ["machine", "post", "export", "simulation"] as const;

export type MachiningSection = (typeof MACHINING_SECTIONS)[number];
export type MachineSection = (typeof MACHINE_SECTIONS)[number];

interface Sections
{
    machining: MachiningSection | null;
    machine: MachineSection | null;
}

class NavigationState
{
    public tab: SidebarTab = $state("project");
    /** Tabs opened at least once: the guide counts looking at the analysis and the tools as steps done. */
    public visited: Partial<Record<SidebarTab, boolean>> = $state({});
    /** Section open in each tab with steps; only one at a time, none when the user folded it. */
    public sections: Sections = $state({ machining: "isolation", machine: "machine" });

    public open(tab: SidebarTab): void
    {
        this.tab = tab;
        this.visited[tab] = true;
    }

    /** Opens a tab on one of its sections, folding the one that was open. */
    public openSection<Tab extends keyof Sections>(tab: Tab, section: NonNullable<Sections[Tab]>): void
    {
        this.sections[tab] = section;
        this.open(tab);
    }

    /** Opens a section, or folds it when it is the one open. */
    public toggleSection<Tab extends keyof Sections>(tab: Tab, section: NonNullable<Sections[Tab]>): void
    {
        this.sections[tab] = this.sections[tab] === section ? null : section;
    }
}

export const navigation = new NavigationState();
