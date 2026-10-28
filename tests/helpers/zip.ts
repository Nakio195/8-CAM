import { deflateRawSync } from "node:zlib";

// Minimal zip writer for the tests: stored or deflated entries, optional flags, a comment after the end record.

export interface TestZipEntry
{
    path: string;
    data: string | Uint8Array;
    method?: "store" | "deflate";
    /** General purpose flags of the entry (1: encrypted). */
    flags?: number;
}

export function makeZip(entries: readonly TestZipEntry[], comment = ""): Uint8Array
{
    const encoder = new TextEncoder();
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;
    for (const entry of entries)
    {
        const raw = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
        const method = entry.method === "store" ? 0 : 8;
        const body = method === 0 ? raw : new Uint8Array(deflateRawSync(raw));
        const name = encoder.encode(entry.path);
        const local = new Uint8Array(30 + name.length + body.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(6, entry.flags ?? 0, true);
        lv.setUint16(8, method, true);
        lv.setUint32(18, body.length, true);
        lv.setUint32(22, raw.length, true);
        lv.setUint16(26, name.length, true);
        local.set(name, 30);
        local.set(body, 30 + name.length);
        const central = new Uint8Array(46 + name.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(8, entry.flags ?? 0, true);
        cv.setUint16(10, method, true);
        cv.setUint32(20, body.length, true);
        cv.setUint32(24, raw.length, true);
        cv.setUint16(28, name.length, true);
        cv.setUint32(42, offset, true);
        central.set(name, 46);
        locals.push(local);
        centrals.push(central);
        offset += local.length;
    }
    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const commentBytes = encoder.encode(comment);
    const end = new Uint8Array(22 + commentBytes.length);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, commentBytes.length, true);
    end.set(commentBytes, 22);
    const parts = [...locals, ...centrals, end];
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts)
    {
        result.set(part, at);
        at += part.length;
    }
    return result;
}
