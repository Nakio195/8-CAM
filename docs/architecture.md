# 8-CAM : architecture

> Analyse de la référence, choix techniques et organisation du dépôt (jalon J0).
> Référence lue : `C:\Users\To\Desktop\FlatCAM-master` (FlatCAM Plus, Python / Shapely).
> Cahier des charges : [`specs/PROMPT_PCB_CAM_WEB.md`](../specs/PROMPT_PCB_CAM_WEB.md).

---

## 1. Comment FlatCAM Plus fait le travail (résumé d'une page)

### 1.1 Chaîne générale

```
Fichier Gerber/Excellon ──► Parser ──► géométrie Shapely (polygones flottants, mm)
        ──► Plugin (Isolation / Drilling / CutOut) ──► objet Geometry (parcours 2D)
        ──► CNCjob (camlib.py) : 2D + paramètres Z/avances ──► appels au préprocesseur ──► G-code texte
```

Il n'y a **pas de format intermédiaire indépendant de la machine** : `CNCjob` appelle directement les méthodes du
préprocesseur (`lift_code`, `down_code`, `linear_code`...) pendant qu'il parcourt la géométrie. C'est le principal
point que nous changeons (modèle `Move[]` de la section 6.7).

### 1.2 Parsing

- **Gerber** (`appParsers/ParseGerber.py`) : parseur ligne à ligne par expressions régulières (`%FS`, `%MO`, `%AD`,
  `%AM`, `D01/02/03`, `G36/37`, `%LP`...). Chaque aperture accumule des entrées `{solid, follow, clear}` ; les
  macros sont évaluées par `ApertureMacro` dans `camlib.py` (primitives 1, 4, 5, 6, 7, 20, 21, 22). Les arcs sont
  discrétisés avec `steps_per_circle`. À la fin, tout est fusionné par `unary_union` en `solid_geometry`.
- **Excellon** (`appParsers/ParseExcellon.py`) : machine à états en-tête `M48` / corps, détection `METRIC/INCH`,
  `LZ/TZ`, format par défaut 3:3 mm et 2:4 pouce, heuristiques Altium (`;FILE_FORMAT=`) et Allegro, slots `G85` et
  routage `G00/M15/M16/G01`.

### 1.3 Isolation (`appPlugins/ToolIsolation.py` + `Geometry.isolation_geometry` dans `camlib.py`)

1. Géométrie source = cuivre fusionné.
2. Pour chaque passe `i` : distance au cuivre
   `offset_i = dia * (2i + 1) / 2 - i * overlap * dia + customOffset` (`_pass_offset`).
3. `buffer(offset_i, join=round)` de chaque polygone, puis `unary_union` ; on garde extérieurs, intérieurs ou les deux
   (`iso_type` 0 / 1 / 2).
4. Sens : en avalant (climb) on inverse l'orientation des anneaux (`mill_dir`).
5. **Garde-fou** (`_guard_isolation_geometry`) : on « tamponne » le parcours du rayon d'outil et on mesure l'aire
   qui mord dans le cuivre ; si elle n'est pas nulle, on reconstruit depuis le contour Gerber puis on signale l'erreur
   en pourcentage. C'est une bonne base pour notre **détection des zones non isolées**, mais FlatCAM ne localise pas
   les zones : il donne un ratio global. Nous irons plus loin (polygones de défaut affichés en surbrillance).
6. Options : passes combinées, passes supplémentaires sur les pastilles, exclusion de zone, simplification.
7. V-bit : diamètre effectif recalculé selon la profondeur (`apply_vbit_parameters_to_data`), même formule que la 6.4.

### 1.4 Perçage (`appPlugins/ToolDrilling.py` + `CNCjob.excellon_tool_gcode_gen`)

- Points regroupés par outil ; ordre optimisé au choix : OR-Tools (métaheuristique ou basique), **plus proche
  voisin** (`optimized_travelling_salesman`, O(n²)), RTree ou aucun.
