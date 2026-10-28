<script lang="ts">
    import { i18n } from "../state/i18n.svelte";

    // G-code with syntax colours (specification 6.9): motion words, machine words, coordinates, feeds, comments.
    let { text, label }: { text: string; label: string } = $props();

    const t = i18n.t;
    type Kind = "comment" | "motion" | "machine" | "axis" | "feed" | "other" | "number";

    /** Splits a line into coloured pieces; spaces stay in the plain pieces. */
    function tokens(line: string): { kind: Kind | null; text: string }[]
    {
        const pieces: { kind: Kind | null; text: string }[] = [];
        const pattern = /(\(.*?\)|;.*$)|([GM]\d+(?:\.\d+)?)|([XYZIJ][-+]?\d*\.?\d+)|(F[-+]?\d*\.?\d+)|(N\d+)|([A-Z][-+]?\d*\.?\d+)/gi;
        let last = 0;
        for (const match of line.matchAll(pattern))
        {
            const index = match.index;
            if (index > last)
            {
                pieces.push({ kind: null, text: line.slice(last, index) });
            }
            const [word, comment, command, axis, feed, number] = match;
            const kind: Kind = comment ? "comment"
                : command ? (command.toUpperCase().startsWith("G") ? "motion" : "machine")
                    : axis ? "axis" : feed ? "feed" : number ? "number" : "other";
            pieces.push({ kind, text: word });
            last = index + word.length;
        }
        if (last < line.length)
        {
            pieces.push({ kind: null, text: line.slice(last) });
        }
        return pieces;
    }

    let lines = $derived(text.replace(/\n$/, "").split("\n"));
</script>

<pre class="gcode" aria-label={label}>{#each lines as line, index (index)}<span class="line"><span class="number" aria-hidden="true">{index + 1}</span>{#each tokens(line) as piece, position (position)}{#if piece.kind}<span class={piece.kind}>{piece.text}</span>{:else}{piece.text}{/if}{/each}</span>
{/each}</pre>
<p class="note">{t("post.previewLines", { count: lines.length })}</p>

<style>
    .gcode
    {
        max-height: 340px;
        margin: 0;
        padding: 8px 0;
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface-sunken);
        font-family: var(--font-mono);
        font-size: 12px;
        line-height: 1.45;
        counter-reset: line;
    }

    /* Inline: the line breaks of the text separate the lines, so a copy of the preview is the G-code itself */
    .line
    {
        white-space: pre;
    }

    .number
    {
        display: inline-block;
        width: 3.5em;
        margin-right: 8px;
        padding-right: 6px;
        color: var(--text-muted);
        text-align: right;
        user-select: none;
    }

    .comment
    {
        color: var(--text-muted);
        font-style: italic;
    }

    .motion
    {
        color: var(--brand-rouge-strong);
        font-weight: 700;
    }

    .machine
    {
        color: var(--accent-cowork);
        font-weight: 700;
    }

    .axis
    {
        color: var(--text);
    }

    .feed,
    .other
    {
        color: #0f8a6c;
    }

    .note
    {
        margin: 2px 0 0;
        font-size: 11px;
        color: var(--text-muted);
    }
</style>
