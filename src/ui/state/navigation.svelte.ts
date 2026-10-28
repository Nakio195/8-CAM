// Tab of the side panel shown, shared so the first board guide can lead the user from one tab to the next.

export type SidebarTab = "project" | "tools" | "analysis" | "machining" | "machine";

class NavigationState
{
    public tab: SidebarTab = $state("project");
    /** Tabs opened at least once: the guide counts looking at the analysis and the tools as steps done. */
    public visited: Partial<Record<SidebarTab, boolean>> = $state({});

    public open(tab: SidebarTab): void
    {
        this.tab = tab;
        this.visited[tab] = true;
    }
}

export const navigation = new NavigationState();