- Pour chaque trou : rapide en XY à `travelZ`, `down_code` (G01 Z), éventuel `dwell`, `lift_code`.
- Multi-profondeur via `calculate_depths(step)` : liste des Z successifs jusqu'à `z_cut`.
- Rainures : soit fraisées, soit converties en chapelet de trous (`process_slot_as_drills`, pas = recouvrement).
- Changement d'outil : `toolchange_code` du préprocesseur (M5, remontée, T/M6, message, M0).

### 1.5 Détourage (`appPlugins/ToolCutOut.py`)

- **Forme libre** : `geo.buffer(margin + dia/2).exterior` (ou boîte englobante si plusieurs morceaux).
- **Rectangulaire** : boîte englobante + marge + dia/2.
- **Attaches** : pas de placement le long du périmètre ; FlatCAM soustrait des **rectangles de largeur `gapsize`**
  centrés sur les axes de la carte (modes `4`, `8`, `LR`, `TB`, `2LR`, `2TB`), ce qui coupe le contour à
  ¼ et ¾ de la longueur. Les « thin gaps » gardent la portion soustraite pour la passer à une profondeur réduite.
- Attaches manuelles par clic sur le contour (`on_manual_gap_click`).
- Nous reprendrons le principe mais avec un placement par **abscisse curviligne** sur le contour (fonctionne aussi
  sur une carte ronde ou en L), et les attaches uniquement sur les dernières passes (exigence 6.6).

### 1.6 Post-processing (`appPreProcessor.py`, `preprocessors/*.py`)

- Chaque préprocesseur est une **classe Python** auto-enregistrée qui implémente `start_code`, `lift_code`,
  `down_code`, `toolchange_code`, `rapid_code`, `linear_code`, `end_code`, `feedrate_code`, `spindle_code`,
  `dwell_code`, `spindle_stop_code`.
- **GRBL 1.1** : en-tête commenté `( ... )` (outil, avances, Z, plage X/Y, broche), puis `G21 G90 G17 G54 G94` ;
  changement d'outil `M5 / G00 Z / T / M6 / (MSG...) / M0 / G00 Z` ; `M03 S…` ; `M05` ; fin `G00 Z{zEnd}`.
- **Marlin** : commentaires `;`, `M3/M4`, `G4 P` pour la pause, `M400` avant `M5` (attendre la fin des mouvements).
- **default (LinuxCNC)** : proche de GRBL avec `T{n} M6`.
- Les décimales et le format des nombres sont des attributs du préprocesseur.

Pour nous, ces classes deviennent des **profils JSON** déclaratifs interprétés par un moteur unique (6.8).

---

## 2. Choix des bibliothèques (proposition)

### 2.1 Géométrie : Clipper2

| Option                                      | Pour                                                                                               | Contre                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **`clipper2-ts` 2.x** (port TypeScript pur) | Typé, aucune étape WASM, fonctionne tel quel dans les Workers et dans Vitest/Node, maintenu (2026) | Plus lent que WASM (estimé x2 à x4) ; entiers limités à 2^53 en JS                  |
| `clipper2-wasm` 0.4                         | Le plus rapide, vrai Int64, suit le C++ officiel                                                   | Gestion mémoire manuelle (`delete()`), chargement asynchrone, API moins idiomatique |
| `clipper2-js` 1.2                           | Port TS simple                                                                                     | Plus mis à jour depuis début 2024                                                   |

**Recommandation : `clipper2-ts`**, encapsulé derrière notre propre `ClipperWrapper` (`src/core/geometry`) pour pouvoir
basculer sur `clipper2-wasm` si le benchmark de J1 ne tient pas l'objectif « isolation 2 passes < 5 s ».

**Unité interne : 1 unité = 10 nm** (0,01 µm). Une carte de 1 m tient en 1e8 unités, très loin de la limite 2^53
(9e15) même après produits croisés internes à Clipper (~1e16, à vérifier en J1 ; le nanomètre pur rendrait cette
marge trop juste). Précision de 0,01 µm, cent fois mieux que l'exigence de 1 µm.

### 2.2 Framework UI

