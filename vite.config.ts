/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Architecture layers, see docs/architecture.md section 5.2
export const LAYERS = ["core", "parsers", "cam", "post", "project", "workers", "render", "ui"] as const;

export const alias = Object.fromEntries(
    LAYERS.map((layer) => [`@${layer}`, fileURLToPath(new URL(`./src/${layer}`, import.meta.url))])
);

/**
 * Content security policy of the built pages: everything comes from the site itself, no script from elsewhere and none
 * written in the page. Inline styles stay allowed (Svelte style: directives write style attributes). Only in the build:
 * the development server injects its own scripts and websocket. Headers that a meta tag cannot carry
 * (frame-ancestors, X-Content-Type-Options) are set on the web server, see docs/architecture.md section 24.
 */
export const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'"
].join("; ");

function contentSecurityPolicy(): Plugin
{
    return {
        name: "8cam-content-security-policy",
        apply: "build",
        transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY }, injectTo: "head-prepend" }]
    };
}

export default defineConfig({
    plugins: [svelte(), contentSecurityPolicy()],
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
