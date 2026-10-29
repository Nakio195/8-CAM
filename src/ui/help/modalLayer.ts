// A modal <dialog> (tool editor, comparator, about) is drawn by the browser in the top layer, above everything, and
// makes the rest of the page inert: a tooltip or the help panel left outside would be hidden behind it and could not be
// clicked. This action moves its element into the open modal dialog, and back where it was once none is open.
// An element marked data-modal-dock (the help panel) docks on the side of the screen: the dialog then makes room for
// it (data-help-docked, tokens.css) instead of being covered.

/** Topmost modal dialog open, if any. */
function openModal(): HTMLDialogElement | null
{
    const dialogs = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].filter((dialog) => dialog.matches(":modal"));
    return dialogs[dialogs.length - 1] ?? null;
}

/**
 * Keeps the element inside the open modal dialog while there is one. `key` changes (the tip shown, the panel topic)
 * make it check again; dialogs opening or closing are followed through the `open` attribute.
 */
export function modalLayer(element: HTMLElement, key?: unknown): { update: (next?: unknown) => void; destroy: () => void }
{
    const home = element.parentNode;
    const marker = document.createComment("modal-layer");
    home?.insertBefore(marker, element);

    const dock = element.dataset.modalDock !== undefined;
    let host: HTMLDialogElement | null = null;

    const leave = (): void =>
    {
        if (dock && host)
        {
            delete host.dataset.helpDocked;
            delete element.dataset.inModal;
        }
        host = null;
    };

    const place = (): void =>
    {
        const modal = openModal();
        if (modal && element.parentNode !== modal)
        {
            leave();
            modal.append(element);
            host = modal;
            if (dock)
            {
                modal.dataset.helpDocked = "";
                element.dataset.inModal = "";
            }
        }
        else if (!modal && element.parentNode !== home && marker.parentNode)
        {
            leave();
            marker.parentNode.insertBefore(element, marker.nextSibling);
        }
    };

    const observer = new MutationObserver(place);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
    place();
    void key;

    return {
        update: (): void => place(),
        destroy: (): void =>
        {
            observer.disconnect();
            leave();
            element.remove();
            marker.remove();
        }
    };
}
