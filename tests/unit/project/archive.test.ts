import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isZip, readZip, ZipError } from "@core/index";
import { unpackArchive } from "@project/index";
import { makeZip } from "../../helpers/zip";

const FIXTURES = join(import.meta.dirname, "..", "..", "fixtures");
const copper = readFileSync(join(FIXTURES, "proteus", "ftdi-max-bottom-copper.gbr"), "utf8");
const drill = readFileSync(join(FIXTURES, "flatcam", "flatcam-test.drl"), "utf8");

describe("zip reader", () =>
{
    it("reads stored and deflated entries, folders left out", async () =>
    {
        const zip = makeZip([
            { path: "gerber/", data: "", method: "store" },
            { path: "gerber/a.txt", data: "stored text", method: "store" },
            { path: "gerber/b.txt", data: "deflated text ".repeat(200) }
        ], "archive comment");
        expect(isZip(zip)).toBe(true);
        const { entries, skipped } = await readZip(zip);
        expect(skipped).toEqual([]);
        expect(entries.map((entry) => entry.path)).toEqual(["gerber/a.txt", "gerber/b.txt"]);
        expect(new TextDecoder().decode(entries[1]?.data)).toBe("deflated text ".repeat(200));
    });

    it("skips encrypted entries and refuses what is not a zip", async () =>
    {
        const { entries, skipped } = await readZip(makeZip([{ path: "secret.gbr", data: "x", flags: 1 }, { path: "ok.txt", data: "y" }]));
        expect(entries.map((entry) => entry.path)).toEqual(["ok.txt"]);
        expect(skipped).toEqual([{ path: "secret.gbr", reason: "encrypted" }]);
        const text = new TextEncoder().encode("G04 not a zip*\n".repeat(10));
        expect(isZip(text)).toBe(false);
        await expect(readZip(text)).rejects.toBeInstanceOf(ZipError);
    });

    it("reports a damaged archive", async () =>
    {
        const zip = makeZip([{ path: "a.gbr", data: copper }]);
        // Cut in the middle of the data: the central directory points past the end
        const damaged = new Uint8Array([...zip.subarray(0, 40), ...zip.subarray(zip.length - 22 - 46 - 5)]);
        await expect(readZip(damaged)).rejects.toBeInstanceOf(ZipError);
    });
});

describe("archive size limits", () =>
{
    const limits = { maxEntryBytes: 10_000, maxTotalBytes: 25_000, maxEntries: 5 };

    it("stops a file that grows past the limit once decompressed, whatever the archive says", async () =>
    {
        // 1 MB of zeros compresses to about a kilobyte: a small "zip bomb"
        const bomb = makeZip([{ path: "bomb.gbr", data: new Uint8Array(1_000_000) }]);
        expect(bomb.length).toBeLessThan(5000);
        await expect(readZip(bomb, limits)).rejects.toMatchObject({ code: "tooLarge" });
        await expect(readZip(makeZip([{ path: "big.gbr", data: new Uint8Array(20_000), method: "store" }]), limits)).rejects.toMatchObject({ code: "tooLarge" });
    });

    it("limits the files together and their number, archives inside the archive included", async () =>
    {
        const file = (index: number): { path: string; data: Uint8Array } => ({ path: `f${index}.gbr`, data: new Uint8Array(9000).fill(65) });
        await expect(readZip(makeZip([file(1), file(2), file(3)]), limits)).rejects.toMatchObject({ code: "tooLarge" });
        await expect(readZip(makeZip([1, 2, 3, 4, 5, 6].map((index) => ({ path: `${index}.txt`, data: "x" }))), limits)).rejects.toMatchObject({ code: "tooLarge" });
        const inner = makeZip([file(1), file(2)]);
        const nested = makeZip([{ path: "a.zip", data: inner }, { path: "b.zip", data: inner }]);
        await expect(unpackArchive(nested, limits)).rejects.toMatchObject({ code: "tooLarge" });
        expect((await unpackArchive(makeZip([{ path: "a.zip", data: inner }]), limits)).skipped).toEqual(["a.zip/f1.gbr", "a.zip/f2.gbr"]);
    });
});

describe("production archive", () =>
{
    it("keeps the Gerber and drill files, lists the others", async () =>
    {
        const inner = makeZip([{ path: "drill.drl", data: drill }]);
        const zip = makeZip([
            { path: "board/board-B_Cu.gbr", data: copper },
            { path: "board/board.gbrjob", data: "{ \"Header\": {} }" },
            { path: "board/readme.txt", data: "Order 1.6 mm FR4" },
            { path: "board/view.png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]) },
            { path: "__MACOSX/board/._board-B_Cu.gbr", data: copper },
            { path: "board/drills.zip", data: inner, method: "store" }
        ]);
        const content = await unpackArchive(zip);
        expect(content.files.map((file) => file.name)).toEqual(["board-B_Cu.gbr", "drill.drl"]);
        expect(content.files[0]?.text).toBe(copper);
        expect(content.skipped).toEqual(["board/board.gbrjob", "board/readme.txt", "board/view.png"]);
    });
});
