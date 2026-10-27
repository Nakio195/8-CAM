// Splits a Gerber file into commands (reference: Gerber Layer Format Specification 2024.05, section 3.4;
// FlatCAM reads line by line with regular expressions, appParsers/ParseGerber.py parse_lines).
//
// Two kinds of commands exist:
// - word commands, terminated by '*': "X100Y200D01*", "G04 comment*";
// - extended commands, enclosed in '%': "%FSLAX46Y46*%", possibly holding several '*'-terminated blocks
//   as in aperture macros ("%AMDONUT*1,1,$1,0,0*1,0,$2,0,0*%") or old files ("%FSLAX24Y24*MOIN*%").
// Line breaks carry no meaning and are removed; spaces are kept only inside G04 comments.

export interface WordCommand
{
    kind: "word";
    text: string;
    /** 1-based line number where the command starts. */
    line: number;
}

export interface ExtendedCommand
{
    kind: "extended";
    /** Blocks without their terminating '*'. */
    blocks: string[];
    line: number;
}

export type GerberCommand = WordCommand | ExtendedCommand;

export interface LexResult
{
    commands: GerberCommand[];
    /** Text left at the end of the file without a terminating '*' or '%'. */
    unterminated: { text: string; line: number } | null;
}

const PERCENT = 37;
const STAR = 42;
const NEWLINE = 10;
const SPACE = 32;

const COMMENT_RE = /^G0?4(?!\d)/;

function cleanWord(raw: string): string
{
    const trimmed = raw.trim();
    if (COMMENT_RE.test(trimmed))
    {
        return trimmed.replace(/[\r\n]+/g, " ");
    }
    return trimmed.replace(/\s+/g, "");
}

function cleanBlock(raw: string): string
{
    return raw.replace(/\s+/g, "");
}

export function lexGerber(source: string): LexResult
{
    const commands: GerberCommand[] = [];
    let line = 1;
    // Start of the current segment and line of its first visible character (0 = not seen yet)
    let start = 0;
    let segmentLine = 0;
    let inExtended = false;
    let blocks: string[] = [];
    let extendedLine = 1;

    for (let i = 0; i < source.length; i++)
    {
        const code = source.charCodeAt(i);
        if (code === NEWLINE)
        {
            line++;
            continue;
        }
        if (code === PERCENT)
        {
            const segment = source.slice(start, i);
            if (inExtended)
            {
                // A last block without '*' before the closing '%' is kept as well
                const rest = cleanBlock(segment);
                if (rest.length > 0)
                {
                    blocks.push(rest);
                }
                if (blocks.length > 0)
                {
                    commands.push({ kind: "extended", blocks, line: extendedLine });
                }
                blocks = [];
                inExtended = false;
            }
            else
            {
                const text = cleanWord(segment);
                if (text.length > 0)
                {
                    commands.push({ kind: "word", text, line: segmentLine || line });
                }
                inExtended = true;
                extendedLine = line;
            }
            start = i + 1;
            segmentLine = 0;
            continue;
        }
        if (code === STAR)
        {
            const segment = source.slice(start, i);
            if (inExtended)
            {
                blocks.push(cleanBlock(segment));
            }
            else
            {
                const text = cleanWord(segment);
                if (text.length > 0)
                {
                    commands.push({ kind: "word", text, line: segmentLine || line });
                }
            }
            start = i + 1;
            segmentLine = 0;
            continue;
        }
        if (segmentLine === 0 && code > SPACE)
        {
            segmentLine = line;
        }
    }

    const rest = source.slice(start).trim();
    let unterminated: LexResult["unterminated"] = null;
    if (inExtended || rest.length > 0)
    {
        const text = (inExtended ? blocks.map((block) => block + "*").join("") : "") + cleanBlock(rest);
        unterminated = { text, line: inExtended ? extendedLine : segmentLine || line };
    }
    return { commands, unterminated };
}
