// Shared state of the help: the tooltip currently shown (one at a time) and the help panel.

export interface ShownTip
{
    id: string;
    anchor: HTMLElement;
    pinned: boolean;
}

/** Hover delay before a tooltip appears (specification 6.11). */
export const SHOW_DELAY = 400;
/** Grace period letting the pointer travel from the element to the tooltip. */
export const HIDE_DELAY = 200;
/** Touch screens: press duration that opens the tooltip. */
export const LONG_PRESS_DELAY = 500;

class HelpState
{
    public tip: ShownTip | null = $state(null);
    public panelOpen = $state(false);
    /** Topic the panel scrolls to when it opens. */
    public panelTopic: string | null = $state(null);

    private mShowTimer = 0;
    private mHideTimer = 0;

    public show(id: string, anchor: HTMLElement, pinned = false): void
    {
        this.cancelTimers();
        if (this.tip?.pinned && this.tip.anchor !== anchor && !pinned)
        {
            // A pinned tooltip stays until it is closed
            return;
        }
        this.tip = { id, anchor, pinned };
    }

    public scheduleShow(id: string, anchor: HTMLElement): void
    {
        this.cancelTimers();
        this.mShowTimer = window.setTimeout(() => this.show(id, anchor), SHOW_DELAY);
    }

    public scheduleHide(): void
    {
        window.clearTimeout(this.mShowTimer);
        if (this.tip && !this.tip.pinned)
        {
            window.clearTimeout(this.mHideTimer);
            this.mHideTimer = window.setTimeout(() => this.hide(), HIDE_DELAY);
        }
    }

    /** Keeps the tooltip open while the pointer is over it. */
    public keep(): void
    {
        window.clearTimeout(this.mHideTimer);
    }

    public hide(force = false): void
    {
        this.cancelTimers();
        if (this.tip && (force || !this.tip.pinned))
        {
            this.tip = null;
        }
    }

    public togglePin(): void
    {
        if (this.tip)
        {
            this.tip = { ...this.tip, pinned: !this.tip.pinned };
        }
    }

    public openPanel(topic: string | null = null): void
    {
        this.panelTopic = topic;
        this.panelOpen = true;
        this.hide(true);
    }

    public closePanel(): void
    {
        this.panelOpen = false;
    }

    private cancelTimers(): void
    {
        window.clearTimeout(this.mShowTimer);
        window.clearTimeout(this.mHideTimer);
    }
}

export const help = new HelpState();
