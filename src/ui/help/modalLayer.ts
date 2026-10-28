// A modal <dialog> (tool editor, comparator, about) is drawn by the browser in the top layer, above everything, and
// makes the rest of the page inert: a tooltip or the help panel left outside would be hidden behind it and could not be
// clicked. This action moves its element into the open modal dialog, and back where it was once none is open.

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

    const place = (): void =>
    {
        const modal = openModal();
        if (modal && element.parentNode !== modal)
        {
            modal.append(element);
        }
        else if (!modal && element.parentNode !== home && marker.parentNode)
        {
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
            element.remove();
            marker.remove();
        }
    };
}
