<script lang="ts">
    import { untrack } from "svelte";
    import { validateProfile, type CommentStyle, type PostProfile } from "@post/index";
    import { help } from "../help";
    import { i18n } from "../state/i18n.svelte";
    import { machineState } from "../state/machine.svelte";
    import Callout from "../components/base/Callout.svelte";
    import NumberField from "../components/base/NumberField.svelte";

    // Fields of a user post-processor profile (specification 6.8). Built-in profiles are shown by the panel and copied
    // before editing. Every valid change is saved at once, so the preview follows the typing.
    let { profile }: { profile: PostProfile } = $props();

    const t = i18n.t;
    const TEMPLATES = ["fileHeader", "header", "toolChange", "spindleOn", "spindleOff", "dwell", "footer"] as const;
    type TemplateField = (typeof TEMPLATES)[number];

    let draft = $state(untrack(() => structuredClone($state.snapshot(profile))));
    let templates = $state(untrack(() => Object.fromEntries(TEMPLATES.map((field) => [field, (profile[field] ?? []).join("\n")])) as Record<TemplateField, string>));
    let forbidden = $state(untrack(() => profile.forbidden.join(", ")));

    let assembled = $derived<PostProfile>({
        ...draft,
        ...Object.fromEntries(TEMPLATES.map((field) => [field, templates[field].split("\n").map((line) => line.trimEnd())])) as Record<TemplateField, string[]>,
        forbidden: forbidden.split(/[,\s]+/).map((word) => word.trim().toUpperCase()).filter((word) => word !== "")
    });
    let issues = $derived(validateProfile(assembled));

    $effect(() =>
    {
        const next = $state.snapshot(assembled) as PostProfile;
        if (validateProfile(next).length === 0 && JSON.stringify(next) !== JSON.stringify(untrack(() => profile)))
        {
            untrack(() => machineState.saveProfile(next));
        }
    });

    const LABELS: Record<TemplateField, "post.fileHeader" | "post.header" | "post.toolChange" | "post.spindleOn" | "post.spindleOff" | "post.dwell" | "post.footer"> = {
        fileHeader: "post.fileHeader",
        header: "post.header",
        toolChange: "post.toolChange",
        spindleOn: "post.spindleOn",
        spindleOff: "post.spindleOff",
        dwell: "post.dwell",
        footer: "post.footer"
    };
    const TOPICS: Record<TemplateField, string> = {
        fileHeader: "postFileHeader",
        header: "postHeader",
        toolChange: "postToolChange",
        spindleOn: "postSpindle",
        spindleOff: "postSpindle",
        dwell: "postDwell",
        footer: "postFooter"
    };
</script>

<div class="editor">
    <label class="field">
        <span>{t("post.name")}</span>
        <input type="text" bind:value={draft.name} use:help={"postName"} />
    </label>
    <div class="grid">
        <label class="field">
            <span>{t("post.units")}</span>
            <select bind:value={draft.units} use:help={"postUnits"}>
                <option value="mm">mm (G21)</option>
                <option value="inch">{t("post.inch")} (G20)</option>
            </select>
        </label>
        <label class="field">
            <span>{t("post.comments")}</span>
            <select value={draft.comments} use:help={"postComments"}
                onchange={(event) => (draft.comments = event.currentTarget.value as CommentStyle)}>
                <option value="parentheses">( … )</option>
                <option value="semicolon">; …</option>
                <option value="none">{t("post.commentsNone")}</option>
            </select>
        </label>
        <NumberField id="post-decimals" label={t("post.decimals")} help="postDecimals" step={1} min={0} max={6}
            bind:value={draft.decimals.coordinates} helpLabel={`${t("header.help")} : ${t("help.postDecimals.title")}`} />
        <NumberField id="post-feed-decimals" label={t("post.feedDecimals")} help="postDecimals" step={1} min={0} max={6}
            bind:value={draft.decimals.feed} helpLabel={`${t("header.help")} : ${t("help.postDecimals.title")}`} />
        <label class="field">
            <span>{t("post.arcs")}</span>
            <select bind:value={draft.arcs} use:help={"postArcs"}>
                <option value="native">{t("post.arcsNative")}</option>
                <option value="linearize">{t("post.arcsLinearize")}</option>
            </select>
        </label>
        <label class="field">
            <span>{t("post.feeds")}</span>
            <select bind:value={draft.feeds} use:help={"postFeeds"}>
                <option value="modal">{t("post.feedsModal")}</option>
                <option value="everyLine">{t("post.feedsEveryLine")}</option>
            </select>
        </label>
    </div>
    <label class="field">
        <span>{t("post.fileExtension")}</span>
        <input type="text" class="mono" bind:value={draft.fileExtension} size="6" use:help={"postFileExtension"} />
    </label>
    <label class="check" use:help={"postRapidFeed"}>
        <input type="checkbox" bind:checked={draft.rapidWithFeed} />
        {t("post.rapidWithFeed")}
    </label>
    <label class="check" use:help={"postLineNumbers"}>
        <input type="checkbox" bind:checked={draft.lineNumbers.enabled} />
        {t("post.lineNumbers")}
    </label>
    {#if draft.lineNumbers.enabled}
        <div class="grid">
            <NumberField id="post-line-start" label={t("post.lineStart")} help="postLineNumbers" step={1} min={0}
                bind:value={draft.lineNumbers.start} helpLabel={`${t("header.help")} : ${t("help.postLineNumbers.title")}`} />
            <NumberField id="post-line-step" label={t("post.lineStep")} help="postLineNumbers" step={1} min={1}
                bind:value={draft.lineNumbers.step} helpLabel={`${t("header.help")} : ${t("help.postLineNumbers.title")}`} />
        </div>
    {/if}
    <fieldset class="commands" use:help={"postCommands"}>
        <legend>{t("post.commands")}</legend>
        <label>{t("post.rapid")} <input type="text" class="mono" bind:value={draft.commands.rapid} size="4" /></label>
        <label>{t("post.linear")} <input type="text" class="mono" bind:value={draft.commands.linear} size="4" /></label>
        <label>{t("post.arcCW")} <input type="text" class="mono" bind:value={draft.commands.arcCW} size="4" /></label>
        <label>{t("post.arcCCW")} <input type="text" class="mono" bind:value={draft.commands.arcCCW} size="4" /></label>
    </fieldset>
    {#each TEMPLATES as field (field)}
        <label class="field">
            <span>{t(LABELS[field])}</span>
            <textarea class="mono" rows={Math.max(2, templates[field].split("\n").length)} bind:value={templates[field]}
                use:help={TOPICS[field]} spellcheck="false"></textarea>
        </label>
    {/each}
    <label class="field">
        <span>{t("post.forbidden")}</span>
        <input type="text" class="mono" bind:value={forbidden} use:help={"postForbidden"} />
    </label>
    <p class="note">{t("post.variablesNote")}</p>
    {#each issues as issue (issue.code + issue.field)}
        <Callout tone="error">{t(`post.issue.${issue.code}`)}</Callout>
    {/each}
</div>

<style>
    .editor
    {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .field
    {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-weight: 600;
    }

    input[type="text"],
    select,
    textarea
    {
        padding: 6px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        font-weight: 400;
    }

    textarea
    {
        resize: vertical;
    }

    .mono
    {
        font-family: var(--font-mono);
        font-size: 12px;
    }

    .grid
    {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    .check
    {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .commands
    {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 12px;
        margin: 0;
        padding: 6px 8px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
    }

    legend
    {
        font-weight: 600;
    }

    .commands label
    {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }

    .note
    {
        margin: 0;
        font-size: 11px;
        color: var(--text-muted);
    }
</style>
