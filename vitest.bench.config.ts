import { defineConfig } from "vitest/config";
import { alias } from "./vite.config.ts";

// Performance measurements (specification section 8), run with `npm run bench`, not part of `npm test`
export default defineConfig({
    resolve: { alias },
    test: {
        include: ["tests/bench/**/*.perf.ts"],
        testTimeout: 120_000
    }
});
