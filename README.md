# 8-CAM

PCB CAM in the browser for 8 Fablab Drôme: load Gerber and Excellon files, generate isolation, drilling and cutout
toolpaths, preview them and export G-code for GRBL, Marlin or LinuxCNC machines. Everything runs client-side.

Functional reference: FlatCAM Plus. Specification: [`specs/PROMPT_PCB_CAM_WEB.md`](specs/PROMPT_PCB_CAM_WEB.md).
Architecture and decisions: [`docs/architecture.md`](docs/architecture.md).

## Development

```bash
npm install
npm run dev        # development server
npm run check      # lint + typecheck + tests
npm run test:coverage
npm run build
```

Code conventions (specification section 4): Allman braces, private members prefixed with `m`, English identifiers
and comments, user-facing text in `src/ui/i18n/*.json`. ESLint enforces them (`npm run format` fixes most issues).
