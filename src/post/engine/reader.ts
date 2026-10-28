// Minimal G-code reader: turns written G-code back into moves, so the machine safety rules (specification section 7)
// are checked on the very text sent to the machine, not only on the moves it was written from. It understands what
// the profiles write: G0 / G1 / G2 / G3 (modal), X Y Z I J F, G4, M3 / M4 / M5, T, M6, comments and line numbers.

import type { Move } from "@cam/toolpath/index";

const MM_PER_INCH = 25.4;

export interface ReadGcode
{
    moves: Move[];
    /** Lines with words the reader does not know (not an error: they are reported for the tests). */
    unknown: number[];
}

export function readGcode(text: string): ReadGcode
{
    const moves: Move[] = [];
    const unknown: number[] = [];
    let motion: "rapid" | "linear" | "cw" | "ccw" = "rapid";
    let feed = 0;
    let scale = 1;
    const lines = text.split(/\r?\n/);
    lines.forEach((raw, index) =>
    {
        const line = raw.replace(/\(.*?\)/g, "").replace(/;.*$/, "").trim().toUpperCase();
        // A pause with a message (Marlin "M0 Change to tool..."): the message is free text, not G-code words
        if (line === "" || /^(N\d+\s*)?M0*\s+[^\d\s]/.test(line))
        {
            return;
        }
        const words = [...line.matchAll(/([A-Z])\s*([-+]?\d*\.?\d+)/g)].map((match) => ({ letter: match[1] ?? "", value: Number(match[2]) }));
        const axes: Partial<Record<"X" | "Y" | "Z" | "I" | "J", number>> = {};
        let dwell: number | null = null;
        let isDwell = false;
        for (const { letter, value } of words)
        {
            switch (letter)
            {
                case "N":
                    break;
                case "G":
                    if (value === 0)
                    {
                        motion = "rapid";
                    }
                    else if (value === 1)
                    {
                        motion = "linear";
                    }
                    else if (value === 2)
                    {
                        motion = "cw";
                    }
                    else if (value === 3)
                    {
                        motion = "ccw";
                    }
                    else if (value === 4)
                    {
                        isDwell = true;
                    }
                    else if (value === 20)
                    {
                        scale = MM_PER_INCH;
                    }
                    else if (value === 21)
                    {
                        scale = 1;
                    }
                    else if (![17, 40, 49, 54, 90, 94].includes(value))
                    {
                        unknown.push(index + 1);
                    }
                    break;
                case "M":
                    if (value === 3 || value === 4)
                    {
                        moves.push({ kind: "spindle", on: true });
                    }
                    else if (value === 5)
                    {
                        moves.push({ kind: "spindle", on: false });
                    }
                    else if (value === 6)
                    {
                        moves.push({ kind: "toolChange", toolId: "" });
                    }
                    else if (![0, 2, 30, 400].includes(value))
                    {
                        unknown.push(index + 1);
                    }
                    break;
                case "F":
                    feed = value * scale;
                    break;
                case "P":
                case "S":
                    // Dwell length (seconds or milliseconds depending on the controller) or spindle speed
                    if (isDwell)
                    {
                        dwell = value;
                    }
                    break;
                case "T":
                    break;
                case "X":
                case "Y":
                case "Z":
                case "I":
                case "J":
                    axes[letter] = value * scale;
                    break;
                default:
                    unknown.push(index + 1);
            }
        }
        if (isDwell)
        {
            moves.push({ kind: "dwell", seconds: dwell ?? 0 });
            return;
        }
        if (axes.X === undefined && axes.Y === undefined && axes.Z === undefined)
        {
            return;
        }
        if (motion === "rapid")
        {
            moves.push({ kind: "rapid", x: axes.X, y: axes.Y, z: axes.Z });
        }
        else if (motion === "linear")
        {
            moves.push({ kind: "linear", x: axes.X, y: axes.Y, z: axes.Z, feed });
        }
        else
        {
            moves.push({ kind: "arc", cw: motion === "cw", x: axes.X ?? 0, y: axes.Y ?? 0, i: axes.I ?? 0, j: axes.J ?? 0, feed });
        }
    });
    return { moves, unknown };
}
