// Reading of zip archives (production files are often sent zipped), without any dependency: the central directory
// lists the entries, stored entries are copied, deflated ones go through the platform DecompressionStream.
// Not supported, and reported as such: ZIP64 archives, encryption, compression methods other than stored and deflate.
// Sizes are limited while decompressing, whatever the archive declares: a small "zip bomb" must not fill the memory.

export interface ZipEntry
{
    /** Path inside the archive, with "/" separators. */
    path: string;
    data: Uint8Array;
}

export type ZipErrorCode = "notZip" | "zip64" | "corrupt" | "tooLarge";

export interface ZipLimits
{
    /** Largest file once decompressed, bytes. */
    maxEntryBytes: number;
    /** All files together once decompressed, bytes. */
    maxTotalBytes: number;
    /** Files and folders listed. */
    maxEntries: number;
}

export const DEFAULT_ZIP_LIMITS: Readonly<ZipLimits> = { maxEntryBytes: 50 * 1024 * 1024, maxTotalBytes: 200 * 1024 * 1024, maxEntries: 1000 };

export class ZipError extends Error
{
    public readonly code: ZipErrorCode;

    public constructor(code: ZipErrorCode, message: string)
    {
        super(message);
        this.name = "ZipError";
        this.code = code;
    }
}

/** Entry that could not be read (encrypted, unknown method), the others are still returned. */
export interface ZipSkipped
{
    path: string;
    reason: "encrypted" | "method";
}

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** End of central directory record without comment, and the longest comment it may be followed by. */
const END_SIZE = 22;
const MAX_COMMENT = 0xffff;

/** True when the bytes start like a zip archive (local header, or the end record of an empty archive). */
export function isZip(bytes: Uint8Array): boolean
{
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
        && ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6));
}

function findEnd(view: DataView): number
{
    const last = view.byteLength - END_SIZE;
    for (let offset = last; offset >= Math.max(0, last - MAX_COMMENT); offset--)
    {
        if (view.getUint32(offset, true) === END_SIGNATURE)
        {
            return offset;
        }
    }
    throw new ZipError("notZip", "No zip end of central directory record");
}

/** Decompresses, stopping as soon as the output passes maxBytes. */
async function inflate(data: Uint8Array, maxBytes: number, path: string): Promise<Uint8Array>
{
    const reader = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;)
    {
        const { done, value } = await reader.read();
        if (done)
        {
            break;
        }
        size += value.length;
        if (size > maxBytes)
        {
            await reader.cancel();
            throw new ZipError("tooLarge", `${path} is too large once decompressed`);
        }
        chunks.push(value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks)
    {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

/** Files of a zip archive, folders left out. */
export async function readZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Promise<{ entries: ZipEntry[]; skipped: ZipSkipped[] }>
{
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < END_SIZE)
    {
        throw new ZipError("notZip", "Too short for a zip archive");
    }
    const end = findEnd(view);
    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    if (count === 0xffff || offset === 0xffffffff)
    {
        throw new ZipError("zip64", "ZIP64 archives are not supported");
    }
    if (count > limits.maxEntries)
    {
        throw new ZipError("tooLarge", `More than ${limits.maxEntries} files in the archive`);
    }
    let total = 0;
    const entries: ZipEntry[] = [];
    const skipped: ZipSkipped[] = [];
    const decoder = new TextDecoder();
    for (let index = 0; index < count; index++)
    {
        if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_SIGNATURE)
        {
            throw new ZipError("corrupt", `Central directory entry ${index + 1} is damaged`);
        }
        const flags = view.getUint16(offset + 8, true);
        const method = view.getUint16(offset + 10, true);
        const compressedSize = view.getUint32(offset + 20, true);
        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        const localOffset = view.getUint32(offset + 42, true);
        // Names are UTF-8 when flag 11 is set, CP437 otherwise: the ASCII names of CAM files read the same in both
        const path = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).replace(/\\/g, "/");
        offset += 46 + nameLength + extraLength + commentLength;
        if (path.endsWith("/"))
        {
            continue;
        }
        if ((flags & 1) !== 0)
        {
            skipped.push({ path, reason: "encrypted" });
            continue;
        }
        if (method !== 0 && method !== 8)
        {
            skipped.push({ path, reason: "method" });
            continue;
        }
        if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE)
        {
            throw new ZipError("corrupt", `Local header of ${path} is damaged`);
        }
        // The local header has its own name and extra lengths, which may differ from the central ones
        const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
        if (start + compressedSize > bytes.length)
        {
            throw new ZipError("corrupt", `${path} goes past the end of the archive`);
        }
        const raw = bytes.subarray(start, start + compressedSize);
        const room = Math.min(limits.maxEntryBytes, limits.maxTotalBytes - total);
        if (method === 0 && raw.length > room)
        {
            throw new ZipError("tooLarge", `${path} is too large`);
        }
        const data = method === 0 ? raw.slice() : await inflate(raw, room, path);
        total += data.length;
        entries.push({ path, data });
    }
    return { entries, skipped };
}
