# Prompt Claude Code : PCB CAM Web (équivalent FlatCAM Plus, V1)

> Copie ce fichier tel quel dans Claude Code, lancé à la racine d'un **nouveau dépôt vide**.
> Le dossier `FlatCAM-master` doit être accessible en lecture comme implémentation de référence.

---

## 1. Rôle et contexte

Tu es un ingénieur logiciel senior spécialisé en géométrie computationnelle, en FAO (CAM) pour circuits imprimés et en applications web TypeScript.

Nous sommes un fablab (8 Fablab Drôme). Nous utilisons aujourd'hui **FlatCAM Plus** (Python / PyQt / Shapely) pour transformer des fichiers Gerber et Excellon en G-code destiné à nos fraiseuses CNC. Nous voulons un **équivalent web**, sans installation, qui tourne entièrement dans le navigateur.

Le code source de FlatCAM Plus est disponible dans `../FlatCAM-master` (adapter le chemin si besoin). Sers-t'en comme **référence fonctionnelle et algorithmique**, en particulier :

| Sujet | Fichiers de référence |
|---|---|
| Parsing Gerber | `appParsers/ParseGerber.py` |
| Parsing Excellon | `appParsers/ParseExcellon.py` |
| Noyau géométrique et génération G-code | `camlib.py` |
| Isolation | `appPlugins/ToolIsolation.py` |
| Perçage | `appPlugins/ToolDrilling.py` |
| Détourage | `appPlugins/ToolCutOut.py` |
| Post-processeurs | `appPreProcessor.py`, `preprocessors/GRBL_11.py`, `preprocessors/Marlin.py`, `preprocessors/default.py` |
| Base d'outils | `appDatabase.py` |

Licence : la base FlatCAM est sous MIT, mais certains composants ont leur propre licence. **Ne copie pas de code** : réimplémente en TypeScript en t'inspirant des algorithmes et des comportements, et cite la référence dans les commentaires quand c'est pertinent.

---

## 2. Objectif de la V1

Une application web qui permet de :

1. **Charger** des fichiers Gerber (RS-274X) et Excellon (perçage).
2. **Visualiser** les couches (cuivre, contour, perçages) avec zoom, déplacement et mesure.
3. **Définir des outils** (fraises, V-bits, forets) dans une bibliothèque réutilisable.
4. **Générer des parcours d'outils** pour trois opérations :
   - isolation des pistes ;
   - perçage ;
   - détourage de carte avec attaches.
5. **Prévisualiser** les parcours (backplot) et **exporter le G-code** via des post-processeurs configurables (GRBL, Marlin, LinuxCNC, profils personnalisés).

La V1 s'arrête là. Voir la section 11 pour ce qui est hors périmètre.

---

## 3. Contraintes techniques

