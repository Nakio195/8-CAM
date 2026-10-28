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
