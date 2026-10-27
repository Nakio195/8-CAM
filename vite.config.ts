/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Architecture layers, see docs/architecture.md section 5.2
export const LAYERS = ["core", "parsers", "cam", "post", "project", "workers", "render", "ui"] as const;

const alias = Object.fromEntries(
    LAYERS.map((layer) => [`@${layer}`, fileURLToPath(new URL(`./src/${layer}`, import.meta.url))])
);

export default defineConfig({
    plugins: [svelte()],
    resolve: { alias },
    worker: { format: "es" },
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "node",
        coverage: {
            provider: "v8",
            include: ["src/core/**", "src/parsers/**", "src/cam/**", "src/post/**"],
            thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 }
        }
    }
});
