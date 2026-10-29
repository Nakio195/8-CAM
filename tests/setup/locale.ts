import { vi } from "vitest";

// Node 21+ has a navigator giving the language of the system: French on a French PC, English on the CI. The reference
// drawings and texts are in French, so every test sees a French browser whatever the machine running them.
vi.stubGlobal("navigator", { ...globalThis.navigator, language: "fr-FR", languages: ["fr-FR", "fr"] });
