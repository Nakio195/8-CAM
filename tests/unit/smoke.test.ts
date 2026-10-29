import { describe, expect, it } from "vitest";
import { APP_NAME, APP_VERSION } from "@core/index";
import packageJson from "../../package.json";

// Each layer must load on its own, without a browser (specification section 4: pure core)
const LAYER_ENTRIES: Record<string, () => Promise<unknown>> = {
    "core/units": () => import("@core/units/index"),
    "core/geometry": () => import("@core/geometry/index"),
    "parsers/gerber": () => import("@parsers/gerber/index"),
    "parsers/excellon": () => import("@parsers/excellon/index"),
    "cam/tools": () => import("@cam/tools/index"),
    "cam/analysis": () => import("@cam/analysis/index"),
    "cam/isolation": () => import("@cam/isolation/index"),
    "cam/drilling": () => import("@cam/drilling/index"),
    "cam/cutout": () => import("@cam/cutout/index"),
    "cam/toolpath": () => import("@cam/toolpath/index"),
    "post/engine": () => import("@post/engine/index"),
    "project": () => import("@project/index"),
    "workers": () => import("@workers/index"),
    "render": () => import("@render/index")
};

describe("project skeleton", () =>
{
    it("exposes the application name and version from package.json", () =>
    {
        expect(APP_NAME).toBe("pcbCAM");
        expect(APP_VERSION).toBe(packageJson.version);
    });

    for (const [name, load] of Object.entries(LAYER_ENTRIES))
    {
        it(`loads ${name} in Node`, async () =>
        {
            await expect(load()).resolves.toBeDefined();
        });
    }
});
