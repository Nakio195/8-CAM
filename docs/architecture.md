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

Les dimensions machine ne sont **pas figées dans le code** : un modèle `MachineProfile` (dans `post/`, voir 15.4) contient au
minimum

| Champ                           | Description                      | Valeur par défaut (3018) |
| ------------------------------- | -------------------------------- | ------------------------ |
| `name`                          | nom du profil                    | « CNC 3018 »             |
| `travelX`, `travelY`, `travelZ` | courses utiles (mm)              | 300 / 180 / 45           |
| `safeZ`                         | hauteur de sécurité machine (mm) | 5                        |
| `maxSpindleSpeed`               | vitesse broche maxi (tr/min)     | 12 000 (voir 15.4)       |
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

---

## 7. Résultats du jalon J2 (parser Gerber)

### 7.1 Organisation

| Fichier `src/parsers/gerber/` | Rôle                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `lexer.ts`                    | découpe le fichier en commandes « mot » (`…*`) et étendues (`%…%`), avec numéros de ligne                                |
| `format.ts`                   | `%FS` (zéros de tête / queue, absolu / incrémental), décodage des coordonnées                                            |
| `macro.ts`                    | `%AM` : variables, expressions (analyseur maison, jamais d'`eval`), primitives                                           |
| `aperture.ts`                 | `%AD` et formes : C, R, O, P avec trou ; primitives 1, 2/20, 21, 22, 4, 5, 6, 7                                          |
| `parser.ts`                   | machine à états : D01/D02/D03, G01/02/03, G74/G75, G36/G37, `%LP`, `%SR`, `%LM/%LR/%LS`, attributs X2                    |
| `builder.ts`                  | construction du cuivre : lots consécutifs de même polarité, union (sombre) / différence (claire) dans l'ordre du fichier |
| `layer.ts`                    | type de couche par `%TF.FileFunction`, sinon par le nom de fichier (KiCad, Eagle, EasyEDA, Altium, Proteus)              |

Le document produit (`GerberDocument`) garde les **entités sources** (flashs, pistes, régions avec ouverture,
polarité, attributs X2 et ligne d'origine) pour l'affichage et le débogage ; le cuivre unifié est calculé à part
par `buildGerberGeometry`, l'étape lourde destinée au Worker.

### 7.2 Robustesse

Le parser ne lève jamais d'exception sur le contenu d'un fichier : chaque problème devient un avertissement
`{ code, line, detail }`. Le `code` est stable et sera traduit par l'interface (i18n), `detail` est en anglais pour
les logs. Un test envoie 50 fichiers aléatoires sans planter. Commandes obsolètes tolérées : `G54`, `G55`,
`G70/G71`, `G90/G91`, `G10-12`, `M00/M01`, opération modale (coordonnées sans `D0x`), `%IN`, `%LN`, `%OF`, `%MI`…
Non pris en charge (signalés) : `%IPNEG` (image négative), `%AB` (block apertures).

Choix à noter :

- arc sans `G74`/`G75` : mode multi-quadrant supposé (avertissement) ;
- `%LMX` retourne les coordonnées X de l'ouverture ;
- une piste tracée avec une ouverture autre qu'un cercle balaie l'enveloppe convexe de la forme (exact pour
  rectangles, oblongs et polygones ; avertissement pour les macros).

### 7.3 Comparaison avec FlatCAM Plus

Sur la carte FTDI_Max (Proteus, cuivre face inférieure), **tous les points de coupe** du G-code d'isolation FlatCAM
(1 723 points, première passe) sont à **0,1536 mm ± 0,0004 mm** de notre contour de cuivre : les deux logiciels
construisent la même géométrie à moins d'un micron près. Les 0,1536 mm correspondent au rayon de l'outil
(0,2072 / 2 = 0,1036 mm) plus 0,05 mm de décalage réglé dans ce travail FlatCAM (confirmé par To : décalage personnalisé de 0,05 mm).
Le rendu SVG de contrôle (cuivre + trajets FlatCAM superposés) est écrit dans `test-output/` par `npm test`.

### 7.4 Performances (`npm run bench`)

| Mesure                                                                         | Résultat | Objectif         |
| ------------------------------------------------------------------------------ | -------- | ---------------- |
| Parsing d'un fichier de 9,2 Mo (2 cartes denses 10 x 10 cm avec plan de masse) | 0,4 s    | < 3 s pour 5 Mo  |
| Construction du cuivre de ce fichier                                           | 2,6 s    | (pas d'objectif) |

La construction du cuivre coûte environ 1,3 s par carte dense avec plan de masse ; elle tourne dans un Worker
avec barre de progression (jalon J4). Correction : la première version de ce document indiquait 6,9 s, mesure
faussée par un défaut du générateur de test (coordonnées décimales lues en millimètres), corrigé au jalon J4.

### 7.5 Workers et annulation

Le parser et le builder sont des fonctions pures synchrones avec un rappel de progression. Un Worker occupé par un
calcul synchrone ne peut pas lire de message d'annulation : l'annulation se fera donc en **terminant le Worker**
(`worker.terminate()`) et en le recréant. Le protocole de messages sera écrit au jalon J4, avec l'interface.

### 7.6 Fixtures manquantes

Seuls deux fichiers réels sont testés (Proteus et l'exemple FlatCAM). Des Gerber KiCad, Eagle, EasyEDA et Altium
réels seront ajoutés dès que To les fournira ; les cas particuliers (macros KiCad `RoundRect`, polarité claire,
step and repeat, arcs G74/G75, régions avec trous) sont déjà couverts par des fichiers écrits à la main.

---

## 8. Résultats du jalon J3 (perçage)

### 8.1 Un modèle de perçage, deux formats d'entrée

`src/parsers/excellon/` produit un `DrillDocument` unique (outils avec diamètre et métallisation, trous, rainures)
à partir de :

- **fichiers Excellon** (`parseExcellon`) ;
- **fichiers de perçage Gerber X2** (`drillFromGerber`) : c'est ce que produit Proteus (`%TF.FileFunction,Plated`),
  chaque ouverture ronde devient un outil, les flashs des trous, les tracés des rainures.

`looksLikeExcellon()` distingue les deux formats à l'import.

### 8.2 Excellon pris en charge

| Élément       | Détail                                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| En-tête       | `M48` … `%` / `M95`, `METRIC` / `INCH` avec `,LZ` / `,TZ` et `,000.000`, `M71` / `M72`, commandes d'en-tête ignorées (`FMAT`, `ICI`, `VER`…)                                     |
| Format        | `;FILE_FORMAT=2:5` (Altium) ; zéros non déclarés **devinés** d'après les coordonnées (`012500` ne peut venir que d'un fichier LZ) ; format forçable depuis l'interface (`force`) |
| Outils        | `TnnC…` dans l'en-tête ou dans le corps, paramètres F/S/B/H/Z tolérés, `T0`                                                                                                      |
| Trous         | coordonnées modales, `G90` / `G91`, origine `G93`, répétition `R`                                                                                                                |
| Rainures      | `G85` ; routage `G00` / `M15` / `G01` / `G02` / `G03` / `M16`-`M17`, arcs par rayon `A` (négatif = grand arc) ou centre `I` / `J`                                                |
| Métallisation | attributs KiCad `;#@! TF/TA`, commentaires Altium `;TYPE=PLATED`, sinon nom du fichier (`PTH`, `NPTH`, `Plated`, `NonPlated`)                                                    |

Rappel du piège Excellon : `LZ` signifie que les zéros **de tête sont écrits** (ceux de queue omis), l'inverse de
`%FSL` en Gerber.

### 8.3 Vérifications

- Exemple FlatCAM (`INCH,LZ`, 2:4) : 16 trous, 2 outils, coordonnées exactes.
- Fichiers écrits à la manière de KiCad, Altium et Eagle (zéros devinés), et cas limites.
- **Carte FTDI_Max** : 41 trous en 4 outils (0,762 / 0,762 / 1,016 / 3 mm), tous métallisés ; la surface des trous
  située hors du cuivre est **nulle** : chaque trou tombe dans sa pastille (rendu
  `test-output/ftdi-max-copper-and-drills.svg`). Le fichier « Filled and Plated » est vide (pas de via bouchée).
- 50 fichiers aléatoires lus sans exception.

### 8.4 À fournir

Aucun fichier Excellon réel n'est encore dans les fixtures. Proteus peut exporter le perçage en Excellon (réglage
de la sortie CADCAM) ; des fichiers KiCad (`-PTH.drl`, `-NPTH.drl`) ou Eagle seraient aussi utiles.

---

## 9. Résultats du jalon J4 (rendu et interface minimale)

### 9.1 Ce qui est livré

| Module                       | Contenu                                                                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workers/`                   | Worker d'import (`import.worker.ts`) : détection Excellon / Gerber, lecture, construction, renvoi de la géométrie en `Int32Array` transférable (sans copie) ; progression limitée à un message toutes les 50 ms ; annulation par `terminate()` |
| `project/`                   | couches du projet (fonctions pures) : couleur de la charte par type, empilement naturel (cuivre dessous < cuivre dessus < contour < perçage), visibilité, ordre, suppression, boîte englobante                                                 |
| `render/viewport.ts`         | conversion carte ↔ écran (mm, Y vers le haut), zoom autour du curseur, déplacement, « tout afficher », pas de grille 1-2-5                                                                                                                     |
| `render/renderer.ts`         | interface `Renderer` indépendante du moteur ; fond du canvas proposé : **`#1f101c`**, prune très sombre dérivé de `#4b2a46`                                                                                                                    |
| `render/canvas2dRenderer.ts` | implémentation Canvas 2D                                                                                                                                                                                                                       |
| `ui/`                        | en-tête avec logo, import par bouton ou glisser-déposer, carte d'exemple embarquée (FTDI_Max), panneau « Projet », vue canvas, barre d'état, FR / EN                                                                                           |

### 9.2 Fluidité (critère du jalon)

Carte dense de référence : 10 x 10 cm, 2 500 pastilles, 9 600 segments de piste et plan de masse, soit
216 polygones et 280 000 points. Mesures dans Chrome (GPU Intel UHD), moyenne sur 30 images :

| Fenêtre     | Image pendant un zoom / déplacement | Image exacte au repos |
| ----------- | ----------------------------------- | --------------------- |
| 1600 x 900  | **2,9 ms**                          | 40 ms                 |
| 2560 x 1440 | **3,7 ms**                          | 57 ms                 |

Le budget d'une image à 60 fps est de 16,7 ms. Deux techniques combinées :

1. **Niveaux de détail** : à chaque puissance de deux de l'échelle, une copie simplifiée de la géométrie (points
   espacés d'au moins un demi-pixel) ; erreur invisible, et l'image exacte passe de 113 ms à 24 ms.
2. **Réutilisation de l'image** pendant le mouvement : la dernière image complète est déplacée et mise à l'échelle,
   puis une image exacte est dessinée 120 ms après le dernier mouvement. Seul effet visible : pendant un déplacement,
   les bords nouvellement découverts restent vides un instant.

La transformation utilisée pour réutiliser l'image est testée (`viewChangeTransform`).
Mesure reproductible : `npm run bench` écrit `test-output/dense-board.gbr`, puis
`npm run dev` et `http://localhost:5173/?load=/test-output/dense-board.gbr`, et dans la console
`measureFrames(30, "interactive")` (outil de développement absent de la version de production).

### 9.3 Interface

- Import : bouton « Ouvrir des fichiers », glisser-déposer n'importe où dans la fenêtre, plusieurs fichiers à la fois ;
  la vue s'ajuste une seule fois, quand tous les fichiers d'un même lot sont lus.
- Panneau « Projet » : par couche, visibilité, couleur, monter / descendre, retirer ; badge du type détecté et du
  nombre d'avertissements ; détails (source de la détection, statistiques, temps, forets avec métallisation,
  avertissements traduits avec leur numéro de ligne).
- Vue : molette (zoom autour du curseur), glisser (bouton gauche ou milieu), double-clic ou F (tout afficher),
  flèches et +/− au clavier, grille (G), origine Gerber (O), mesure de distance (M, deux clics, Échap).
- Barre d'état : coordonnées du curseur en mm (3 décimales, séparateur décimal de la langue), mesure Δx / Δy /
  distance, pas de grille, échelle.
- Accessibilité : tous les boutons ont un libellé ARIA et une infobulle simple (`title`) ; le canvas est focalisable
  et pilotable au clavier.

### 9.4 Limites connues

- Les infobulles sont pour l'instant de simples `title` : le composant `HelpTip` complet (section 6.11) arrive au
  jalon J4b, avec les polices auto-hébergées et la page `styleguide`. Aucun paramètre d'usinage n'existe encore,
  donc aucune infobulle illustrée n'est due à ce stade.
- Le logo est affiché en blanc par un masque CSS appliqué au fichier d'origine (pas de redessin) ; une version
  blanche officielle du logo horizontal serait préférable.
- La mesure n'accroche pas encore les centres de trous ni les bords de pastilles.
- Pas encore de sauvegarde du projet (jalon J10).

---

## 10. Résultats du jalon J4b (charte graphique et aide)

### 10.1 Remarque de To sur J4

Les noms de couche s'affichent désormais en entier (retour à la ligne, jamais tronqués) : des fichiers d'une même
carte commencent souvent pareil. Les boutons de la couche passent sur la deuxième ligne et le nom complet du fichier
figure dans les détails. Corrigé au passage : dans un onglet ouvert en arrière-plan (canvas de 0 x 0 px), le cadrage
automatique attend désormais une taille utilisable.

### 10.2 Charte

| Élément              | Mise en œuvre                                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Polices              | Bebas Neue, Karla (famille variable complète avec italiques), JetBrains Mono, **auto-hébergées** (`@fontsource`, licence OFL) pour le hors ligne                                                                                                |
| Couleurs             | `src/ui/theme/tokens.css`, source unique : palette de la charte + couleurs sémantiques (action, succès, avertissement, erreur, information, aide, infobulle, stickers)                                                                          |
| Thèmes               | automatique (suit le système), clair ou sombre forcé (`<html data-theme>`), choix mémorisé ; la vue de la carte reste sombre                                                                                                                    |
| Contrastes           | un test lit `tokens.css` et vérifie **le niveau AA (4,5:1) pour chaque paire texte / fond des deux thèmes** ; la page styleguide affiche aussi les rapports mesurés en direct                                                                   |
| Rouge et texte blanc | blanc sur le rouge de la charte = 4,49:1, juste sous AA : les boutons à texte blanc utilisent un rouge un peu plus profond, `#d4083f` (5,38:1) ; le rouge de la charte reste pour le cuivre, la sélection et le graphisme. **À valider par To** |
| Couleur seule        | jamais : stickers, messages et champs invalides portent toujours une icône ou un mot                                                                                                                                                            |
| Motifs               | les logos d'habillage (facettes, pois, éclats) utilisés en masque CSS bicolore, seulement sur l'accueil et « À propos », à l'écart du texte, sans couper le lettrage du logo                                                                    |
| Mise en page         | accueil en « jeu de moitiés » : identité à gauche (titre 8-CAM incliné de −10°, autorisé ici seulement), actions à droite                                                                                                                       |
| Logos                | logo horizontal en haut à gauche (blanc par masque CSS), cartouche « 8FABLAB.FR » dans « À propos »                                                                                                                                             |

### 10.3 Composants de base (`src/ui/components/base/`)

`Button` (principal, secondaire, discret, sur fond prune), `IconButton`, `Sticker` (pastille ou étiquette, Bebas
Neue en capitales : ADAPTÉ, LIMITE, TROP LARGE, GRBL, type d'outil, durée), `Callout` (succès, avertissement, erreur,
information, aide), `NumberField` (libellé, unité, bouton « ? », état invalide avec icône).

### 10.4 HelpTip et aide

- Une **action Svelte** `use:help={"sujet"}` s'applique à n'importe quel élément ; une **seule infobulle partagée**
  (`HelpTipLayer`) l'affiche, ce qui garantit un comportement identique partout.
- Contenu : titre, explication, valeur conseillée (✓), attention (⚠), lien « En savoir plus » vers le panneau d'aide.
- Comportement vérifié dans le navigateur : apparition après 400 ms au survol (mesuré : 434 ms), immédiate au focus
  clavier, F1 pour l'épingler, épinglage d'un clic, fermeture par Échap ou clic ailleurs, **appui long de 500 ms sur
  écran tactile** (sans déclencher l'action du bouton) ; `role="tooltip"` et `aria-describedby`.
- Textes : les **21 paramètres du tableau 6.11** (FR repris du cahier des charges, EN traduit) et tous les boutons et
  indicateurs existants (45 sujets). Un test refuse un texte manquant, trop court ou qui répète le titre ; il a
  d'ailleurs refusé « Langue : Langue de l'interface… », réécrit.
- Indicateurs (barre d'état, badges de couche) : ce sont des boutons, donc atteignables au clavier ; un clic épingle
  leur aide. La barre d'état n'annonce plus chaque mouvement du curseur aux lecteurs d'écran (seule la mesure).
- Panneau d'aide latéral : tous les sujets par thème, ouvert sur le bon sujet depuis « En savoir plus ».

### 10.5 Page styleguide

`/styleguide.html` (deuxième page du projet, `npm run dev` puis http://localhost:5173/styleguide.html) : palette,
paires de couleurs avec contraste mesuré, typographies, stickers, boutons, champs, messages, sujets d'aide à essayer,
toutes les icônes, motifs et logos, avec bascule de langue et de thème.

### 10.6 Reste à faire (jalons suivants)

- Les **illustrations paramétriques** des infobulles (section 6.12) arrivent avec les paramètres eux-mêmes, à partir
  de J5 ; les sujets géométriques sont déjà marqués (`geometric: true`) pour que l'absence d'illustration soit
  détectable par un test à ce moment-là.
- Le glossaire illustré et le guide « Ma première carte » complètent le panneau d'aide en J11.
- La charte PDF n'a pas pu être relue (aucun outil de rendu PDF sur ce poste) : les choix reposent sur la section
  6.13 du cahier des charges et les fichiers de logo fournis.

---

## 11. Résultats du jalon J5 (outils, analyse, recommandations)

### 11.1 Bibliothèque d'outils (`src/cam/tools/`)

- Modèle de la section 6.3 (millimètres, mm/min, tr/min tels que saisis), usages (isolation, perçage, fraisage de
  trous, détourage), marqueur « outil d'origine à valider ».
- **Largeur effective** : `pointe + 2 · profondeur · tan(angle / 2)`, plafonnée au diamètre. Vérifiée contre le
  travail FlatCAM de référence : V-bit 30°, pointe 0,1 mm, profondeur 0,2 mm → **0,2072 mm**, la valeur de l'en-tête
  du G-code FlatCAM.
- Découpage en passes (dernière passe exactement à la profondeur), validation des valeurs impossibles (codes traduits).
- Bibliothèque d'origine = tableau 6.10 (V-bits 20° et 30°, fraise 0,8, fraise maïs 1,5, forets 0,6 à 1,2) ;
  profondeurs de perçage et de détourage calculées pour 1,6 mm ; hauteurs 2 mm / 15 mm.
- Export / import JSON (`8cam-tools`, version 1) : outils invalides ignorés et comptés, fusion par identifiant.
- Interface : persistance **IndexedDB** dans le navigateur (message si le navigateur refuse, avec conseil
  d'exporter), fiches illustrées, éditeur, duplication, suppression, retour aux valeurs d'origine.

### 11.2 Analyse de la carte (`src/cam/analysis/`)

- **Espacement minimal exact** entre éléments de cuivre distincts : distance de bord à bord, accélérée par une grille
  de segments ; une « zone » par paire d'éléments à moins de 2 mm, avec les deux points les plus proches.
  Calculée dans le Worker d'import (3e étape « analyse »).
- **Piste la plus fine** : lue dans les ouvertures des tracés Gerber (cercles, et côté le plus court des rectangles).
- **Trous** : tailles réunies sur tous les fichiers de perçage (métallisés et non), du plus petit au plus grand.
- **Épaisseur** : 1,6 mm par défaut, modifiable (champ avec infobulle illustrée).

Sur la carte FTDI_Max : espacement minimal **0,399 mm** (règle de conception 0,4 mm), pistes de **0,254 mm**,
trous 0,762 (×12), 1,016 (×27) et 3 mm (×2). Analyse en 27 ms ; 1,5 s sur la carte dense de 10 x 10 cm.

### 11.3 Recommandations

| Opération | Règle                                                                                                                                                             | FTDI_Max avec la bibliothèque d'origine                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Isolation | « Adapté » si la largeur passe partout avec ≥ 10 % de marge, « Limite » sous 10 %, « Trop large » + nombre de zones ; adaptés classés du plus robuste au plus fin | V-bit 30° adapté (marge 36 %), V-bit 20° adapté (68 %), fraise 0,8 trop large (62 zones) |
| Perçage   | foret le plus proche (tolérance 0,1 mm ou 10 %), écart en mm et %, trous trop grands fraisés, regroupements et changements d'outil économisés                     | 0,762 → foret 0,8 (+0,038 mm, +5 %), 1,016 → foret 1,0 (−1,6 %), 3 mm → fraise maïs 1,5  |
| Détourage | fraises d'au moins 0,8 mm, outils « détourage » d'abord, puis le moins de passes                                                                                  | fraise maïs 1,5 mm, 5 passes pour 1,7 mm                                                 |

Le nombre de « zones non isolables » compte les paires d'éléments trop proches ; deux passages étroits entre les
deux mêmes éléments comptent pour une zone.

### 11.4 Illustrations paramétriques (`src/ui/illustrations/`)

Profil d'outil vu de côté (V-bit, fraise, foret), V-bit dans le cuivre avec sa largeur effective, empilement des
passes, hauteurs Z (non à l'échelle, signalé), coupe de la carte, et dessin du **cuivre réel autour de l'endroit le
plus serré** avec la cote. Géométrie dans un module pur testé ; composants avec instantanés de rendu ; description
accessible pour chaque dessin. Les infobulles des paramètres géométriques affichent leur illustration **avec les
valeurs du champ** ; un test échoue si un sujet géométrique n'est ni illustré ni planifié avec son paramètre
(passes, recouvrement, sens de coupe et zone non isolée en J6, débourrage en J7, attaches et marge en J8, origine
et miroir en J10).

### 11.5 Interface

Onglets du panneau latéral **Projet / Outils / Analyse** (clavier : flèches, Début, Fin). « Zoomer sur la zone »
cadre la vue sur l'endroit le plus serré et l'entoure en jaune. Chaque nouveau bouton, champ et indicateur a son
infobulle (75 sujets d'aide au total).

### 11.6 Défauts trouvés en test navigateur et corrigés

- La validation native des champs numériques (pas `step`) bloquait silencieusement l'enregistrement de valeurs comme
  3,175 mm ou 10 000 tr/min : la validation est confiée à `validateTool()`.
- IndexedDB ne sait pas enregistrer les objets réactifs de Svelte : la bibliothèque n'était pas conservée au
  rechargement. Une copie simple est enregistrée ; le message « le navigateur refuse d'enregistrer » a permis de le
  voir.
- Illustrations : libellés coupés en bord de cadre et 0,075 arrondi à « 0,08 » ; en-tête trop chargé sur écran
  étroit.

### 11.7 Reporté

Le **comparateur d'outils** (section 6.10 : largeur, temps d'usinage estimé, zones non isolées et aperçu côte à
côte) a besoin des parcours d'isolation et de l'estimation de durée : il est reporté au jalon J6.

---

## 12. Résultats du jalon J6 (isolation, zones non isolées, comparateur)

### 12.1 Isolation (`src/cam/isolation/`)

- **Passes** comme FlatCAM (`ToolIsolation._pass_offset`) : la passe _i_ (à partir de 0) est à
  `l·(2i+1)/2 − i·r·l + d` du cuivre, avec _l_ la largeur effective de l'outil, _r_ le recouvrement et _d_ le
  décalage. Offsets à joints ronds (Shapely `buffer` chez FlatCAM), un parcours fermé par contour.
- **Sens de coupe** : en avalant, le cuivre conservé est à gauche de l'outil (broche horaire vue de dessus) ; en
  opposition, le sens inverse, plus tolérant au jeu des axes (choix par défaut, comme FlatCAM).
- **Ordre** : plus proche voisin, chaque boucle entrée à son sommet le plus proche ; passes combinées (par défaut) ou
  passe après passe sur toute la carte.
- **Mouvements** (`src/cam/toolpath/`) : changement d'outil, hauteur de sécurité, broche, puis pour chaque boucle
  rapide à la hauteur de déplacement, plongée à l'avance Z à chaque profondeur, coupe à l'avance XY, remontée. Un
  contrôle signale tout rapide sous la hauteur de déplacement ou dans la matière. La **durée estimée** compte
  chaque profondeur, chaque plongée et les rapides à 1 000 mm/min ; elle est calculée directement depuis les
  parcours (testée égale au parcours des mouvements), sans créer 500 000 objets sur une carte dense.

### 12.2 Comparaison avec FlatCAM Plus (FTDI_Max, travail Proteus de To)

Le G-code FlatCAM de référence est relu (`tests/helpers/flatcam.ts`) et comparé à nos parcours avec les mêmes
réglages (V-bit 30°, 0,2 mm de profondeur, décalage personnalisé 0,05 mm confirmé par To) :

| Critère                                       | Résultat         |
| --------------------------------------------- | ---------------- |
| Nombre de boucles                             | identique        |
| Chaque point FlatCAM sur un de nos parcours   | à moins de 2 µm  |
| Chacun de nos sommets sur un parcours FlatCAM | à moins de 70 µm |
| Longueur totale coupée                        | écart < 1 %      |

L'écart de 70 µm vient des arcs : FlatCAM les découpe en un nombre fixe de pas par cercle, nous par tolérance de
corde (0,5 µm), donc nos sommets tombent entre les siens. **Question pour To** : le décalage personnalisé existe
dans le moteur (`extraOffset`) mais n'est pas proposé dans l'interface. Faut-il l'ajouter ?

Avec les réglages par défaut (2 passes, recouvrement 15 %, opposition) :

| Outil         | Largeur  | Boucles | Longueur coupée | Durée estimée | Zones non isolées | Calcul |
| ------------- | -------- | ------- | --------------- | ------------- | ----------------- | ------ |
| V-bit 30° 0,2 | 0,254 mm | 41 + 21 | 1 593 mm        | 13,5 min      | 0                 | 30 ms  |
| V-bit 20° 0,1 | 0,126 mm | 41 + 41 | 1 815 mm        | 18,9 min      | 0                 | 13 ms  |
| Fraise 0,8 mm | 0,800 mm | 28 + 13 | 983 mm          | 8,5 min       | 62                | 53 ms  |

### 12.3 Zones non isolées

Pour chaque paire d'éléments plus proches que le diamètre de la première passe (les zones de l'analyse J5), la zone
est **l'intersection des enveloppes de première passe des deux éléments** : le cuivre que l'outil ne peut pas
enlever entre eux. FlatCAM ne donne qu'un ratio global ; ici chaque zone est située, dessinée en jaune et listée
(« Zoomer sur la zone »). Chaque élément est d'abord réduit à sa partie proche de l'autre (découpages successifs
par boîtes, exacts) : un plan de masse présent dans des centaines de zones n'est jamais grossi en entier.

### 12.4 Calcul en parallèle et performances

Le Worker CAM découpe l'isolation en parties indépendantes, calculées chacune dans un **sous-Worker** :

- chaque passe directement depuis le cuivre ;
- sauf les passes à plus de 0,5 mm du cuivre, grossies depuis la passe précédente. Grossir de a puis de b revient à
  grossir de a + b, et l'enveloppe précédente a déjà fusionné presque tout : 1,1 mm prend 33 s depuis le cuivre et
  0,3 s depuis l'enveloppe à 0,4 mm. Pour les petites distances, c'est l'inverse : l'enveloppe arrondie contient
  bien plus de points que le cuivre ;
- les zones non isolées.

L'assemblage (ordre des boucles, durée, emballage) se fait ensuite dans le Worker CAM. L'annulation termine le
Worker CAM, donc aussi ses sous-Workers. Un navigateur sans Workers imbriqués calcule les parties à la suite.
Un test vérifie que le résultat par parties est identique au calcul d'un seul tenant.

Banc `tests/bench/isolation.perf.ts` (Node 22, temps d'attente = partie la plus lente + assemblage) :

| Carte                                    | V-bit 30° 0,2 | V-bit 20° 0,1 | Fraise 0,8 | Objectif |
| ---------------------------------------- | ------------- | ------------- | ---------- | -------- |
| Carte dense de J1 (sans plan de masse)   | 0,9 s         | 0,8 s         | 1,7 s      | < 5 s    |
| Même carte avec plan de masse (pire cas) | 5,5 s         | 3,3 s         | 6,8 s      | —        |

Mesuré dans le navigateur avec le plan de masse : 6,1 s, 2,8 s et 6,5 s. **L'objectif de 5 s est tenu pour la carte
dense de référence, pas encore pour le pire cas avec plan de masse** : ses 140 dégagements très détaillés (100 000
points) coûtent cher à chaque offset. Pistes explorées et écartées :

- `clipper2-wasm` : seulement 1,3 fois plus rapide sur ces cas, pas de quoi justifier le chargement WASM ;
- découpage en tuiles : gain faible et raccords visibles ;
- calcul anneau par anneau : exact, mais gain seulement sur certaines distances.

Le banc avec plan de masse sert de garde-fou contre les régressions (limite 10 s).

### 12.5 Comparateur d'outils et interface

- 4e onglet **Usinage** : opérations d'isolation par couche (couche, outil, passes, recouvrement, sens, passes
  combinées), calcul avec barre de progression et annulation, résultat périmé signalé dès qu'un réglage change,
  visibilité, suppression.
- Superposition sur la carte : bande réellement fraisée (largeur de l'outil, à l'échelle), ligne centrale,
  déplacements en pointillés, zones non isolées en jaune.
- **Comparateur** : jusqu'à 3 outils calculés en parallèle sur la même couche. Largeur, longueur, durée estimée et
  zones non isolées côte à côte, avec un aperçu de la carte par outil. « Utiliser cet outil » le reporte dans
  l'opération.
- Illustrations : passes et recouvrement, sens de coupe (animé, arrêté si l'utilisateur réduit les animations),
  zone non isolée. Infobulles sur chaque nouveau contrôle.

### 12.6 Défauts trouvés et corrigés

- Le comparateur n'affichait que le premier résultat (comparaison par identité d'un objet remplacé) : chaque
  comparaison porte désormais un numéro.
- Modules périmés après rechargement à chaud de Vite (« does not provide an export named ») : redémarrage du serveur
  de développement, sans effet sur la version construite.
- Zones non isolées : 8,7 s sur la carte dense, ramenées à 3,4 s par le découpage autour de chaque paire.

---

## 13. Résultats du jalon J7 (perçage et optimisation)

### 13.1 Ordre des trous (`src/cam/drilling/order.ts`)

- **Plus proche voisin** accéléré par une grille (recherche par anneaux de cases autour de la position), identique à
  une recherche exhaustive (testé sur 400 points).
- **2-opt** sur le trajet ouvert (départ fixe, fin libre) : un segment du trajet est inversé dès que reconnecter deux
  arêtes le raccourcit. Les candidats sont les 12 voisins les plus proches de chaque trou, ce qui reste rapide sur des
  milliers de trous. Tests : plus aucun croisement sur 300 points aléatoires, au plus 10 % au-dessus de l'optimum
  calculé par force brute sur de petits ensembles.
- FlatCAM s'arrête au plus proche voisin (ou passe par OR-Tools, absent ici).

| 5 000 trous au hasard sur 10 x 10 cm | Distance | Calcul |
| ------------------------------------ | -------- | ------ |
| Ordre du fichier                     | 262,95 m | —      |
| Plus proche voisin                   | 6,30 m   | 8 ms   |
| Plus proche voisin + 2-opt           | 5,53 m   | 146 ms |

### 13.2 Plan de perçage (`src/cam/drilling/drilling.ts`)

- Trous regroupés **par outil**, du plus petit au plus grand (les petits forets sont les plus fragiles). Des tailles
  proches confiées au même foret sont percées ensemble.
- **Foret** : rapide au-dessus du trou à la hauteur de déplacement, plongée à l'avance Z, temporisation éventuelle,
  remontée. **Débourrage** : plongées successives, comme FlatCAM. Entre deux plongées, le foret remonte à la hauteur de
  déplacement puis redescend en rapide jusqu'à 0,5 mm au-dessus de la carte (jamais de rapide dans la matière),
  et repart en avance lente.
- **Fraise** (trou plus grand que les forets) : descente en **hélice** sur le cercle de rayon (trou − outil) / 2, un
  tour par passe de profondeur de l'outil, un dernier tour au fond, retour au centre. Plongée simple si la fraise a
  exactement la taille du trou.
- **Rainures** : fraisées en aller-retour le long du chemin, une passe de profondeur dans chaque sens.
- **Profondeur** : épaisseur de carte + 0,2 mm, suit l'épaisseur réglée dans l'analyse.
- **Problèmes signalés** : taille sans outil, fraise plus large que le trou, rainure faite au foret, foret nettement
  plus petit que le trou. Les mouvements de chaque outil passent le contrôle de sécurité de la section 7.

### 13.3 Interface

- Section **Perçage** dans l'onglet Usinage : « Nouveau perçage » reprend tous les fichiers de perçage et l'outil
  conseillé en J5 pour chaque taille de trou, puis calcule tout de suite.
- Par taille : foret ou fraise au choix, écart en mm et en %, badge « Hors tolérance », badge « Fraisé » avec son
  illustration. Cycle simple ou débourrage, profondeur, profondeur par débourrage, temporisation.
- Résultat : trous par outil, **distance économisée** par rapport à l'ordre du fichier (et au plus proche voisin
  seul), nombre d'outils à monter, durée estimée.
- Carte : trajet entre les trous en rose (comme les déplacements de l'isolation), cercles des trous fraisés et
  rainures en vert, ordre du fichier en pointillés gris sur demande. Le violet prévu au départ se confondait avec le
  cuivre de la face inférieure.
- Illustrations : cycle simple et cycle avec débourrage (point animé sur la courbe de hauteur du foret, arrêté si
  l'utilisateur réduit les animations), trou fraisé vu de dessus. Le sujet « débourrage » n'est plus en attente.

### 13.4 FTDI_Max

41 trous métallisés : foret 0,8 mm (12 trous de 0,762), foret 1,0 mm (27 trous de 1,016), fraise maïs 1,5 mm
(2 trous de 3 mm fraisés). Déplacements : **0,19 m au lieu de 0,21 m** (−10 %). Proteus range déjà bien ses trous ;
le gain est bien plus fort sur un fichier désordonné. Durée estimée 3 min 21 s en cycle simple, 6 min 49 s avec
débourrage tous les 0,5 mm.

### 13.5 Reste ouvert

- Pas encore de G-code : les mouvements sont prêts pour les post-processeurs (J9).
- Les trous métallisés et non métallisés peuvent être séparés en deux opérations ; rien ne l'impose.

---

## 14. Résultats du jalon J8 (détourage et attaches)

### 14.1 Contour (`src/cam/cutout/`)

- **Bord de la carte** pris dans une couche contour (Edge.Cuts, GKO…) : le plus grand contour, trous comblés. Un
  contour tracé en trait donne une bande autour du vrai bord : le bord retenu est le **milieu du trait**. La largeur
  du trait est déduite de la surface de la bande divisée par la longueur moyenne de ses deux bords (test : à moins
  de 1 µm du tracé d'origine). Un contour rempli est pris tel quel.
- **Forme exacte** : offset du bord de marge + rayon de la fraise, joints ronds (FlatCAM : `buffer(margin + dia/2)`).
  **Rectangle englobant** : rectangle du bord agrandi d'autant, coins vifs.
- **Sans couche contour** : rectangle autour du cuivre et des trous, avec 2 mm de marge par défaut (comme FlatCAM,
  la spécification 6.6 demande la boîte englobante avec marge).
- **Sens** : en avalant, la carte est à gauche de l'outil (sens antihoraire autour d'elle) ; en opposition (par
  défaut), le sens inverse. Même convention que l'isolation.
- Les découpes intérieures d'une carte (trous de forme dans le contour) ne sont pas encore usinées.

### 14.2 Attaches

- **Placement automatique** par distance le long de la coupe : régulier, la première au milieu du plus long côté
  droit. Sur un rectangle, 2 attaches tombent au milieu des grands côtés et 4 au milieu de chaque côté. Chaque attache
  est ensuite glissée sur une partie droite assez longue pour la tenir, jamais sur un coin arrondi. Le placement
  fonctionne aussi sur une carte ronde ou en L, contrairement aux positions fixes de FlatCAM (`4`, `2LR`, `2TB`…).
- **Placement à la main** : « Placer sur la carte » ; un clic sur la coupe ajoute une attache, un clic sur une attache
  la retire. Glisser déplace toujours la vue (un appui qui bouge de moins de 4 px est un clic).
- **Largeur** mesurée sur le bord de la carte : l'outil s'arrête à son rayon de chaque côté, l'interruption de la
  coupe vaut donc largeur + diamètre de la fraise.
- **Hauteur** = épaisseur de carte laissée sous l'attache, depuis le dessous de la carte. Seules les passes plus
  profondes que le haut des attaches remontent au-dessus (exigence 6.6 : attaches sur les dernières passes). Avec
  1,6 mm, 0,5 mm d'attache et 0,4 mm par passe : passes à 0,4 / 0,8 complètes, passes à 1,2 / 1,6 / 1,7 interrompues.
- La coupe redémarre au milieu du plus long tronçon sans attache : la fraise ne plonge jamais sur une attache.
- **Problèmes signalés** : aucune attache (la carte peut être projetée), attaches qui se chevauchent, trop
  nombreuses, aussi hautes que la carte.

### 14.3 Interface

- Section **Détourage** dans l'onglet Usinage : bord de la carte (couche contour ou « autour du cuivre »), forme,
  fraise conseillée en J5 avec son nombre de passes, marge, profondeur (épaisseur + 0,1 mm), sens, attaches (nombre,
  largeur, hauteur), boutons « Répartir » et « Placer sur la carte ».
- Le détourage n'est qu'un contour : il est **recalculé à chaque changement** (quelques millisecondes), sans Worker
  ni bouton « Calculer ».
- Carte : bande de la largeur de la fraise en vert, attaches en rouge.
- Illustration : carte vue de dessus avec la coupe et les attaches réparties comme le placement automatique,
  attache vue de côté avec la hauteur laissée. Les attaches sont agrandies sur la vue de dessus pour rester visibles
  dans une infobulle.
- Profondeurs par défaut arrondies : 1,6 + 0,1 s'affichait « 1,7000000000000002 » (aussi corrigé pour le perçage).

### 14.4 Carte d'exemple FTDI_Max

Pas de couche contour dans les fichiers Proteus : coupe rectangulaire à 2 mm du cuivre, fraise maïs 1,5 mm,
5 passes de 170,1 mm, 4 attaches au milieu des côtés, 6 min estimées.

### 14.5 Reste ouvert

- Découpes intérieures de la carte.
- Vérification que la coupe tient dans la course de la machine : avec les profils machine (J9 / J10).

---

## 15. Résultats du jalon J9 (post-processeurs et profils machine)

### 15.1 Moteur (`src/post/engine/`)

- **Profil JSON déclaratif** (`8cam-post`, version 1) : unités (G21 / G20 avec conversion), décimales des
  coordonnées et des avances, numérotation N, style de commentaire, arcs G2 / G3 natifs ou découpés en segments à
  moins de 5 µm, avance F modale ou sur chaque ligne, F sur les rapides, mots des quatre mouvements, gabarits de
  début, changement d'outil, broche, temporisation et fin, mots refusés. Les classes Python de FlatCAM deviennent des
  données que l'utilisateur peut modifier, importer et exporter.
- **Gabarits à variables** : `{safeZ}`, `{spindleSpeed}`, `{toolNumber}`, `{toolName}`, `{toolDiameter}`, `{feedXY}`,
  `{feedZ}`, `{seconds}`, `{milliseconds}`, `{rapidFeed}`, `{message}`, `{date}`, `{jobName}`… Une ligne de gabarit
  entre parenthèses est un commentaire, écrit dans le style du profil.
- **Écrivain unique** : en-tête commenté (logiciel et version, travail, date, machine et courses, unités, étendue X / Y,
  chaque opération avec son outil, ses avances, sa vitesse et ses hauteurs ; section 7), puis les mouvements. Seuls les
  axes qui changent sont écrits ; « -0.0000 » devient « 0.0000 ». Les commentaires sont réduits à l'ASCII sans
  parenthèses (« ° » → « deg », « Ø » → « D », accents retirés) : certains contrôleurs s'arrêtent sur le reste.
- **Extensible** : la broche est un gabarit (`M3 S…`), un profil laser (M4, puissance S) ne demandera que des
  gabarits et peut-être une variable de puissance.

### 15.2 Profils fournis

| Profil   | D'après FlatCAM | Particularités                                                                                                                     |
| -------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GRBL 1.1 | `GRBL_11.py`    | `G00`/`G01`, F modal ; **pas de M6** (GRBL 1.1 le refuse, erreur 20) : `M05`, montée, message, pause `M0` ; `M6` est un mot refusé |
| Marlin   | `Marlin.py`     | `;` pour les commentaires, F sur chaque coupe et sur les `G0`, `M400` avant `M5`, `G4 P` en millisecondes, `M0 message`            |
| LinuxCNC | `default.py`    | `T{n} M06` (LinuxCNC affiche sa fenêtre de changement d'outil), `G04 P` en secondes, `G40 G49` au début                            |

Tous démarrent la broche avec 2 s de temporisation pour qu'elle prenne sa vitesse.

### 15.3 Tests

- **Fichiers de référence** (`tests/golden/*.nc`) : un travail fixe (isolation de deux pastilles, trois trous avec
  débourrage et temporisation, détourage avec deux attaches), écrit avec chaque profil et comparé au caractère près.
  Le même travail sert d'aperçu dans l'interface (`src/post/engine/sample.ts`).
- **Relecture** : un lecteur G-code minimal (`reader.ts`) relit chaque fichier écrit. Les règles de sécurité de la
  section 7 sont vérifiées **sur le texte envoyé à la machine**, pas seulement sur les mouvements dont il vient. On
  vérifie aussi que la longueur coupée relue égale celle des mouvements et qu'aucun mot inconnu n'est écrit.
- Options : numérotation, pouces, arcs natifs ou découpés (chaque point à 10 mm du centre), mots refusés détectés,
  profils invalides refusés, import / export aller-retour.

### 15.4 Profil machine (`src/post/machine.ts`)

Champs de la section 5.1 (courses X / Y / Z, hauteur de sécurité, broche maxi, avances maxi) plus la vitesse des
rapides (estimation des durées, `F` des `G0` Marlin) et le profil de post-processeur de la machine. Il est rangé dans
`post` et non dans `project`, comme prévu au départ, parce que les vérifications de sécurité qui le lisent sont dans
`post` et que `post` ne peut pas importer `project`.

**Changement** : broche maxi par défaut **12 000 tr/min** au lieu de 10 000. La fraise maïs de la bibliothèque
d'origine tourne à 12 000 tr/min (tableau 6.10), et le travail FlatCAM de To indique aussi 12 000 : avec 10 000, la
bibliothèque d'origine aurait été signalée sur la machine d'origine.

**Vérifications d'un travail** (`checkJob`) : rapides et hauteurs (section 7), travail plus grand que la course X / Y,
profondeur + hauteur de sécurité au-delà de la course Z, hauteur de sécurité d'un outil au-delà de la course Z
(erreurs) ; avance ou broche au-dessus du maximum, profondeur de plus de 3 mm, avance de moins de 5 mm/min, diamètre
inhabituel (avertissements). La position du travail dans la course dépend de l'origine choisie : elle sera vérifiée
en J10 avec le choix de l'origine.

### 15.5 Interface

- 5e onglet **Machine** : machine utilisée, nouvelle (copie), import / export JSON, suppression (il en reste toujours
  une), champs avec infobulles. Les courses ont une illustration : plateau à l'échelle avec une carte de 10 x 10 cm.
- **Post-processeur** : choix du profil de la machine, description dans la langue de l'interface, « Copier pour
  modifier » (les profils fournis ne se modifient pas), import / export, suppression. L'éditeur couvre tous les champs
  du profil ; chaque modification valide est enregistrée tout de suite.
- **Aperçu en direct** coloré (mots G, mots M, coordonnées, avances, commentaires, numéros de ligne). Il est mis à jour
  à chaque frappe et accompagné des mots refusés trouvés (avec leur ligne), des problèmes de sécurité du texte relu et
  des avertissements du travail.
- Machines et profils sont enregistrés dans le navigateur (IndexedDB), vérifié après rechargement.

### 15.6 Défauts trouvés et corrigés

- Lignes vides en double dans l'aperçu (lignes en bloc plus sauts de ligne) : les lignes sont en ligne. Une copie de
  l'aperçu donne le G-code exact.
- Descriptions des profils fournis en anglais dans l'interface française : traduites.
- Une erreur « boucle d'effets » de l'infobulle est apparue une fois dans le panneau étroit, sans pouvoir être
  reproduite. Le placement de l'infobulle n'écrit plus une position inchangée et ne suit plus ce qu'il lit.

### 15.7 Reste ouvert

- Export du G-code du projet, backplot et choix de l'origine / miroir : J10.

---

## 16. Résultats du jalon J10 (export, simulation, sauvegarde du projet)

### 16.1 Placement sur la machine (`src/post/engine/setup.ts`)

- **Origine** : coin bas-gauche de la carte (par défaut), centre de la carte, ou origine des fichiers Gerber. La carte
  est le rectangle de toutes les couches, visibles ou non.
- **Miroir** gauche-droite pour fraiser la face inférieure d'une carte retournée : la carte est retournée autour de
  son propre axe vertical (elle reste en place), ou autour de l'axe Y Gerber quand l'origine Gerber est gardée. Les arcs
  changent de sens.
- **Le sens de coupe est conservé** : un miroir inverse tous les parcours, donc l'avalant deviendrait opposition. Les
  boucles d'isolation sont retournées avant le miroir et le détourage est recalculé dans l'autre sens. Testé : la
  première boucle tourne dans le même sens avec ou sans miroir. Exception : l'hélice des trous fraisés change de sens
  sous miroir (sans effet notable sur un trou).
- **Miroir désactivé par défaut**. Le travail FlatCAM de To sur la face inférieure de FTDI_Max n'était pas en miroir
  (nos parcours non mirés coïncident avec les siens à 2 µm, section 12.2). Quand une couche de dessous est isolée sans
  miroir, un message rappelle quand cocher le miroir.

### 16.2 Export (`src/workers/exportJob.ts`, dans le Worker CAM)

- Opérations calculées dans l'ordre d'usinage : isolation, perçage **un outil par opération** (chaque foret a son
  changement d'outil nommé), détourage. Chacune peut être décochée.
- Un seul fichier, ou **un fichier par opération** (`Nom-1-Isolation.nc`…). Nom par défaut tiré du premier fichier
  importé (`FTDI_Max`).
- Chaque fichier passe par le post-processeur de la machine (J9), puis par les vérifications : travail
  (`checkJob` : course, profondeur, vitesses, valeurs aberrantes) et **texte relu** (`checkGcode` : rapides, hauteurs
  de sécurité). Les mots refusés par le contrôleur sont signalés avec le fichier et la ligne.
- **Texte du G-code** coloré (1 500 premières lignes affichées, le fichier téléchargé est complet) et **modifiable à
  la main**. Le texte modifié est revérifié et c'est lui qui est téléchargé.
- Téléchargement fichier par fichier ou en une fois (`.nc`).

### 16.3 Simulation (backplot)

- Le **G-code écrit est relu** (lecteur de J9) et ramené dans les coordonnées de la carte. La simulation montre donc
  ce qui partira vers la machine, pas les parcours d'origine.
- Trajet complet en pâle, partie faite en couleur (coupes vertes, rapides roses en pointillés), outil en jaune, zéro
  machine marqué d'une croix rouge.
- Lecture et pause, curseur de position, vitesse ×1 à ×500, barre de progression, temps écoulé et total.
  La durée suit les avances, les rapides à la vitesse de la machine et les temporisations.
- La lecture avance par pas de 100 ms (dix images par seconde suffisent). Une première version suivait
  l'affichage du navigateur et s'arrêtait quand la fenêtre n'était pas redessinée.

### 16.4 Projet (`src/project/projectFile.ts`)

- Fichier `.8cam.json` (`8cam-project`, version 1) : **contenu des fichiers importés**, affichage des couches,
  épaisseur, bibliothèque d'outils, machine (et son post-processeur s'il est personnel), opérations avec leurs
  réglages (attaches comprises), origine, miroir et options d'export. Les résultats ne sont pas enregistrés : ils sont
  recalculés à l'ouverture.
- **Ouvrir** remplace le projet (après confirmation) : fichiers importés de nouveau dans le même ordre, outils du projet
  remis dans la bibliothèque (même identifiant remplacé), machine ajoutée ou mise à jour, opérations recalculées.
  On peut aussi déposer le fichier sur la fenêtre.
- Testé dans le navigateur : FTDI_Max enregistré puis rouvert, mêmes couches dans le même ordre, isolation, perçage
  (3 forets) et détourage (4 attaches) recalculés.

### 16.5 Illustration origine et miroir

**Miniature de la carte réelle** (spécification 6.12) : le cuivre de la première couche, simplifié à quelques
centaines de points, posé comme sur la machine (en miroir si coché), avec le zéro et les axes X / Y. Une carte simple
la remplace avant tout import. Plus aucun sujet géométrique n'attend son illustration.

### 16.6 Flux complet sur FTDI_Max (critère du jalon)

Carte d'exemple → isolation V-bit 30° → perçage (forets 0,8 et 1,0, fraise maïs 1,5 pour les trous de 3 mm) →
détourage 4 attaches → G-code GRBL 1.1 : **9 709 lignes, 23 min 06 s**, vérifications passées, 36,8 x 48,2 mm sur la
machine à partir de X −2,75 / Y −2,75. Ce décalage négatif est voulu : le détourage passe à 2 mm de marge plus le
rayon de fraise autour du cuivre, donc avant le coin du cuivre pris comme origine.

**À valider par To sur la CNC** : seule la machine réelle dira si le fichier est utilisable (profondeurs, avances,
réglage du zéro). Points à surveiller : le premier changement d'outil (pause `M0` de GRBL) et le détourage, qui commence
légèrement en X / Y négatifs.

### 16.7 Reste ouvert (J11)

Panneau d'aide complet, guide « Ma première carte », relecture EN, finitions.

---

## 17. Résultats du jalon J11 (aide, guide, anglais, finitions)

### 17.1 Infobulles : couverture vérifiée par les tests

- `tests/unit/ui/coverage.test.ts` lit tous les composants et échoue si un bouton, un champ, une liste ou un indicateur
  n'a pas de sujet d'aide (`use:help` ou `help=`). Exceptions listées et justifiées : champs de fichier cachés (le
  bouton qui les ouvre a son aide), commandes de l'aide elle-même, page styleguide, cases à cocher dans une étiquette
  ou un groupe qui porte l'aide.
- Le premier passage a trouvé **5 commandes sans aide** (deux boutons « Fermer », le choix du fichier et la zone de
  modification du G-code, les boutons « zoomer sur la zone » de l'isolation) : corrigées.
- Chaque sujet utilisé dans le code existe et a ses textes ; **chaque paramètre numérique a une valeur conseillée**
  (un champ en manquait : la numérotation des lignes du post-processeur). Le test a été vérifié en retirant une
  valeur conseillée : il échoue bien.
- Textes du tableau 6.11 repris tels quels ; le conseil « Miroir » reprend la phrase du cahier des charges
  (« obligatoire pour la face arrière d'une carte double face »).
- **163 sujets d'aide**, tous illustrés quand ils sont géométriques. Plus aucun sujet n'attend son illustration.

### 17.2 Guide « Ma première carte »

Dans le panneau d'aide (onglet **Ma première carte**, et bouton « Guide pas à pas » sur l'écran d'accueil), 8 étapes :
importer, lire l'analyse, vérifier les outils, isoler, percer, détourer, écrire le G-code, sur la machine.

- L'état de chaque étape est **lu dans le projet** : fichiers importés, onglets Analyse et Outils ouverts,
  opérations calculées, G-code écrit. Le perçage est marqué « sauté » sans fichier de perçage. Une barre indique
  l'avancement et l'étape à faire est mise en avant avec son illustration.
- Chaque étape a un bouton qui **la fait avec les réglages conseillés** (charger la carte d'exemple, créer
  l'isolation…) ou ouvre l'endroit où elle se fait.
- Testé dans le navigateur de bout en bout sur la carte d'exemple : 7 étapes sur 7, sans erreur.

### 17.3 Panneau d'aide

Deux onglets : le guide et le **glossaire illustré** (tous les sujets par thème, avec illustration, valeur conseillée
et mise en garde). Une **recherche** filtre le glossaire sans tenir compte des accents ni des majuscules (« decalage »
trouve « Décalage »).

### 17.4 Anglais

Les deux catalogues ont exactement les mêmes clés (vérifié à la compilation). Un nouveau test refuse les accents et les
mots français courants dans le catalogue anglais : aucun reste. Les 27 valeurs identiques en français et en anglais
sont des mots communs aux deux langues (Simulation, Isolation, Notes…).

### 17.5 Finitions

- Les durées estimées des cartes d'opération et du comparateur utilisent la **vitesse des rapides de la machine
  utilisée** (onglet Machine), comme l'export, au lieu d'une valeur fixe de 1 000 mm/min.
- Commentaires périmés corrigés (annulation non prévue au cahier des charges, renvois aux jalons).
- README : utilisation, déploiement (site statique, aucun serveur), bancs de mesure.

### 17.6 Couverture des tests (exigence section 8 : > 80 %)

| Périmètre                        | Lignes | Branches | Fonctions |
| -------------------------------- | ------ | -------- | --------- |
| `core`, `parsers`, `cam`, `post` | 97 %   | 89 %     | 99 %      |

Le module le plus bas est `cam/cutout` (99 % des lignes, 78 % des branches : il reste les valeurs de repli
défensives). 304 tests unitaires, 3 fichiers G-code de référence, bancs de mesure séparés.

---

## 18. Bilan de la V1

### 18.1 Cahier des charges

| Exigence                                                      | Statut                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Gerber RS-274X / X2, Excellon, perçage Gerber X2              | fait (J2, J3)                                                                  |
| Bibliothèque d'outils, analyse, recommandations, comparateur  | fait (J5, J6)                                                                  |
| Isolation, zones non isolées                                  | fait, équivalente à FlatCAM à 2 µm (J6)                                        |
| Perçage optimisé, débourrage, trous fraisés, rainures         | fait (J7)                                                                      |
| Détourage, attaches automatiques et manuelles                 | fait (J8)                                                                      |
| Post-processeurs JSON GRBL, Marlin, LinuxCNC, éditeur, aperçu | fait (J9)                                                                      |
| Origine, miroir, export, simulation, projet                   | fait (J10)                                                                     |
| Infobulles complètes, illustrations, guide, FR / EN           | fait (J11)                                                                     |
| Parsing 5 Mo < 3 s                                            | 0,4 s pour 9,2 Mo (J4)                                                         |
| Isolation 2 passes, carte dense < 5 s                         | 0,9 s sans plan de masse ; 3 à 7 s avec plan de masse (pire cas, section 12.4) |
| Interface jamais bloquée                                      | calculs lourds dans des Workers, annulables                                    |
| Précision < 1 µm                                              | tests à l'appui (sections 6.3, 14.1)                                           |
| Couverture > 80 %                                             | 97 % des lignes (17.6)                                                         |

### 18.2 Reste ouvert

- **Essai sur la CNC de l'atelier** : seul critère que les tests ne peuvent pas remplacer (J10).
- Isolation d'une carte dense **avec plan de masse** : jusqu'à 7 s au lieu de 5 s (section 12.4).
- Découpes intérieures d'une carte (trous de forme dans le contour) : non usinées.
- Couche contour réelle (Edge.Cuts, GKO) : couverte par des tests, pas encore essayée dans le navigateur faute de
  fichier.
- Sous miroir, l'hélice des trous fraisés change de sens (sans effet notable).
- Hors périmètre V1 (section 11 du cahier des charges) : gravure laser, retrait du cuivre (NCC), panelisation, double face avec trous d'alignement, pilotage direct (WebSerial), carte de hauteur, DXF / SVG, vue 3D, DRC.

---

## 19. Post-processeur Snapmaker Artisan (après la V1)

### 19.1 Sources

Pas de documentation officielle complète : le profil s'appuie sur le **code source publié par Snapmaker**, lu le
28/10/2026.

- `Snapmaker/Artisan-Controller` (firmware de l'Artisan, Marlin 2.1) : `snapmaker/src/gcode/M3-M5.cpp`,
  `snapmaker/src/module/toolhead_cnc_200w.h`, `Marlin/src/gcode/feature/pause/M600.cpp`, `Marlin/src/gcode/gcode.cpp`,
  `Marlin/Configuration_adv.h`.
- `Snapmaker/Snapmaker-Artisan-Screen-App` (écran tactile) : `SnapmakerParser.java` (lecture de l'en-tête).
- `Snapmaker/Luban` : `src/server/lib/parseGcodeHeader.js` (en-tête ajouté aux G-code externes, extension `.cnc`).
- `Snapmaker/snapmaker_cnc_post_process` : post-processeurs officiels (Fusion 360, Aspire, FreeCAD) et
  `gcode_reference.md`.
- `Snapmaker/Snapmaker2-Controller` (firmware de la 2.0), pour comparer.

### 19.2 Ce que le firmware de l'Artisan accepte

| Point              | Constat dans le code                                                                                                                  | Choix du profil                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Broche 200 W       | `M3 P<pourcentage>` ou `M3 S<tr/min>` ; vitesse ramenée entre 8 000 et 18 000 tr/min                                                  | `M3 S{spindleSpeed}` puis `G4 S3` (montée en vitesse)  |
| Changement d'outil | pas de `M6` ; `M0` / `M1` non compilés (`HAS_RESUME_CONTINUE` faux) ; `M76` ne met en pause que le minuteur                           | `M5`, montée à la hauteur de sécurité, message, `M600` |
| `M600`             | réécrit par Snapmaker : attend la fin des mouvements, met la tâche en pause (« pause G-code » à l'écran), reprend à la ligne suivante | pause du changement d'outil                            |
| Arcs               | `ARC_SUPPORT` actif sur l'Artisan (pas dans la documentation de la 2.0)                                                               | petits segments, comme les post-processeurs officiels  |
| Avance             | Marlin garde **une seule avance** pour `G0` et `G1`                                                                                   | `F` sur chaque coupe (voir 19.4)                       |
| Écran              | lit un bloc `;Header Start` … `;Header End` : type `cnc`, lignes, durée, étendue X / Y / Z, vitesses, puissance                       | bloc écrit en tête de fichier                          |
| Extension          | Luban reconnaît un fichier CNC à son extension                                                                                        | `.cnc`                                                 |

### 19.3 Moteur

- **En-tête de fichier** (`fileHeader`, facultatif) : lignes écrites en premier, telles quelles, avec des valeurs
  du travail entier : `{lineCount}` (remplacé une fois le fichier écrit), `{estimatedSeconds}`, `{xMin}` … `{zMax}`,
  `{workSpeed}`, `{spindlePercent}` (rapporté à la broche maxi de la machine).
- **Extension** des fichiers par profil (`fileExtension`, `nc` par défaut). Les profils enregistrés avant ces deux
  champs sont complétés à l'ouverture.
- **Vitesse de broche minimale** dans le profil machine (0 par défaut) : un outil plus lent est signalé, la machine
  le ferait tourner plus vite.
- **Modèles de machine** : « Ajouter un modèle… » dans l'onglet Machine propose la CNC 3018 et la Snapmaker Artisan
  (400 x 400 mm, broche 8 000 à 18 000 tr/min, 3 000 mm/min, post-processeur Snapmaker). La course Z (60 mm) et la
  vitesse des rapides sont prudentes : à vérifier avec le module et la planche martyre en place.
- Le lecteur de G-code connaît `M600`.

### 19.4 Défaut trouvé et corrigé : l'avance après un rapide

Quand un profil écrit `F` sur les rapides (Marlin, Snapmaker) et l'avance seulement quand elle change, une coupe qui
suit un `G0 … F3000` repartait **à 3 000 mm/min** : Marlin n'a qu'une avance pour `G0` et `G1`. Le défaut est apparu
en comparant la durée de l'en-tête (calculée sur les mouvements) à celle de la simulation (G-code relu comme Marlin le
lit). Corrections :

- l'écrivain oublie l'avance courante après un rapide qui porte un `F` : la coupe suivante réécrit la sienne ;
- le profil Snapmaker écrit `F` sur chaque coupe ;
- nouveau test pour tous les profils : chaque coupe relue dans le G-code avance à une des avances des outils, jamais à
  la vitesse des rapides. Vérifié en retirant les deux corrections : le test échoue.

Le profil Marlin (J9) n'était pas touché : il écrit déjà `F` sur chaque ligne.

### 19.5 Changement d'outil : un fichier par outil

**Pourquoi.** Les outils n'ont pas la même longueur : le zéro Z doit être refait à chaque changement d'outil. Sur
l'Artisan, c'est impossible au milieu d'un fichier (constats dans le code source, 28/10/2026) :

- pendant une tâche CNC en pause, l'écran ne propose que la vitesse de travail, l'enceinte et le purificateur
  (`PrintA400AdjustmentContainerFragment.java`) : pas de jog, pas de réglage d'origine ;
- à la reprise, le firmware ramène l'outil à la position enregistrée et continue (`job_ctrl.cpp`, `resume_env`) ;
- pas de palpage : `G38_PROBE_TARGET` n'est pas compilé.

**Ce qui est fait.**

- Le profil machine a un mode de **changement d'outil** : pause dans un seul fichier (par défaut), ou **un fichier
  par outil, zéro Z refait** (choisi pour le modèle Snapmaker Artisan).
- En mode fichiers séparés, l'export écrit un fichier par outil. Les opérations consécutives d'un même outil vont
  dans le même fichier : sur FTDI_Max, la fraise maïs fraise les trous de 3 mm puis détoure, dans
  `FTDI_Max-4-Drilling_Cutout-…`. Les fichiers sont numérotés dans l'ordre d'usinage et nommés en ASCII avec l'outil.
- Chaque fichier dit en commentaire son rang, l'outil à monter et le zéro à faire : X, Y et Z pour le premier, Z
  seulement pour les suivants. L'export affiche la même marche à suivre.
- **Premier changement d'outil** (`firstToolChange`, facultatif dans un profil) : l'outil est monté et le zéro fait
  avant de lancer le fichier, donc la Snapmaker n'y fait plus de pause (arrêt broche et montée seulement).
- **Défaut corrigé** (tous les profils) : deux opérations consécutives du même outil écrivaient un changement d'outil
  vers l'outil déjà monté, donc une pause inutile. Un changement vers l'outil monté n'écrit plus rien.

### 19.6 À vérifier sur la machine

- Garder le même zéro X / Y d'un fichier à l'autre : ne refaire que Z après le premier fichier.
- En mode pause (un seul fichier), la reprise après `M600` garde le zéro Z du premier outil : à réserver à des outils
  de même longueur.
- Les attaches et le perçage descendent sous la carte : planche martyre indispensable.

---

## 20. Parcours étape par étape (onglets Usinage et Machine)

L'onglet Usinage empilait isolation, perçage, détourage et export : trop chargé. Les deux derniers onglets sont
maintenant des **étapes repliables**, une seule ouverte à la fois par onglet :

| Onglet  | Étapes                                                                           |
| ------- | -------------------------------------------------------------------------------- |
| Usinage | 1 Isolation, 2 Perçage, 3 Détourage                                              |
| Machine | 1 Machine, 2 Post-processeur (avec son aperçu), 3 Export du G-code, 4 Simulation |

- `StepSection` (`src/ui/components/base`) : en-tête cliquable avec un numéro (une coche verte une fois l'étape faite),
  le titre et un résumé (« 1 opération(s), 1 calculée(s) », nom de la machine, nombre de fichiers, durée simulée), puis
  un bouton « Étape suivante ». Le détourage mène à l'export, dans l'onglet Machine.
- L'étape ouverte de chaque onglet est dans `navigation.sections` (`openSection`, `toggleSection`) ; le guide « Ma
  première carte » ouvre directement la bonne étape.
- Les étapes repliées restent montées (attribut `hidden`) : une carte en cours de modification ou une simulation en
  lecture garde son état.
- L'ancien panneau d'export est coupé en deux : `ExportPanel` (réglages, écriture, vérifications, fichiers) et
  `SimulationPanel` (lecture du trajet, texte modifiable).

---

## 21. Bulles d'aide moins envahissantes

- **Champs numériques** : la bulle ne s'ouvre plus au survol ni au clic dans le champ. Elle s'ouvre, épinglée, par un
  clic sur le « ? » à côté du libellé, et se ferme par un second clic. F1 dans le champ l'ouvre toujours.
- **Focus** : la bulle ne s'ouvre au focus qu'au clavier. Un clic dans une liste ou un champ texte ne l'ouvre plus.
- **Listes déroulantes** : pas de bulle au survol tant que la liste a le focus, sinon elle recouvrirait la liste ouverte.
- **Délai de survol** porté de 400 à 700 ms : passer la souris sur les boutons n'ouvre plus de bulles au passage.
- **Contrôles évidents sans bulle** : fermer, annuler, supprimer, monter / descendre, afficher / masquer, zoom, langue,
  thème, import / export de profils, noms, lecture de la simulation, en-têtes des étapes. Ils portent un sujet vide
  (`help=""`), et le test de couverture distingue toujours un sujet oublié d'un sujet retiré exprès. Les boutons à icône
  sans bulle gardent leur nom en infobulle native. Les sujets devenus inutiles sont retirés du glossaire.

---

## 22. Archive zip de fabrication

Les fichiers de fabrication arrivent souvent dans un zip. On peut glisser ou ouvrir le zip entier :

- `src/core/zip.ts` lit l'archive sans dépendance : répertoire central, entrées stockées ou compressées (deflate, par
  le `DecompressionStream` du navigateur). Non lus et signalés : ZIP64, entrées chiffrées, autres méthodes de
  compression.
- `src/project/archive.ts` garde les fichiers reconnus comme Gerber (`looksLikeGerber` : commande `%FS` ou `%MO` au
  début) ou Excellon (`looksLikeExcellon`), quel que soit leur dossier ou leur extension. Les zips contenus dans le zip
  sont ouverts aussi (un niveau). Les fichiers binaires, les `__MACOSX` et les fichiers cachés sont écartés.
- L'onglet Projet affiche une note par archive : nombre de fichiers importés et liste repliable des fichiers laissés
  de côté (plan, `.gbrjob`, readme…). Une archive sans fichier utilisable est signalée en jaune, une archive illisible
  comme un échec d'import.
- Tests : un petit écrivain de zip (`tests/helpers/zip.ts`) fabrique les archives, dont une archive de fabrication avec
  un zip imbriqué.

---

## 23. Réglages par défaut du site

Les réglages des nouvelles opérations sont les mêmes pour tous les utilisateurs et se règlent côté site, pas dans le
navigateur de chacun (un premier essai de réglages par utilisateur a été retiré).

- **Fichier `public/defaults.json`**, copié tel quel à côté de l'application par la construction (`dist/defaults.json`).
  On le modifie **sur le serveur, sans reconstruire** : la valeur s'applique au prochain chargement de la page (le
  fichier est redemandé au serveur à chaque chargement).
- Réglages : isolation (passes, recouvrement, sens, passes groupées, décalage), perçage (cycle, profondeur de
  débourrage, temporisation), détourage (mode, sens, nombre, largeur et hauteur des attaches). Les profondeurs, les
  couches et les outils restent choisis selon la carte. Les clés qui commencent par `$` sont des commentaires.
- Un réglage absent ou invalide garde la valeur du code (`BUILT_IN_DEFAULTS`, `src/project/defaults.ts`), et la
  console du navigateur dit lequel. Fichier absent ou illisible : toutes les valeurs du code.
- Valeurs actuelles : isolation **en avalant (climb)**, comme FlatCAM ; le reste inchangé.
- **Machine de base** (bloc `machine`, mêmes champs qu'un fichier `.8cam-machine.json` exporté de l'onglet Machine) :
  celle d'un utilisateur qui n'a encore aucune machine enregistrée. Elle n'est pas enregistrée chez lui tant qu'il ne
  modifie pas ses machines, donc un changement du fichier s'applique encore ; un utilisateur qui a déjà ses machines
  les garde. Bloc absent ou invalide : la CNC 3018 du code. Valeur actuelle : « SnapMaker » (400 x 400 mm,
  post-processeur Snapmaker Artisan).
- Le test `tests/unit/project/defaults.test.ts` vérifie que le fichier livré est lu sans erreur.