- **Langage** : TypeScript en mode `strict`, aucun `any` non justifié.
- **Build** : Vite. **Tests** : Vitest. **Lint / format** : ESLint + Prettier configurés pour respecter les conventions de la section 4.
- **Exécution 100 % client** : pas de backend, pas d'envoi de fichiers sur un serveur. L'application doit pouvoir fonctionner hors ligne (PWA en option, à prévoir dans l'architecture).
- **Géométrie** : Clipper2 (portage JS/WASM, par exemple `clipper2-js` ou équivalent maintenu) pour les unions, différences et offsets. Propose et justifie ton choix de bibliothèque avant de l'intégrer.
- **Précision** : coordonnées internes en **entiers** (nanomètres ou 1/10 µm) pour Clipper, conversion en mm uniquement aux frontières (import, affichage, export).
- **Calculs lourds dans des Web Workers** (parsing, union des apertures, offsets, optimisation de trajet) pour ne jamais bloquer l'interface. Progression et annulation possibles.
- **Rendu** : Canvas 2D ou WebGL derrière une interface de rendu abstraite, pour pouvoir changer de moteur sans toucher au reste. Doit rester fluide (60 fps en pan/zoom) sur une carte de 10 x 10 cm dense.
- **UI** : framework au choix (propose et justifie : Svelte, Vue, React ou Web Components natifs). Interface en **français et anglais** (i18n dès le départ).
- **Navigateurs** : dernières versions de Chrome, Firefox, Edge, Safari.

---

## 4. Conventions de code (obligatoires)

- **Style d'accolades Allman** : l'accolade ouvrante sur sa propre ligne, partout (classes, fonctions, `if`, boucles, objets de contrôle).
- **Membres privés** : préfixe `m` puis nom en camelCase avec majuscule, ex. `mApertureTable`, `mToolDiameter`. Utiliser `private` (ou `#` si justifié, mais garder le préfixe `m`).
- **Membres publics** : camelCase commençant par une minuscule, ex. `toolDiameter`.
- **Tous les commentaires, messages de log, chaînes d'erreur et identifiants sont en anglais.** Les textes affichés à l'utilisateur passent par les fichiers i18n (FR et EN).
- Fonctions pures pour le cœur géométrique et CAM (pas d'accès DOM), afin d'être testables sans navigateur.

Exemple attendu :

```ts
export class IsolationJob
{
    private mTool: Tool;
    private mPassCount: number;

    public overlapRatio: number;

    constructor(tool: Tool, passCount: number)
    {
        this.mTool = tool;
        this.mPassCount = passCount;
        this.overlapRatio = 0.1;
    }

    public computeOffsets(): number[]
    {
        // Each pass is offset by the effective cutting width minus the overlap
        const offsets: number[] = [];
        for (let i = 0; i < this.mPassCount; i++)
        {
            offsets.push(this.mTool.effectiveWidth() * (0.5 + i * (1 - this.overlapRatio)));
        }
        return offsets;
    }
}
```

---

## 5. Architecture attendue

Organise le dépôt en modules à dépendances descendantes uniquement (l'UI dépend du cœur, jamais l'inverse) :

```
src/
  core/
    units/          conversions mm / inch / internal integer units
    geometry/       polygon, polyline, arc discretisation, Clipper wrapper, bbox
  parsers/
    gerber/         lexer, parser, aperture macros, region builder
    excellon/       header, tools, hits, slots
  cam/
    tools/          tool model and tool library
    isolation/
    drilling/
    cutout/
    toolpath/       toolpath model, path ordering optimisation
  post/
    profiles/       grbl.json, marlin.json, linuxcnc.json
    engine/         profile interpreter and G-code writer
  project/          project model, save/load (JSON), undo/redo
  workers/          worker entry points and message protocol
  render/           renderer interface + implementation
  ui/               panels, canvas view, dialogs, i18n
    illustrations/  parametric SVG diagrams and tool profiles
    help/           HelpTip component, help panel, guided tutorial
    theme/          design tokens, fonts, brand components
assets/brand/       logo and patterns supplied by 8 Fablab
tests/
  fixtures/         real Gerber/Excellon files (KiCad, Eagle, EasyEDA, Altium)
```

---

## 6. Exigences fonctionnelles détaillées

### 6.1 Import Gerber (RS-274X)

Doit gérer au minimum :
- `%FS` (format, zéros de tête / de queue, absolu / incrémental), `%MO` (MM / IN) ;
- apertures standard `C`, `R`, `O`, `P` avec trou éventuel ;
- **macros d'aperture `%AM`** avec primitives 1, 4, 5, 7, 20, 21, variables et expressions arithmétiques ;
- `D01` / `D02` / `D03`, interpolation `G01`, `G02`, `G03`, modes `G74` / `G75` ;
- **régions** `G36` / `G37` ;
- **polarité** `%LPD` / `%LPC` (soustraction des zones claires) ;
- **step and repeat** `%SR` ;
- attributs X2 (`%TF`, `%TA`, `%TO`) : lus et conservés, utilisés pour détecter automatiquement le type de couche si présents ;
- commandes obsolètes courantes (`G54`, `G70` / `G71`, `G90` / `G91`, `M02`) tolérées.

Sortie : un ensemble de polygones (avec trous) unifiés représentant le cuivre, plus les entités sources (flashs, traces) conservées pour l'affichage et le débogage.
Erreurs : un fichier partiellement invalide ne doit pas faire planter l'application ; afficher des avertissements avec le numéro de ligne.

### 6.2 Import Excellon

- En-tête `M48`, `METRIC` / `INCH`, `LZ` / `TZ`, formats implicites courants (KiCad, Eagle, Altium) avec possibilité de forcer le format dans l'UI ;
- définitions d'outils `TnnCxx` ;
- trous (hits) et **rainures** (`G85` et routage `G00` / `M15` / `M16` / `G01`) ;
- distinction trous métallisés / non métallisés si l'information est disponible.

### 6.3 Bibliothèque d'outils

Modèle d'outil :

| Champ | Description |
|---|---|
| `id`, `name` | identifiant, nom lisible |
| `type` | `endmill`, `vbit`, `drill` |
| `diameter` | diamètre (mm) |
| `tipDiameter`, `tipAngle` | pour V-bit : largeur effective calculée selon la profondeur |
| `cutDepth`, `depthPerPass` | profondeur totale et par passe |
| `feedXY`, `feedZ`, `spindleSpeed` | avances et vitesse broche |
| `travelZ`, `safeZ` | hauteurs de déplacement |

Bibliothèque persistée localement (IndexedDB), import / export JSON. Bibliothèque par défaut : voir section 6.10.

### 6.4 Isolation des pistes

- Entrée : une couche cuivre + un outil.
- Paramètres : nombre de passes, recouvrement (%), sens (avalant / opposition), option « passes combinées », option « isoler uniquement la sélection » (V1 : facultatif).
- Algorithme : offset extérieur successif des polygones de cuivre (Clipper, jointures rondes), extraction des contours comme parcours fermés, orientation selon le sens de coupe.
- Pour un V-bit, largeur effective = `tipDiameter + 2 * cutDepth * tan(tipAngle / 2)`.
- **Détection des zones non isolées** : signaler à l'utilisateur les endroits où l'outil est trop gros pour passer entre deux pistes (comparer la géométrie isolée à l'attendue) et les afficher en surbrillance.

### 6.5 Perçage

- Entrée : un fichier Excellon.
- Association des outils Excellon aux outils de la bibliothèque (correspondance automatique par diamètre le plus proche avec tolérance, modifiable manuellement).
- Trous plus grands que le foret disponible : option « fraiser le trou » (parcours hélicoïdal ou circulaire avec une fraise).
- Rainures : fraisage le long du segment.
- **Optimisation de l'ordre des trous** par outil : plus proche voisin + amélioration 2-opt, avec mesure de la distance économisée.
- Cycle de perçage : simple ou débourrage (peck) configurable.

### 6.6 Détourage

- Entrée : couche contour (Edge.Cuts / GKO) ou, à défaut, boîte englobante de la carte avec marge.
- Modes : forme exacte, rectangle englobant.
- Offset de la moitié du diamètre outil vers l'extérieur.
- **Attaches (tabs)** : nombre, largeur, hauteur ; placement automatique (répartition sur les côtés) et manuel (clic sur le contour).
- Multi-passes selon `depthPerPass`, attaches respectées sur les dernières passes uniquement.

### 6.7 Modèle de parcours d'outils

Format intermédiaire indépendant de la machine :

```ts
type Move =
    | { kind: "rapid"; x?: number; y?: number; z?: number }
    | { kind: "linear"; x?: number; y?: number; z?: number; feed: number }
    | { kind: "arc"; cw: boolean; x: number; y: number; i: number; j: number; feed: number }
    | { kind: "toolChange"; toolId: string }
    | { kind: "spindle"; on: boolean; rpm?: number }
    | { kind: "dwell"; seconds: number }
    | { kind: "comment"; text: string };
```

Chaque opération produit une liste de `Move` ; le post-processeur la traduit en G-code.

### 6.8 Post-processeurs configurables

- Un post-processeur est un **profil JSON** décrivant : unités, nombre de décimales, numérotation des lignes, style de commentaire, en-tête, pied, séquence de changement d'outil (M6 ou manuel avec pause), démarrage / arrêt broche, support des arcs (`G2` / `G3` ou discrétisation), commandes de pause, mots-clés à éviter.
- Gabarits avec variables (`{toolDiameter}`, `{spindleSpeed}`, `{feedXY}`, `{safeZ}`, `{date}`, etc.).
- Profils fournis : **GRBL 1.1**, **Marlin**, **LinuxCNC**. S'inspirer de `preprocessors/GRBL_11.py`, `Marlin.py` et `default.py` pour les séquences exactes.
- Éditeur de profil dans l'UI avec aperçu G-code en direct ; import / export des profils.
- Le moteur doit rester extensible pour accueillir plus tard des profils laser (M3 / M4, puissance S) sans refonte.

### 6.9 Visualisation et interface

- Panneau « Projet » : liste des objets (Gerber, Excellon, parcours, G-code), visibilité, couleur, ordre.
- Vue canvas : pan, zoom molette, zoom sur sélection / tout, grille, origine, règle de mesure, coordonnées curseur en mm.
- Panneau « Propriétés » contextuel selon l'objet sélectionné, avec les paramètres de chaque opération.
- Superposition des parcours sur le cuivre, couleurs distinctes pour rapides et coupes.
- **Backplot / simulation** du G-code exporté : lecture pas à pas, barre de progression, estimation de durée.
- Visualisation et édition du G-code en texte avec coloration syntaxique.
- Choix de l'origine machine (coin bas-gauche de la carte, centre, origine Gerber) et option miroir pour la face inférieure.
- Sauvegarde / ouverture de projet (`.json` contenant fichiers sources, paramètres et outils).

### 6.10 Choix des outils assisté

L'utilisateur ne doit jamais choisir un outil « au hasard ». L'application l'aide à chaque étape :

- **Analyse de la carte à l'import** : calcul automatique de l'espacement minimal entre deux éléments de cuivre distincts, de la largeur de piste minimale, du plus petit et du plus grand trou, de l'épaisseur de carte supposée (1,6 mm par défaut, modifiable). Résultat affiché dans une fiche « Analyse de la carte » illustrée (schéma avec cotes sur l'endroit le plus serré, bouton « Zoomer sur la zone »).
- **Recommandation d'outil** pour chaque opération :
  - isolation : outils dont la largeur effective est inférieure à l'espacement minimal, triés du plus robuste au plus fin ; badge vert « Adapté », jaune « Limite » (marge < 10 %), rouge « Trop large » avec le nombre de zones non isolables ;
  - perçage : correspondance trou / foret avec écart affiché en mm et en %, proposition de regrouper des diamètres proches pour limiter les changements d'outil (avec le nombre de changements économisés) ;
  - détourage : fraise recommandée selon l'épaisseur de carte et le nombre de passes résultant.
- **Fiche outil illustrée** : chaque outil de la bibliothèque est présenté comme une carte avec un **profil vu de côté dessiné en SVG à partir de ses paramètres** (angle et pointe du V-bit, diamètre et goujures de la fraise, pointe du foret), ses vitesses, son usage conseillé et ses limites.
- **Comparateur** : sélectionner 2 ou 3 outils et voir côte à côte la largeur de coupe, le temps d'usinage estimé et les zones non isolées, avec un aperçu du résultat sur la carte.
- **Bibliothèque par défaut** (valeurs de départ pour une CNC type 3018 sur FR4, à marquer clairement comme « à valider sur votre machine ») :

| Outil | Type | Paramètres clés | Avance XY / Z | Broche | Usage |
|---|---|---|---|---|---|
| V-bit 20° pointe 0,1 mm | vbit | profondeur 0,05 à 0,1 mm | 120 / 50 mm/min | 10 000 tr/min | isolation fine |
| V-bit 30° pointe 0,2 mm | vbit | profondeur 0,1 mm | 150 / 50 mm/min | 10 000 tr/min | isolation standard |
| Fraise 0,8 mm | endmill | profondeur 0,1 mm | 150 / 50 mm/min | 10 000 tr/min | isolation large, fraisage de trous |
| Fraise maïs 1,5 mm | endmill | 0,4 mm par passe | 150 / 50 mm/min | 12 000 tr/min | détourage |
| Forets carbure 0,6 / 0,8 / 1,0 / 1,2 mm | drill | traversant + 0,2 mm | Z 60 mm/min | 10 000 tr/min | perçage |

### 6.11 Infobulles et aide contextuelle

**Chaque paramètre, bouton et indicateur doit avoir une infobulle renseignée.** Aucune infobulle vide ou générique (« Diamètre de l'outil » pour le champ « Diamètre » n'est pas acceptable).

Structure d'une infobulle (composant unique `HelpTip`) :
1. **Titre** court ;
2. **Explication** en une ou deux phrases, en langage de fablab compréhensible par un débutant ;
3. **Illustration** SVG (obligatoire pour les paramètres géométriques, voir 6.12) ;
4. **Valeur conseillée** ou plage typique ;
5. **Attention** : la conséquence d'une mauvaise valeur, si elle existe ;
6. lien « En savoir plus » qui ouvre le panneau d'aide latéral à la bonne section.

Comportement : apparition au survol après 400 ms et au focus clavier, épinglable d'un clic, accessible (ARIA `role="tooltip"`, navigation clavier, contraste AA), consultable aussi sur écran tactile (appui long). Textes dans les fichiers i18n (FR rédigé ci-dessous, EN à traduire).

Contenu minimal à intégrer (FR) :

| Paramètre | Explication | Conseil / attention |
|---|---|---|
| Diamètre | Largeur de la partie coupante de l'outil. Pour un V-bit, c'est la largeur réelle au niveau de la profondeur de coupe qui compte, pas le diamètre de la tige. | Mesurer au pied à coulisse ou se fier à la fiche du fabricant. |
| Angle de pointe (V-bit) | Angle du cône de l'outil. Plus il est petit, plus le trait reste fin quand on descend. | 20° à 30° pour l'isolation. Un angle large élargit vite la coupe si la carte n'est pas plane. |
| Diamètre de pointe (V-bit) | Largeur du méplat au bout de l'outil. C'est la largeur minimale de coupe. | 0,1 à 0,2 mm. Une pointe cassée rend l'outil plus large qu'annoncé. |
| Profondeur de coupe | Distance sous la surface du cuivre jusqu'où l'outil descend. Le cuivre fait 35 µm : il suffit de le traverser. | 0,05 à 0,1 mm en isolation. Trop profond = trait plus large avec un V-bit. |
| Profondeur par passe | Épaisseur retirée à chaque passage. La profondeur totale est atteinte en plusieurs passes. | 0,3 à 0,5 mm en détourage FR4. Trop élevé = casse de fraise. |
| Nombre de passes (isolation) | Nombre de contours concentriques autour des pistes. Plus de passes = plus d'espace entre pistes et cuivre restant. | 2 ou 3 pour faciliter la soudure. |
| Recouvrement | Part de la largeur de coupe partagée entre deux passes voisines. | 10 à 20 %. À 0 %, un fil de cuivre peut rester entre deux passes. |
| Sens de coupe | En avalant (climb), l'outil tourne dans le sens d'avance : meilleure finition sur machine rigide. En opposition (conventional) : plus tolérant au jeu mécanique. | Opposition conseillée sur CNC hobby à jeu. |
| Avance XY | Vitesse de déplacement de l'outil pendant la coupe. | Trop rapide = casse ou bavures. Trop lent = échauffement. |
| Avance Z (plongée) | Vitesse de descente dans la matière. | Environ un tiers de l'avance XY. |
| Vitesse de broche | Vitesse de rotation de l'outil. | 10 000 à 12 000 tr/min pour le FR4. |
| Hauteur de déplacement (travel Z) | Hauteur à laquelle l'outil se déplace entre deux coupes. | 1 à 2 mm, au-dessus des brides et pinces. |
| Hauteur de sécurité (safe Z) | Hauteur de repli en début, en fin et aux changements d'outil. | 10 à 20 mm, toujours supérieure au travel Z. |
| Débourrage (peck) | Le foret remonte régulièrement pour évacuer les copeaux. | Utile au-delà de 2 mm de profondeur, inutile sur FR4 1,6 mm en général. |
| Attaches (tabs) | Petits ponts de matière laissés sur le contour pour que la carte ne se détache pas pendant l'usinage. | 2 à 4 attaches, 1 à 2 mm de large. Se cassent à la pince et se poncent. |
| Hauteur d'attache | Épaisseur de matière laissée à l'endroit des attaches. | 0,5 mm environ sur une carte de 1,6 mm. |
| Marge de détourage | Distance supplémentaire entre le bord de la carte et la coupe. | 0 si un contour Edge.Cuts existe, 1 à 2 mm sinon. |
| Origine | Point de la carte qui correspond au zéro de la machine. | Coin bas-gauche : le plus simple à régler sur la machine. |
| Miroir | Retourne la géométrie pour usiner la face inférieure. | Obligatoire pour la face arrière d'une carte double face. |
| Post-processeur | Traduit les parcours dans le dialecte G-code de la machine. | GRBL pour la plupart des CNC hobby. |
| Zone non isolée | Endroit où l'outil est trop large pour passer entre deux éléments de cuivre. Un court-circuit est probable. | Choisir un outil plus fin ou réduire la profondeur (V-bit). |

Panneau d'aide latéral : glossaire illustré, guide « Ma première carte » pas à pas (import, analyse, choix des outils, isolation, perçage, détourage, export) avec une carte d'exemple embarquée.

### 6.12 Illustrations graphiques

L'application doit être **la plus illustrée possible**. Règles :

- Toutes les illustrations sont des **SVG originaux** créés dans le projet (pas d'images téléchargées), dans les couleurs de la charte (section 6.13), avec un style de trait cohérent (trait 2 px, angles arrondis).
- **Illustrations paramétriques en direct** : les schémas reflètent les valeurs saisies. Exemples obligatoires :
  - coupe d'un V-bit dans le cuivre : la largeur effective s'affiche et change quand on modifie angle, pointe ou profondeur ;
  - vue de dessus de passes d'isolation avec le recouvrement visible ;
  - animation avalant / opposition (rotation de l'outil + sens d'avance) ;
  - empilement des passes en profondeur (profondeur par passe / profondeur totale) ;
  - détourage avec attaches positionnées et cotées ;
  - cycle de perçage simple et avec débourrage (animation) ;
  - hauteurs Z (surface, travel Z, safe Z, profondeur) sur un même schéma coté ;
  - origine et miroir sur une miniature de la carte réelle.
- **Profil d'outil** généré depuis ses paramètres dans la bibliothèque et dans les sélecteurs.
- **Icônes** pour chaque type d'objet (Gerber, Excellon, parcours, G-code), d'opération et d'outil ; jeu d'icônes cohérent (linéaire, trait 2 px).
- **États vides illustrés** (aucun fichier chargé, aucune opération) avec un appel à l'action et un motif de la charte en fond discret.
- **Animations** légères et désactivables (`prefers-reduced-motion` respecté).
- Les illustrations sont des composants réutilisables (`src/ui/illustrations/`), chacun avec ses tests de rendu (snapshot).

### 6.13 Charte graphique 8 Fablab Drôme

Source : « Identité visuelle 8 Fablab 2023 ». Les fichiers du logo (SVG) et des motifs seront fournis par To dans `assets/brand/` ; ne pas redessiner le logo.

**Typographies** (auto-hébergées pour le hors ligne) :
- **Bebas Neue** : identité, titres de sections, rubriquage, libellés de badges, chiffres clés (toujours en capitales). Inclinaison de -10° autorisée pour les grands titres d'écran d'accueil uniquement, jamais dans l'interface dense.
- **Karla** (famille complète, Google Fonts) : tout le reste, textes d'interface, infobulles, champs, valeurs, aide.
- Police à chasse fixe pour le G-code et les coordonnées (au choix, par exemple JetBrains Mono).

**Couleurs** (design tokens CSS) :

| Token | Nom charte | Hex | Usage dans l'application |
|---|---|---|---|
| `--brand-prune` | Prune | `#4b2a46` | texte principal, barre d'en-tête, fond du thème sombre |
| `--brand-prune-light` | Prune clair | `#e4dfe3` | fonds de panneaux, séparateurs |
| `--brand-rouge` | Rouge | `#eb0a4b` | action principale, sélection, cuivre face avant, erreurs (toujours avec icône) |
| `--brand-rouge-light` | Rouge clair | `#fbdae3` | fond des messages d'erreur, survol |
| `--brand-rose` | Rose | `#faa0cd` | action secondaire, détourage, déplacements rapides |
| `--brand-rose-light` | Rose clair | `#fdebf5` | fonds d'infobulles |
| `--accent-formation` | Formation | `#1ebe96` | succès, outil « Adapté », parcours d'isolation, aide et tutoriels |
| `--accent-formation-light` | Formation clair | `#ddf5ef` | fonds de l'aide |
| `--accent-pro` | Service PRO | `#ffe600` | avertissements, outil « Limite », perçages (texte prune dessus) |
| `--accent-pro-light` | Service PRO clair | `#fff7b2` | fond des avertissements |
| `--accent-cowork` | Co-working | `#7d64d2` | information, cuivre face arrière |
| `--accent-cowork-light` | Co-working clair | `#ebe7f8` | fonds d'information |

Règles :
- Le texte sur fond coloré est en prune ou en blanc selon le contraste ; vérifier le niveau WCAG AA pour chaque combinaison et ne jamais transmettre une information par la couleur seule (icône ou libellé en plus).
- Le canvas de visualisation a un fond sombre dérivé du prune (proposer la valeur) pour faire ressortir les couches ; thème clair et thème sombre pour le reste de l'interface.
- **Motifs** (polygones, ondes, éclats, pois, « 8 ») : uniquement en fond d'écran d'accueil, d'états vides, de l'écran « À propos » ; jamais derrière des données ou du texte dense. Toujours bicolores dans les couleurs de la charte.
- **Stickers / badges** : reprendre l'esprit des stickers de la charte (formes figées, Bebas Neue) pour les badges d'état (« ADAPTÉ », « LIMITE », « TROP LARGE », « GRBL », type d'outil, durée estimée).
- **Mise en page « jeu de moitiés »** : l'écran d'accueil et l'écran d'export s'organisent autour d'un axe qui sépare l'espace en deux parties égales.
- Logo 8 Fablab en haut à gauche de l'application, cartouche « 8FABLAB.FR » dans l'écran « À propos ».

Livrer au jalon concerné une page `styleguide` interne qui montre tous les tokens, typographies, composants, badges et illustrations, pour validation par To.

---

## 7. Sécurité machine

Le G-code pilote une machine réelle. Exigences :
- aucun déplacement rapide sous `safeZ` hors des plongées prévues ;
- remontée à `safeZ` avant tout changement d'outil et en fin de programme ;
- vérification que tous les parcours tiennent dans les limites de course configurées pour la machine ;
- avertissement explicite si une profondeur, une avance ou un diamètre semble aberrant ;
- en-tête du fichier G-code commenté (outil, paramètres, date, version du logiciel).

---

## 8. Exigences non fonctionnelles

| Critère | Cible |
|---|---|
| Parsing d'un Gerber de 5 Mo | < 3 s |
| Isolation 2 passes d'une carte 10 x 10 cm dense | < 5 s |
| Interface | jamais bloquée pendant un calcul |
| Précision | erreur < 1 µm entre géométrie importée et référence |
| Couverture de tests | > 80 % sur `core`, `parsers`, `cam`, `post` |

---

## 9. Stratégie de tests

- Tests unitaires des parsers sur des fichiers réels (KiCad, Eagle, EasyEDA, Altium) et sur des cas limites (macros, polarité claire, step and repeat, arcs).
- **Tests comparatifs avec FlatCAM Plus** : pour quelques cartes de référence, générer le G-code avec FlatCAM Plus et vérifier que nos parcours sont géométriquement équivalents (tolérance définie), pas forcément identiques au caractère près.
- Tests « golden » du G-code produit par chaque post-processeur.
- Tests de sécurité automatiques (section 7) sur tout G-code généré.

---

## 10. Plan de travail et méthode

Travaille **jalon par jalon**. À chaque jalon : explique tes choix techniques, écris les tests, montre le résultat, puis attends ma validation avant de passer au suivant.

| Jalon | Contenu | Critère d'acceptation |
|---|---|---|
| J0 | Analyse de la référence FlatCAM Plus, choix des bibliothèques, squelette du dépôt, CI | Document `docs/architecture.md` validé, `npm test` vert |
| J1 | `core/units`, `core/geometry`, wrapper Clipper | Tests offsets / unions OK |
| J2 | Parser Gerber complet | Fichiers de fixtures parsés, rendu SVG de contrôle conforme |
| J3 | Parser Excellon | Trous et rainures conformes aux fixtures |
| J4 | Rendu canvas + UI minimale (import, calques, pan / zoom) | Carte complète affichée et fluide |
| J4b | Charte graphique : tokens, polices, composants de base, `HelpTip`, page `styleguide` | Validation visuelle par To |
| J5 | Bibliothèque d'outils avec fiches illustrées + analyse de la carte + recommandation d'outil | Profils SVG générés, recommandations correctes sur les fixtures |
| J6 | Isolation | Parcours conformes, zones non isolées signalées |
| J7 | Perçage + optimisation | Ordre optimisé, distance économisée affichée |
| J8 | Détourage + attaches | Contour et attaches conformes |
| J9 | Moteur de post-processeurs + profils GRBL, Marlin, LinuxCNC | Tests golden verts, éditeur de profil fonctionnel |
| J10 | Backplot, export, sauvegarde projet | Flux complet Gerber vers G-code utilisable sur notre CNC |
| J11 | Illustrations paramétriques, panneau d'aide, guide « Ma première carte », i18n EN, finitions | 100 % des paramètres avec infobulle complète, validation par To |

Règles de travail :
- commence par lire la référence et proposer un plan détaillé ; pose tes questions avant de coder si un point est ambigu ;
- commits petits et descriptifs, un par sous-étape logique ;
- ne génère pas de gros fichiers d'un coup : construis progressivement et explique ;
- toute dérogation aux conventions de la section 4 doit être justifiée ;
- à chaque nouveau paramètre ajouté dans l'interface : infobulle complète (6.11) et illustration si géométrique (6.12), sinon le jalon n'est pas terminé.

---

## 11. Hors périmètre V1 (à garder possible dans l'architecture)

Gravure laser, NCC (retrait du cuivre non utilisé), paint, panelisation, double face avec trous d'alignement, contrôle direct de la machine (WebSerial), autolevelling / carte de hauteur, import DXF / SVG, éditeurs Gerber / Excellon, vue 3D, pâte à braser, contrôle DRC.

---

## 12. Première action attendue

1. Explore `../FlatCAM-master` (fichiers listés en section 1) et résume en une page comment FlatCAM Plus réalise l'isolation, le perçage, le détourage et le post-processing.
2. Propose tes choix de bibliothèques (géométrie, rendu, framework UI) avec avantages et inconvénients.
3. Propose l'arborescence finale et le contenu du jalon J0.
4. Attends ma validation.
