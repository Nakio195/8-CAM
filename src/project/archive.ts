// Production files sent as a zip archive: the Gerber and drill files are taken out, the rest (drawings, job files,
// readme, assembly files) is left aside and listed, so the user knows what was not imported.

import { readZip } from "@core/index";
import { looksLikeExcellon } from "@parsers/excellon/index";
import { looksLikeGerber } from "@parsers/gerber/index";

export interface ArchiveContent
{
    /** CAM files found, by file name (folders of the archive left out), in the order of the archive. */
    files: { name: string; text: string }[];
    /** Paths of the other files, not imported. */
    skipped: string[];
}

/** Archives inside the archive are opened too, down to this depth (some boards ship one zip per side). */
const MAX_DEPTH = 2;

function isZipName(name: string): boolean
{
    return /\.zip$/i.test(name);
}

/** Text of a CAM file; binary files (pictures, PDF) are recognised by their NUL bytes. */
function camText(data: Uint8Array): string | null
{
    if (data.subarray(0, 1024).includes(0))
    {
        return null;
    }
    const text = new TextDecoder().decode(data);
    return looksLikeGerber(text) || looksLikeExcellon(text) ? text : null;
}

async function collect(bytes: Uint8Array, prefix: string, depth: number, content: ArchiveContent): Promise<void>
{
    const { entries, skipped } = await readZip(bytes);
    content.skipped.push(...skipped.map((entry) => prefix + entry.path));
    for (const entry of entries)
    {
        const name = entry.path.slice(entry.path.lastIndexOf("/") + 1);
        // Resource forks added by macOS and hidden files are not part of the board
        if (entry.path.startsWith("__MACOSX/") || name.startsWith("."))
        {
            continue;
        }
        if (isZipName(name) && depth < MAX_DEPTH)
        {
            await collect(entry.data, `${prefix}${entry.path}/`, depth + 1, content);
            continue;
        }
        const text = camText(entry.data);
        if (text === null)
        {
            content.skipped.push(prefix + entry.path);
        }
        else
        {
            content.files.push({ name, text });
        }
    }
}

/** CAM files of a zip archive. Throws a ZipError when the archive cannot be read. */
export async function unpackArchive(bytes: Uint8Array): Promise<ArchiveContent>
{
    const content: ArchiveContent = { files: [], skipped: [] };
    await collect(bytes, "", 1, content);
    return content;
}
