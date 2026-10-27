import js from "@eslint/js";
import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import svelteConfig from "./svelte.config.js";

// Allowed dependencies between layers (docs/architecture.md section 5.2).
// A layer may only import the layers listed here; everything else is an upward import and is rejected.
const ALLOWED_IMPORTS = {
    core: [],
    parsers: ["core"],
    cam: ["core", "parsers"],
    post: ["core", "cam"],
    project: ["core", "parsers", "cam", "post"],
    workers: ["core", "parsers", "cam", "post", "project"],
    render: ["core", "parsers", "cam", "project"],
    ui: ["core", "parsers", "cam", "post", "project", "workers", "render"]
};

function layerRule(layer, allowed)
{
    const forbidden = Object.keys(ALLOWED_IMPORTS).filter((other) => other !== layer && !allowed.includes(other));
    const patterns = forbidden.length === 0 ? [] : [{
        group: forbidden.flatMap((other) => [`@${other}`, `@${other}/**`, `**/${other}/**`]),
        message: `Layer '${layer}' may only import: ${allowed.join(", ") || "nothing"}.`
    }];
    return {
        files: [`src/${layer}/**/*.{ts,svelte}`],
        rules: { "no-restricted-imports": ["error", { patterns }] }
    };
}

// Code conventions, specification section 4
const conventionRules = {
    "@stylistic/brace-style": ["error", "allman", { allowSingleLine: true }],
    "@stylistic/indent": ["error", 4, { SwitchCase: 1 }],
    "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
    "@stylistic/semi": ["error", "always"],
    "@stylistic/comma-dangle": ["error", "never"],
    "@stylistic/eol-last": ["error", "always"],
    "@stylistic/no-trailing-spaces": "error",
    "curly": ["error", "all"],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/naming-convention": ["error",
        {
            selector: ["classProperty", "parameterProperty", "accessor"],
            modifiers: ["private"],
            format: ["PascalCase"],
            prefix: ["m"]
        },
        {
            selector: ["classProperty", "parameterProperty", "accessor"],
            modifiers: ["protected"],
            format: ["PascalCase"],
            prefix: ["m"]
        },
        {
            selector: ["classProperty", "accessor"],
            modifiers: ["public"],
            format: ["camelCase", "UPPER_CASE"]
        },
        {
            selector: "classMethod",
            format: ["camelCase"]
        },
        {
            selector: ["class", "interface", "typeAlias", "enum"],
            format: ["PascalCase"]
        }
    ]
};

export default tseslint.config(
    { ignores: ["dist/", "coverage/", "node_modules/", "ressources/"] },
    js.configs.recommended,
    ...tseslint.configs.strict,
    ...svelte.configs.recommended,
    {
        languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.worker } },
        plugins: { "@stylistic": stylistic },
        rules: conventionRules
    },
    {
        files: ["**/*.svelte", "**/*.svelte.ts"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                extraFileExtensions: [".svelte"],
                parser: tseslint.parser,
                svelteConfig
            }
        }
    },
    ...Object.entries(ALLOWED_IMPORTS).map(([layer, allowed]) => layerRule(layer, allowed))
);