| Option                | Pour                                                                                                                                                                     | Contre                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **Svelte 5**          | Très peu de code d'interface, réactivité fine (« runes ») idéale pour les illustrations paramétriques en direct, bundle léger (bon pour le hors ligne), TypeScript natif | Écosystème plus petit que React                                 |
| React                 | Écosystème énorme                                                                                                                                                        | Plus verbeux, re-rendus à surveiller pour les schémas en direct |
| Vue 3                 | Bon compromis                                                                                                                                                            | Rien de décisif par rapport à Svelte ici                        |
| Web Components natifs | Zéro dépendance                                                                                                                                                          | Beaucoup de code « plomberie » pour i18n, état, formulaires     |

**Recommandation : Svelte 5** + `svelte-i18n` (ou petit module maison typé, à trancher en J4). Le cœur (`core`,
`parsers`, `cam`, `post`, `project`) reste du TypeScript pur sans dépendance au framework.

> Note conventions : Prettier ne sait pas produire le style Allman. Proposition : ESLint avec la règle
> `@stylistic/brace-style: ["error", "allman"]` (corrigée automatiquement par `eslint --fix`), et Prettier désactivé
> pour le TS (gardé pour JSON / CSS / Markdown). Les composants `.svelte` suivront Allman dans leur `<script>`.

### 2.3 Rendu

**Canvas 2D derrière une interface `Renderer`**, avec mise en cache par couche dans des `Path2D` (et
`OffscreenCanvas` si besoin). Pour 10 x 10 cm dense, Canvas 2D avec `Path2D` précalculés tient 60 fps en pan/zoom
(on ne retesselle pas, on change seulement la transformation). Une implémentation WebGL pourra être ajoutée plus tard
derrière la même interface si la mesure de J4 le demande.

### 2.4 Autres

