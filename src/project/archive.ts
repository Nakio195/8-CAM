// Production files sent as a zip archive: the Gerber and drill files are taken out, the rest (drawings, job files,
// readme, assembly files) is left aside and listed, so the user knows what was not imported.

import { DEFAULT_ZIP_LIMITS, readZip, type ZipLimits } from "@core/index";
import { looksLikeExcellon } from "@parsers/excellon/index";
import { looksLikeGerber } from "@parsers/gerber/index";

/** Largest Gerber or drill file read (a dense board is a few megabytes), and largest project file, bytes. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 200 * 1024 * 1024;

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

/** Bytes decompressed so far, archives inside the archive included: they all share the limits of the outer one. */
interface Budget
{
    limits: ZipLimits;
    used: number;
}

async function collect(bytes: Uint8Array, prefix: string, depth: number, content: ArchiveContent, budget: Budget): Promise<void>
{
    const { entries, skipped } = await readZip(bytes, { ...budget.limits, maxTotalBytes: budget.limits.maxTotalBytes - budget.used });
    budget.used += entries.reduce((sum, entry) => sum + entry.data.length, 0);
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
            await collect(entry.data, `${prefix}${entry.path}/`, depth + 1, content, budget);
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

/** CAM files of a zip archive. Throws a ZipError when the archive cannot be read or is too large. */
export async function unpackArchive(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Promise<ArchiveContent>
{
    const content: ArchiveContent = { files: [], skipped: [] };
    await collect(bytes, "", 1, content, { limits, used: 0 });
    return content;
}
