import { describe, expect, it } from "vitest";
import { moveStatistics, type Move } from "@cam/toolpath/index";
import { defaultLibrary, type Tool } from "@cam/tools/index";
import {
    BUILT_IN_PROFILES,
    checkGcode,
    checkJob,
    DEFAULT_MACHINE,
    exportMachine,
    exportProfile,
    importMachine,
    importProfile,
    readGcode,
    sampleJob as sampleJobOf,
    sanitizeComment,
    validateMachine,
    validateProfile,
    writeGcode,
    type PostJob,
    type PostProfile
} from "@post/index";

function tool(id: string): Tool
{
    const found = defaultLibrary().find((entry) => entry.id === id);
    if (!found)
    {
        throw new Error(`Missing tool ${id}`);
    }
    return found;
}

function profile(id: string): PostProfile
{
    const found = BUILT_IN_PROFILES.find((entry) => entry.id === id);
    if (!found)
    {
        throw new Error(`Missing profile ${id}`);
    }
    return found;
}

/** The sample job of the profile preview, with the built-in tools. */
function sampleJob(): PostJob
{
    const job = sampleJobOf({
        isolation: { tool: tool("vbit-30-0.2"), label: "V-bit 30° 0,2 mm" },
        drill: { tool: tool("drill-0.8"), label: "Foret 0,8 mm" },
        cutout: { tool: tool("cornmill-1.5"), label: "Fraise maïs 1,5 mm" }
    }, new Date(2026, 9, 28, 14, 5), "0.0.1");
    return { ...job, name: "Golden test board", operations: job.operations.map((operation, index) => ({ ...operation, label: ["Isolation, bottom copper", "Drilling", "Cutout"][index] ?? operation.label })) };
}

describe("built-in profiles", () =>
{
    it("are valid and survive an export and import", () =>
    {
        expect(BUILT_IN_PROFILES.map((entry) => entry.id)).toEqual(["grbl-1.1", "marlin", "linuxcnc"]);
        for (const entry of BUILT_IN_PROFILES)
        {
            expect(validateProfile(entry)).toEqual([]);
            const imported = importProfile(exportProfile(entry));
            expect(imported).toEqual({ profile: { ...entry, builtIn: false } });
        }
    });

    it("reject files that are not profiles", () =>
    {
        expect(importProfile("{")).toEqual({ issues: [{ code: "invalidJson", field: "format" }] });
        expect(importProfile("{\"format\":\"8cam-tools\"}")).toEqual({ issues: [{ code: "wrongFormat", field: "format" }] });
        const broken = { ...profile("grbl-1.1"), commands: { rapid: "G00; M30", linear: "G01", arcCW: "G02", arcCCW: "G03" }, decimals: { coordinates: 9, feed: 1 } };
        expect(validateProfile(broken).map((issue) => issue.code)).toEqual(["invalidDecimals", "invalidCommand"]);
    });
});

describe("golden G-code", () =>
{
    for (const entry of BUILT_IN_PROFILES)
    {
        it(`writes the reference file with ${entry.name}`, async () =>
        {
            const output = writeGcode(sampleJob(), entry, DEFAULT_MACHINE);
            await expect(output.text).toMatchFileSnapshot(`../../golden/${entry.id}.nc`);
            expect(output.forbidden).toEqual([]);
        });

        it(`passes the safety checks once read back (${entry.name})`, () =>
        {
            const job = sampleJob();
            const output = writeGcode(job, entry, DEFAULT_MACHINE);
            // Lowest travel height and highest safe height of the tools used
            const travelZ = Math.min(...job.operations.map((operation) => operation.tool.travelZ));
            const safeZ = Math.max(...job.operations.map((operation) => operation.tool.safeZ));
            expect(checkGcode(output.text, travelZ, safeZ)).toEqual([]);
            expect(readGcode(output.text).unknown).toEqual([]);
            // The text moves the tool exactly as the moves do: same cut length
            const written = moveStatistics(readGcode(output.text).moves, 1000, { x: 0, y: 0, z: safeZ });
            const expected = job.operations.reduce((sum, operation) => sum + moveStatistics(operation.moves, 1000, { x: 0, y: 0, z: safeZ }).cutLength, 0);
            expect(written.cutLength).toBeCloseTo(expected, 1);
        });
    }

    it("follows each controller's dialect", () =>
    {
        const job = sampleJob();
        const grbl = writeGcode(job, profile("grbl-1.1"), DEFAULT_MACHINE).text;
        const marlin = writeGcode(job, profile("marlin"), DEFAULT_MACHINE).text;
        const linuxcnc = writeGcode(job, profile("linuxcnc"), DEFAULT_MACHINE).text;
        // GRBL: manual tool change with a pause, never M6; feeds only when they change (cuts along a loop carry none)
        expect(grbl).toMatch(/^M0$/m);
        expect(grbl).not.toMatch(/M0?6\b/);
        expect((grbl.match(/^G01 [XY][^F]*$/gm) ?? []).length).toBeGreaterThan(5);
        // Marlin: ';' comments, feed on every move, M400 before stopping the spindle, dwell in milliseconds
        expect(marlin).toMatch(/^; 8-CAM 0\.0\.1 - Marlin$/m);
        expect(marlin).toMatch(/^M400\nM5$/m);
        expect(marlin).toMatch(/^G4 P500$/m);
        expect(marlin).toMatch(/^G0 Z15\.0000 F1000\.0$/m);
        expect((marlin.match(/^G1 .*F150\.0$/gm) ?? []).length).toBeGreaterThan(5);
        // LinuxCNC: T M6 with the tool number, dwell in seconds
        expect(linuxcnc).toMatch(/^T2 M06$/m);
        expect(linuxcnc).toMatch(/^G04 P0\.5$/m);
        // Every file says what it is and when it was made
        expect(grbl).toMatch(/^\(Date: 2026-10-28 14:05\)$/m);
        expect(grbl).toMatch(/^\(T1 V-bit 30 deg 0,2 mm, diameter 3\.1750 mm\)$/m);
    });
});