| Besoin                 | Choix                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Workers                | Protocole de messages typé maison (requête / progression / annulation / résultat), `comlink` évité pour garder l'annulation explicite |
| Persistance            | `idb` 8 (IndexedDB) pour la bibliothèque d'outils et les profils                                                                      |
| Tests                  | Vitest 5 + couverture `v8` ; snapshots SVG pour les illustrations                                                                     |
| Build                  | Vite 8 ; PWA (`vite-plugin-pwa`) prévue mais activée plus tard                                                                        |
| Polices                | Bebas Neue, Karla, JetBrains Mono auto-hébergées (`@fontsource/*`)                                                                    |
| Optimisation de trajet | Plus proche voisin + 2-opt maison (pas d'OR-Tools en JS)                                                                              |

---

## 3. Arborescence proposée

```
8-CAM/
  docs/                    architecture.md, décisions (ADR), ce document
  assets/brand/            logo et motifs fournis par To (non redessinés)
  public/fonts/            polices auto-hébergées
  src/
    core/units/            mm <-> pouce <-> unités internes (10 nm)
    core/geometry/         Point, Path, Polygon avec trous, bbox, arcs, ClipperWrapper
    parsers/gerber/        lexer, parser, macros, régions, step & repeat, attributs X2
    parsers/excellon/      en-tête, outils, trous, rainures
    cam/tools/             modèle Tool, bibliothèque par défaut, largeur effective V-bit
    cam/analysis/          espacement mini, piste mini, trous, recommandations (6.10)
    cam/isolation/
    cam/drilling/
    cam/cutout/
    cam/toolpath/          type Move, ordonnancement (NN + 2-opt), estimation de durée
    post/profiles/         grbl.json, marlin.json, linuxcnc.json
    post/engine/           interpréteur de profil, writer G-code, vérifications de sécurité (section 7)
    project/               modèle projet, sérialisation JSON, undo/redo
    workers/               points d'entrée et protocole de messages
    render/                interface Renderer + Canvas2DRenderer
    ui/                    composants Svelte, panneaux, vue canvas, i18n (fr.json, en.json)
      illustrations/
      help/
      theme/
    main.ts
  tests/
    fixtures/              Gerber/Excellon réels (KiCad, Eagle, EasyEDA, Altium)
    unit/ ...              miroir de src/
  .github/workflows/ci.yml lint + typecheck + tests
```

Ajout par rapport au cahier des charges : `cam/analysis/` (analyse de carte et recommandations, section 6.10),
placé dans `cam` car c'est du calcul pur réutilisé par l'UI et les workers.

---

## 4. Contenu du jalon J0

1. `git init`, `.gitignore`, `package.json`, Vite + Svelte 5 + TypeScript `strict`.
2. ESLint (Allman, préfixe `m` des membres privés vérifié par `@typescript-eslint/naming-convention`), Prettier pour
   les fichiers non TS, `npm run lint`, `npm run typecheck`.
3. Vitest + couverture, un test « fumée » par module (`core`, `parsers`, `cam`, `post`) pour que `npm test` soit vert.
4. Squelette des dossiers ci-dessus avec un `index.ts` et un commentaire de rôle par module ; règle ESLint
   `import/no-restricted-paths` qui interdit au cœur d'importer `ui`, `render` ou `workers`.
5. Page Svelte vide « 8-CAM » qui se lance avec `npm run dev`.
6. CI GitHub Actions (lint, typecheck, tests) — utile seulement si le dépôt est poussé sur GitHub.
7. `docs/architecture.md` : version finale de ce document après vos retours.

Critère d'acceptation : `docs/architecture.md` validé, `npm test` vert.

---

## 5. Décisions validées (27/10/2026)

| Sujet            | Décision                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework UI     | Svelte 5                                                                                                                                                                                                                                                                                                                                                 |
| Géométrie        | `clipper2-ts`, benchmark en J1, repli `clipper2-wasm` possible                                                                                                                                                                                                                                                                                           |
| Dépôt            | git dans `Desktop\8-CAM`, un commit par étape importante ; CI GitHub Actions prête pour un futur dépôt distant                                                                                                                                                                                                                                           |
| Matière première | `ressources/` (fourni par To) n'est pas versionné ; les fichiers utilisés sont copiés dans `assets/brand/` et `tests/fixtures/`                                                                                                                                                                                                                          |
| Fixtures         | `tests/fixtures/proteus/` : cuivre face inférieure FTDI_Max (Proteus 8.15, Gerber X2, `%FSLAX45Y45`, mm) et le G-code d'isolation FlatCAM Plus correspondant (préprocesseur `default`, outil 0,2072 mm, Z -0,2 en 2 passes) qui servira au test comparatif. D'autres fichiers (KiCad, Eagle, EasyEDA, Altium, Excellon) seront ajoutés au fil des jalons |
| Charte           | logos SVG dans `assets/brand/` ; le PDF de la charte reste dans `ressources/` (relu en J4b)                                                                                                                                                                                                                                                              |

### 5.1 Profil machine réglable

Les dimensions machine ne sont **pas figées dans le code** : un modèle `MachineProfile` (dans `project/`) contient au
minimum

| Champ                           | Description                      | Valeur par défaut (3018) |
| ------------------------------- | -------------------------------- | ------------------------ |
| `name`                          | nom du profil                    | « CNC 3018 »             |
| `travelX`, `travelY`, `travelZ` | courses utiles (mm)              | 300 / 180 / 45           |
| `safeZ`                         | hauteur de sécurité machine (mm) | 5                        |
| `maxSpindleSpeed`               | vitesse broche maxi (tr/min)     | 10 000                   |
| `maxFeedXY`, `maxFeedZ`         | avances maxi (mm/min)            | 1 500 / 500              |

Plusieurs profils peuvent coexister (une machine par profil), persistés dans IndexedDB, exportables en JSON et
enregistrés dans le projet. La vérification de sécurité de la section 7 (limites de course, avances aberrantes) lit
le profil actif. L'éditeur de profil arrive avec le post-processeur (J9) ; chaque champ aura son infobulle (6.11).

### 5.2 Précisions sur les conventions

- **Accolades** : style Allman pour tous les blocs (classes, fonctions, méthodes, `if`, boucles, `switch`, `try`).
  Dérogation justifiée : les **littéraux d'objet** (`const x = { ... }`, arguments `fn({ ... })`) ouvrent leur
  accolade sur la même ligne. Placée seule sous un `=`, l'accolade devrait sinon être indentée (règle d'indentation
  d'ESLint), ce qui donne un code plus difficile à lire. Ce ne sont pas des blocs de contrôle.
- Formatage : ESLint (`npm run format`) pour TS / JS / Svelte, Prettier seulement pour JSON, CSS, Markdown et YAML,
  car Prettier ne sait pas produire le style Allman.
- Le préfixe `m` s'applique aux **propriétés privées** (et protégées) des classes ; les méthodes privées gardent un
  nom camelCase simple (`computeOffsets`). Règle vérifiée par ESLint (`@typescript-eslint/naming-convention`).
- Les couches s'importent par alias (`@core`, `@parsers`, `@cam`, `@post`, `@project`, `@workers`, `@render`,
  `@ui`) ; ESLint interdit les imports « montants » et un test d'architecture le revérifie :

