import { arcBetween, circlePath, rectanglePath, type Polygon, type Polyline } from "@core/geometry/index";
import { mmToInternal } from "@core/units/index";

const MM = mmToInternal(1);

export interface DenseBoard
{
    pads: Polygon[];
    /** Track centre lines grouped by width (one Gerber aperture per width). */
    tracksByWidth: Map<number, Polyline[]>;
    trackSegmentCount: number;
}

/** Small deterministic pseudo-random generator (mulberry32) so every run measures the same board. */
function createRandom(seed: number): () => number
{
    let state = seed;
    return () =>
    {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Synthetic dense 100 x 100 mm board: a 2 mm pitch grid of 2 500 pads (round and rectangular),
 * 0.2 / 0.3 mm tracks with doglegs between neighbours and a few curved tracks, about 0.3 mm clearance.
 */
export function createDenseBoard(): DenseBoard
{
    const random = createRandom(8);
    const pitch = 2 * MM;
    const count = 50;
    const pads: Polygon[] = [];
    const thin: Polyline[] = [];
    const wide: Polyline[] = [];
    let trackSegmentCount = 0;

    for (let row = 0; row < count; row++)
    {
        for (let column = 0; column < count; column++)
        {
            const x = column * pitch + pitch / 2;
            const y = row * pitch + pitch / 2;
            if (random() < 0.5)
            {
                pads.push({ outer: circlePath({ x, y }, 0.5 * MM), holes: [] });
            }
            else
            {
                pads.push({ outer: rectanglePath(x - 0.5 * MM, y - 0.3 * MM, x + 0.5 * MM, y + 0.3 * MM), holes: [] });
            }

            const target = random() < 0.7 ? thin : wide;
            // Horizontal track to the right neighbour with a dogleg
            if (column + 1 < count && random() < 0.6)
            {
                const offset = (random() - 0.5) * 0.4 * MM;
                target.push([
                    { x, y },
                    { x: x + 0.6 * MM, y: y + offset },
                    { x: x + 1.4 * MM, y: y + offset },
                    { x: x + pitch, y }
                ]);
                trackSegmentCount += 3;
            }
            // Vertical track to the upper neighbour
            if (row + 1 < count && random() < 0.4)
            {
                target.push([{ x, y }, { x, y: y + pitch }]);
                trackSegmentCount += 1;
            }
            // Occasional curved track (G02 / G03 arcs)
            if (row + 1 < count && column + 1 < count && random() < 0.05)
            {
                const arc = arcBetween({ x, y }, { x: x + pitch, y: y + pitch }, { x: x + pitch, y }, true);
                thin.push(arc);
                trackSegmentCount += arc.length - 1;
            }
        }
    }

    const tracksByWidth = new Map<number, Polyline[]>([
        [0.2 * MM, thin],
        [0.3 * MM, wide]
    ]);
    return { pads, tracksByWidth, trackSegmentCount };
}