describe("profile options", () =>
{
    const job: PostJob = {
        name: "Options",
        version: "0.0.1",
        date: new Date(2026, 0, 1),
        operations: [{
            label: "Arc",
            tool: tool("endmill-0.8"),
            toolLabel: "Fraise 0,8 mm",
            moves: [
                { kind: "rapid", z: 15 },
                { kind: "rapid", x: 10, y: 0 },
                { kind: "rapid", z: 2 },
                { kind: "linear", z: -0.1, feed: 50 },
                { kind: "arc", cw: false, x: -10, y: 0, i: -10, j: 0, feed: 120 },
                { kind: "rapid", z: 15 }
            ] satisfies Move[]
        }]
    };

    it("numbers the lines and writes inches", () =>
    {
        const text = writeGcode(job, { ...profile("linuxcnc"), lineNumbers: { enabled: true, start: 100, step: 5 }, units: "inch", header: ["G20", "G90"] }, DEFAULT_MACHINE).text;
        expect(text).toMatch(/^N100 G20$/m);
        expect(text).toMatch(/^N105 G90$/m);
        expect(text).toMatch(/^N\d+ G00 X0\.3937 Y0\.0000$/m);
        expect(readGcode(text).moves.find((move) => move.kind === "rapid" && move.x !== undefined)).toMatchObject({ x: expect.closeTo(10, 2) as number });
    });

    it("writes arcs natively or as short segments within 5 µm", () =>
    {
        const native = writeGcode(job, profile("grbl-1.1"), DEFAULT_MACHINE).text;
        expect(native).toMatch(/^G03 X-10\.0000 Y0\.0000 I-10\.0000 J0\.0000 F120\.0$/m);
        const segments = writeGcode(job, { ...profile("grbl-1.1"), arcs: "linearize" }, DEFAULT_MACHINE).text;
        expect(segments).not.toMatch(/G03/);
        const points = readGcode(segments).moves.flatMap((move) => (move.kind === "linear" && move.x !== undefined ? [move] : []));
        expect(points.length).toBeGreaterThan(40);
        for (const point of points)
        {
            expect(Math.hypot(point.x ?? 0, point.y ?? 0)).toBeCloseTo(10, 3);
        }
        // Chords are a little shorter than the arc they replace: 5 mm of arc chord error on a 10 mm radius is 0.04 %
        expect(moveStatistics(readGcode(segments).moves).cutLength).toBeCloseTo(Math.PI * 10 + 2.1, 1);
    });

    it("reports the forbidden words a profile cannot send", () =>
    {
        const output = writeGcode(job, { ...profile("grbl-1.1"), footer: ["M6", "M02"] }, DEFAULT_MACHINE);
        expect(output.forbidden.map((entry) => entry.word)).toEqual(["M6"]);
    });

    it("keeps comments plain ASCII without nested parentheses", () =>
    {
        expect(sanitizeComment("Fraise maïs Ø1,5 mm (détourage); 30°")).toBe("Fraise mais D1,5 mm [detourage], 30 deg");
    });
});

describe("machine profile and job checks", () =>
{
    it("validates and exchanges the machine profile", () =>
    {
        expect(validateMachine(DEFAULT_MACHINE)).toEqual([]);
        expect(validateMachine({ ...DEFAULT_MACHINE, travelX: 0, safeZ: 60 }).map((issue) => issue.code)).toEqual(["notPositive", "safeAboveTravel"]);
        expect(importMachine(exportMachine({ ...DEFAULT_MACHINE, name: "Shapeoko" }))).toEqual({ machine: { ...DEFAULT_MACHINE, name: "Shapeoko" } });
        expect(importMachine("[1]")).toEqual({ issues: [{ code: "invalidFormat", field: "format" }] });
    });

    it("finds nothing to say about a sound job", () =>
    {
        expect(checkJob(sampleJob(), DEFAULT_MACHINE)).toEqual([]);
    });

    it("reports work too large, too deep, too fast or unsafe for the machine", () =>
    {
        const job = sampleJob();
        const small = { ...DEFAULT_MACHINE, travelX: 8, maxFeedXY: 100, maxSpindleSpeed: 5000, travelZ: 10 };
        const codes = checkJob(job, small).map((issue) => `${issue.code}:${issue.operation ?? "job"}:${issue.severity}`);
        expect(codes).toContain("tooWideForMachine:job:error");
        expect(codes).toContain("feedAboveMachine:0:warning");
        expect(codes).toContain("spindleAboveMachine:2:warning");
        expect(codes).toContain("safeAboveMachine:0:error");
        const first = job.operations[0];
        if (!first)
        {
            throw new Error("Missing operation");
        }
        const unsafe: PostJob = { ...job, operations: [{ ...first, moves: [{ kind: "rapid", z: 0.5 }, { kind: "rapid", x: 5, y: 5 }, { kind: "linear", z: -4, feed: 2 }] }] };
        expect(checkJob(unsafe, DEFAULT_MACHINE).map((issue) => issue.code).sort())
            .toEqual(["depthAberrant", "endBelowSafe", "feedAberrant", "rapidBelowTravel"]);
    });
});
