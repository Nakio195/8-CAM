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

## Starting 8-CAM

Opening `index.html` directly shows a blank page: browsers refuse ES modules and Web Workers from `file://`, so the
application must be served. On Windows, double-click **`Lancer 8-CAM.bat`**: it installs the dependencies the first
time, builds the application, serves it at http://localhost:4173 and opens the browser. Keep its window open while
using 8-CAM; closing it stops 8-CAM. Node.js (LTS) must be installed. Elsewhere: `npm run build` then
`npm run preview`.

## Using 8-CAM

1. Open or drop the Gerber files of the board (copper, outline) and its drill files, or load the example board.
2. Read the analysis: tightest gap, thinnest track, hole sizes, and the tools that fit.
3. In the Machining tab, create the isolation, drilling and cutout operations (the recommended tools are chosen).
4. Write the G-code with the profile of your machine (Machine tab), watch the simulation, download the files.
5. Save the project (`.8cam.json`) to find everything again, source files included.

The help panel (book icon) holds the step by step guide "Ma première carte" and the illustrated glossary; every
button and field has its own tooltip.

## Deployment

`npm run build` writes a static site to `dist/`: copy it to any web server (no back end, no database). Files never
leave the user's browser; tools, machines and post-processor profiles are kept in its IndexedDB.

## Benchmarks

```bash
npm run bench      # parsing, copper, isolation and hole order of dense boards (machine dependent)
```