| Module    | Peut importer                               |
| --------- | ------------------------------------------- |
| `core`    | rien                                        |
| `parsers` | `core`                                      |
| `cam`     | `core`, `parsers`                           |
| `post`    | `core`, `cam`                               |
| `project` | `core`, `parsers`, `cam`, `post`            |
| `workers` | `core`, `parsers`, `cam`, `post`, `project` |
| `render`  | `core`, `parsers`, `cam`, `project`         |
| `ui`      | tout                                        |

---

## 6. Résultats du jalon J1 (géométrie)

### 6.1 Ce qui est livré

| Module                  | Contenu                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/units`            | unités internes de 10 nm (100 000 par mm), conversions mm / pouce, contrôle de plage des coordonnées                                                                                                                                                                                |
| `core/geometry/types`   | `Point`, `Path`, `Polygon` (contour + trous), `Polyline` ; Y vers le haut, contour extérieur anti-horaire, trous horaires                                                                                                                                                           |
| `core/geometry/path`    | aire signée, orientation, normalisation, longueurs, rectangles, translation                                                                                                                                                                                                         |
| `core/geometry/bbox`    | boîtes englobantes (fusion, marge, intersection)                                                                                                                                                                                                                                    |
| `core/geometry/arc`     | discrétisation des arcs **par tolérance de corde** (0,5 µm par défaut) au lieu d'un nombre fixe de pas par cercle comme FlatCAM ; arcs G02 / G03 avec extrémités exactes et rayon interpolé                                                                                         |
| `core/geometry/clipper` | union, différence, intersection, offset (rond, onglet, chanfrein), épaississement de pistes (bouts ronds, carrés, francs), construction depuis des contours bruts (pair-impair ou non nul) ; résultats en polygones avec trous, îlots dans les trous rendus comme polygones séparés |

### 6.2 Benchmark (`npm run bench`)

Carte synthétique dense de 100 x 100 mm : 2 500 pastilles au pas de 2 mm, 9 600 segments de piste de 0,2 et 0,3 mm,
isolement d'environ 0,3 mm. Outil 0,2 mm, recouvrement 10 %, médiane de 3 mesures sous Node 22 :

| Étape                                                                       | Durée                      |
| --------------------------------------------------------------------------- | -------------------------- |
| Cuivre : épaississement des pistes + union (215 polygones, 109 000 sommets) | 0,6 s                      |
| Isolation : 2 passes d'offset                                               | 1,1 s                      |
| **Total**                                                                   | **1,7 s** (objectif < 5 s) |

`clipper2-ts` est donc conservé ; le repli sur `clipper2-wasm` n'est pas nécessaire. Le benchmark reste dans le dépôt
pour surveiller les régressions (il ne fait pas partie de `npm test`, trop dépendant de la machine).

### 6.3 Précision

Tests à l'appui : offset d'un cercle exact à moins de 1 µm, erreur de corde des arcs ≤ 0,5 µm (+ 1 unité d'arrondi),
aller-retour mm ↔ unités internes sans perte au-delà de 0,01 µm, carte de 1 m traitée sans débordement.
Couverture de `src/core` : 100 % des lignes, 98 % des branches.
