# pcbCAM

PCB CAM software in the browser. It starts from the production files of a board (Gerber and drill files), computes
the toolpaths of the milling machine and writes the G-code. It was born at [8 Fablab Drôme](https://8fablab.fr) to
mill boards on the machines of the workshop.

Everything happens in the browser: nothing to install, no account, and **no file is sent over the internet**.

It works like [FlatCAM](http://flatcam.org/) (FlatCAM Plus version), with its algorithms rewritten in TypeScript. The
aim is a simpler interface, guided step by step, for a first board.

It is available online at https://pcbcam.8fablab.fr

## What pcbCAM does

**Reading files**

- Gerber RS-274X and X2: copper, outline, and drill data as Gerber (Proteus).
- Excellon, in mm or inches, with the zeros and the number format guessed when the file does not give them.
- A whole production zip archive: the Gerber and drill files are found inside, the rest is set aside and listed.
- Drag and drop of several files at once. An example board is provided to try it out.

**Board analysis**

- Tightest gap between two copper features, thinnest track, hole sizes.
- Tools of the library that fit the board, and those that do not.

**Machining, one step at a time**

- **Track isolation**: several passes with overlap, climb or conventional milling.
  - Areas the tool cannot isolate are shown on the board: risk of a short circuit.
  - A comparator shows what each tool would give.
- **Drilling**: one tool per hole size, hole order optimised to shorten the travel.
  - Peck drilling available.
  - A hole too large for the drills is milled, and slots are machined.
- **Cutout**: board outline, or a rectangle around the copper.
  - Tabs are placed automatically; a click on the board moves them.
- Estimated time of each operation.

**G-code**

- Post-processors provided: GRBL 1.1, Marlin, LinuxCNC and Snapmaker Artisan (200 W CNC module).
  - They can be edited, copied and exchanged as JSON files, with a live preview.
- Adjustable machine profiles: travel, speeds, safe height, tool change mode.
- Origin of your choice: lower left corner, centre or origin of the Gerber file.
- Mirror to mill the bottom side.
- Tool change by a pause within one file, or one file per tool when the machine cannot set the zero again during a
  pause (Snapmaker Artisan).
- Checks before download:
  - the job fits in the travel of the machine;
  - no rapid move inside the material;
  - no command forbidden by the profile.
- **Simulation** of the G-code read back as the machine will read it, played over the board.
  - The G-code text can still be edited by hand; the checks run again on the edited text.

**Comfort**

- Project file (`.pcbcam.json`) holding the source files, tools, machine and settings, to find everything again on
  another computer.
- Help on every setting: explanation, advised value and an illustration that follows the values entered.
- "My first board" guide and illustrated glossary.
- Interface in French and English, light or dark theme.

## Limits

- **The G-code has not yet been validated on every machine.** It is tested automatically, but only a real run proves
  that it suits a given machine. Before a real board:
  - make a first run "in the air", above the plate;
  - have a spoil board under the board;
  - keep your hand close to the emergency stop.
- The values of the tools provided (speeds, depths) are **starting points**, to be adjusted on each machine and for
  each tool.
- Not supported yet:
  - inner cutouts inside the outline of a board (shaped holes);
  - removal of copper from large areas (NCC);
  - double-sided boards with alignment holes;
  - panelisation;
  - height map (auto-levelling);
  - laser engraving;
  - DXF or SVG import;
  - 3D view;
  - design rule check (DRC);
  - driving the machine directly from the browser.
- A very dense board with a large ground plane can take a few seconds to compute the isolation. The interface stays
  usable meanwhile.
- A recent browser is needed: Chrome, Edge, Firefox or Safari less than two or three years old.
- The settings of each user (machines, tools, post-processors) stay in their browser. To find them elsewhere, export
  them, or save the project.

## Usage

1. **Import** the files of the board: copper, outline and drill files, or directly the production zip.
   - For a first try, click "Example board".
2. **Analysis**: look at the tightest gap and the tools that fit in it.
3. **Tools**: compare the library with your real tools, in particular the tip and angle of the V-bits and the
   diameter of the drills.
4. **Machining**, in the order of the steps:
   - isolation;
   - drilling;
   - cutout, with its tabs.
5. **Machine**:
   - choose your machine and its post-processor;
   - write the G-code and check the messages;
   - watch the simulation;
   - download the file or files.
6. **On the machine**:
   - fix the plate flat on a spoil board;
   - set the X / Y zero at the chosen origin and the Z zero on the copper;
   - run the file.
7. **Save the project** to find it again later.

Every button and every setting has its tooltip: on hover, or with the "?" button next to the numeric fields. The help
panel (book icon) holds the step by step guide.

## Vibecoded software, open to everyone

pcbCAM was **vibecoded**: it is written almost entirely by an artificial intelligence (Claude, with Claude Code). The
human work went into the needs, the direction, the choices and the trials at the fablab.

- The code was built step by step, with more than 300 automated tests:
  - isolation results compared with those of FlatCAM;
  - reference G-code files;
  - safety checks.
- It has not been reviewed line by line like hand-written software: the usual caution on the machine applies all the
  more.

**The project is open to any change and any cloning.**

- Fork it, adapt it to your machine or your workshop.
- Suggest fixes and improvements: issues and pull requests are welcome on
  [GitHub](https://github.com/Nakio195/8-CAM).
- Reuse parts of it in your own projects, within the licence below.

The technical documentation (in French) explains how everything is built and why:

- [`docs/architecture.md`](docs/architecture.md): the choices, the algorithms, their limits and what remains open;
- [`specs/PROMPT_PCB_CAM_WEB.md`](specs/PROMPT_PCB_CAM_WEB.md): the original specification.

## Development

[Node.js](https://nodejs.org) LTS is needed.

```bash
npm install
npm run dev        # development server
npm run check      # lint, types and tests
npm run build      # static site in dist/
npm run bench      # performance measurements on dense boards
```

## Deployment

`npm run build` produces a **fully static** site in `dist/`, to copy to any web server. There is no application server
and no database. The details are in [`docs/mise-en-ligne.md`](docs/mise-en-ligne.md) (in French): HTTPS, security
headers, cache.

The file [`public/defaults.json`](public/defaults.json) sets for every user of the site:

- the default settings of the operations;
- the machine offered on a first visit;
- the built-in tools.

It can be edited on the server, without a new build. Check its syntax before putting it online:

```bash
npm run check:defaults
```

## Licence

pcbCAM is free software under the
[Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/) licence (CC BY-SA 4.0).
See [`LICENSE`](LICENSE).

Not covered by this licence:

- the 8 Fablab Drôme brand assets (`assets/brand/`);
- the fonts, under the SIL OFL licence;
- the dependencies, each under its own licence.
