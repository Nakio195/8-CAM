// Svelte action attaching a help topic to any element: use:help={"viewFit"} (an empty topic does nothing: the control
// is clear enough without help).
// Mouse: shown after a hover delay. Keyboard: shown on focus (not on a click, which focuses the field too). Touch: long
// press opens it pinned. Fields with a "?" button next to them show nothing themselves: the button opens the help.
// The element is described by the shared tooltip (aria-describedby), which HelpTipLayer renders once for the app.

import { help, LONG_PRESS_DELAY } from "../state/help.svelte";

export const TOOLTIP_ID = "helptip";

/**
 * How the help opens: on hover and keyboard focus; on click only (the "?" button of a field); or never by itself (the
 * field next to a "?" button: still described for screen readers, F1 still opens it).
 */
export type HelpTrigger = "hover" | "click" | "none";

/** A topic, or a topic with the values of the field it describes (shown by its illustration) and how it opens. */
export type HelpTarget = string | { topic: string; values?: Readonly<Record<string, number>>; trigger?: HelpTrigger };

// Last input used: a focus coming from a click must not open the help (text fields and lists keep the focus)
let keyboardUsed = false;
let modalityWatched = false;

function watchModality(): void
{
    if (!modalityWatched)
    {
        modalityWatched = true;
        window.addEventListener("keydown", () => (keyboardUsed = true), true);
        window.addEventListener("pointerdown", () => (keyboardUsed = false), true);
    }
}

export function helpAction(element: HTMLElement, target: HelpTarget): { update: (next: HelpTarget) => void; destroy: () => void }
{
    let id = typeof target === "string" ? target : target.topic;
    let values = typeof target === "string" ? undefined : target.values;
    let trigger = typeof target === "string" ? "hover" : target.trigger ?? "hover";
    let pressTimer = 0;
    let suppressClick = false;

    watchModality();
    if (id)
    {
        element.setAttribute("aria-describedby", TOOLTIP_ID);
        // Native tooltips would duplicate the help
        element.removeAttribute("title");
    }

    const onPointerEnter = (event: PointerEvent): void =>
    {
        // An open list would be covered by the tooltip
        const listOpen = element instanceof HTMLSelectElement && document.activeElement === element;
        if (id && trigger === "hover" && !listOpen && (event.pointerType === "mouse" || event.pointerType === "pen"))
        {
            help.scheduleShow(id, element, values);
        }
    };
    const onPointerLeave = (event: PointerEvent): void =>
    {
        if (event.pointerType !== "touch")
        {
            help.scheduleHide();
        }
    };
    const onPointerDown = (event: PointerEvent): void =>
    {
        if (id && trigger !== "click" && event.pointerType === "touch")
        {
            window.clearTimeout(pressTimer);
            pressTimer = window.setTimeout(() =>
            {
                suppressClick = true;
                help.show(id, element, true, values);
            }, LONG_PRESS_DELAY);
        }
        else if (trigger !== "click")
        {
            // Clicking an element acts on it: its tooltip gives way unless it was pinned
            help.hide();
        }
    };
    const cancelPress = (): void =>
    {
        window.clearTimeout(pressTimer);
    };
    const onClick = (event: MouseEvent): void =>
    {
        // The release after a long press must not trigger the element's action
        if (suppressClick)
        {
            suppressClick = false;
            event.preventDefault();
            event.stopImmediatePropagation();
        }
        else if (id && trigger === "click")
        {
            // The "?" button opens the help pinned, and closes it when clicked again
            if (help.tip?.anchor === element)
            {
                help.hide(true);
            }
            else
            {
                help.show(id, element, true, values);
            }
        }
    };
    const onFocus = (): void =>
    {
        if (id && trigger === "hover" && keyboardUsed && element.matches(":focus-visible"))
        {
            help.show(id, element, false, values);
        }
    };
    const onBlur = (): void =>
    {
        help.scheduleHide();
    };
    const onKeyDown = (event: KeyboardEvent): void =>
    {
        if (event.key === "Escape" && help.tip?.anchor === element)
        {
            help.hide(true);
        }
        else if (id && event.key === "F1")
        {
            // F1 pins the help of the focused element, as in many desktop applications
            event.preventDefault();
            help.show(id, element, true, values);
        }
    };
    const onContextMenu = (event: Event): void =>
    {
        // A long press on touch screens opens the context menu otherwise
        if (suppressClick)
        {
            event.preventDefault();
        }
    };

    element.addEventListener("pointerenter", onPointerEnter);
    element.addEventListener("pointerleave", onPointerLeave);
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointerup", cancelPress);
    element.addEventListener("pointercancel", cancelPress);
    element.addEventListener("click", onClick, true);
    element.addEventListener("focus", onFocus);
    element.addEventListener("blur", onBlur);
    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("contextmenu", onContextMenu);

    return {
        update: (next: HelpTarget) =>
        {
            id = typeof next === "string" ? next : next.topic;
            values = typeof next === "string" ? undefined : next.values;
            trigger = typeof next === "string" ? "hover" : next.trigger ?? "hover";
            if (help.tip?.anchor === element)
            {
                help.show(id, element, help.tip.pinned, values);
            }
        },
        destroy: () =>
        {
            window.clearTimeout(pressTimer);
            element.removeEventListener("pointerenter", onPointerEnter);
            element.removeEventListener("pointerleave", onPointerLeave);
            element.removeEventListener("pointerdown", onPointerDown);
            element.removeEventListener("pointerup", cancelPress);
            element.removeEventListener("pointercancel", cancelPress);
            element.removeEventListener("click", onClick, true);
            element.removeEventListener("focus", onFocus);
            element.removeEventListener("blur", onBlur);
            element.removeEventListener("keydown", onKeyDown);
            element.removeEventListener("contextmenu", onContextMenu);
            if (help.tip?.anchor === element)
            {
                help.hide(true);
            }
        }
    };
}
