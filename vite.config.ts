/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Architecture layers, see docs/architecture.md section 5.2
export const LAYERS = ["core", "parsers", "cam", "post", "project", "workers", "render", "ui"] as const;

export const alias = Object.fromEntries(
    LAYERS.map((layer) => [`@${layer}`, fileURLToPath(new URL(`./src/${layer}`, import.meta.url))])
);

export default defineConfig({
    plugins: [svelte()],
    build: {
        // Two pages: the application and the internal styleguide (specification 6.13)
        rollupOptions: {
            input: {
                main: fileURLToPath(new URL("./index.html", import.meta.url)),
                styleguide: fileURLToPath(new URL("./styleguide.html", import.meta.url))
            }
        }
    },
    resolve: { alias },
    worker: { format: "es" },
    test: {
        include: ["tests/unit/**/*.test.ts"],
        environment: "node",
        coverage: {
            provider: "v8",
            include: ["src/{core,parsers,cam,post}/**/*.ts"],
            thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 }
        }
    }
});
