# pcbCAM

Logiciel de FAO pour circuits imprimés, dans le navigateur. Il part des fichiers de fabrication d'une carte (Gerber
et perçage), calcule les parcours d'outil de la fraiseuse et écrit le G-code. Il est né au
[8 Fablab Drôme](https://8fablab.fr) pour graver des cartes sur les machines de l'atelier.

Tout se passe dans le navigateur : rien à installer, pas de compte, et **aucun fichier n'est envoyé sur internet**.

Il reprend le fonctionnement de [FlatCAM](http://flatcam.org/) (version FlatCAM Plus), avec ses algorithmes réécrits
en TypeScript. Le but est d'avoir une interface plus simple, guidée pas à pas, pour une première carte.

Il est disponible en ligne à cette adresse : https://pcbcam.8fablab.fr

## Ce que fait pcbCAM

**Lecture des fichiers**

- Gerber RS-274X et X2 : cuivre, contour, et perçage au format Gerber (Proteus).
- Excellon, en mm ou en pouces, avec les zéros et le format devinés si le fichier ne les donne pas.
- Archive zip de fabrication entière : les fichiers Gerber et de perçage sont trouvés dedans, le reste est mis de
  côté et listé.
- Glisser-déposer de plusieurs fichiers à la fois. Une carte d'exemple est fournie pour essayer.

**Analyse de la carte**

- Espacement le plus serré entre deux cuivres, piste la plus fine, tailles de trous.
- Outils de la bibliothèque qui conviennent à la carte, et ceux qui ne passent pas.

**Usinage, une étape à la fois**

- **Isolation des pistes** : plusieurs passes avec recouvrement, sens d'usinage en avalant ou en opposition.
  - Les zones que l'outil ne peut pas isoler sont repérées sur la carte : risque de court-circuit.
  - Un comparateur montre ce que donnerait chaque outil.
- **Perçage** : un outil par taille de trou, ordre des trous optimisé pour raccourcir les déplacements.
  - Débourrage possible.
  - Un trou trop gros pour les forets est fraisé, et les rainures sont usinées.
- **Détourage** : contour de la carte, ou rectangle autour du cuivre.
  - Les attaches sont placées automatiquement ; on peut les déplacer d'un clic sur la carte.
- Durée estimée de chaque opération.

**G-code**

- Post-processeurs fournis : GRBL 1.1, Marlin, LinuxCNC et Snapmaker Artisan (module CNC 200 W).
  - Ils sont modifiables, copiables et échangeables en fichier JSON, avec un aperçu en direct.
- Profils de machine réglables : courses, vitesses, hauteur de sécurité, mode de changement d'outil.
- Origine au choix : coin bas-gauche, centre ou origine du fichier Gerber.
- Miroir pour usiner la face dessous.
- Changement d'outil par pause dans un seul fichier, ou un fichier par outil quand la machine ne permet pas de refaire
  le zéro pendant une pause (Snapmaker Artisan).
- Vérifications avant le téléchargement :
  - le travail tient dans les courses de la machine ;
  - aucun rapide dans la matière ;
  - aucune commande interdite par le profil.
- **Simulation** du G-code relu tel que la machine le lira, rejouée sur la carte.
  - Le texte du G-code reste modifiable à la main ; les vérifications sont refaites sur le texte modifié.

**Confort**

- Projet enregistrable (`.pcbcam.json`) avec les fichiers sources, les outils, la machine et les réglages, pour tout
  retrouver sur un autre ordinateur.
- Aide sur chaque réglage : explication, valeur conseillée et illustration qui suit les valeurs saisies.
- Guide « Ma première carte » et glossaire illustré.
- Interface en français et en anglais, thème clair ou sombre.

## Limites

- **Le G-code n'a pas encore été validé sur toutes les machines.** Il est testé automatiquement, mais seul un essai
  réel prouve qu'il convient à une machine donnée. Avant une vraie carte :
  - faire un premier passage « en l'air », au-dessus de la plaque ;
  - avoir une planche martyre sous la carte ;
  - garder la main près de l'arrêt d'urgence.
- Les valeurs des outils fournis (vitesses, profondeurs) sont **des points de départ**, à ajuster sur chaque machine
  et pour chaque outil.
- Pas encore pris en charge :
  - découpes intérieures dans le contour d'une carte (trous de forme) ;
  - retrait du cuivre des grandes surfaces (NCC) ;
  - double face avec trous d'alignement ;
  - panelisation ;
  - carte de hauteur (autonivellement) ;
  - gravure laser ;
  - import DXF ou SVG ;
  - vue 3D ;
  - contrôle des règles de dessin (DRC) ;
  - pilotage direct de la machine depuis le navigateur.
- Une carte très dense avec un grand plan de masse peut demander quelques secondes de calcul pour l'isolation.
  L'interface reste utilisable pendant ce temps.
- Il faut un navigateur récent : Chrome, Edge, Firefox ou Safari de moins de deux ou trois ans.
- Les réglages de chaque utilisateur (machines, outils, post-processeurs) restent dans son navigateur. Pour les
  retrouver ailleurs, il faut les exporter, ou enregistrer le projet.

## Utilisation

1. **Importer** les fichiers de la carte : cuivre, contour et perçage, ou directement le zip de fabrication.
   - Pour un premier essai, cliquer sur « Carte d'exemple ».
2. **Analyse** : regarder l'espacement le plus serré et les outils qui y passent.
3. **Outils** : comparer la bibliothèque à ses vrais outils, en particulier la pointe et l'angle des V-bits et le
   diamètre des forets.
4. **Usinage**, dans l'ordre des étapes :
   - isolation ;
   - perçage ;
   - détourage, avec les attaches.
5. **Machine** :
   - choisir sa machine et son post-processeur ;
   - écrire le G-code et vérifier les messages ;
   - regarder la simulation ;
   - télécharger le ou les fichiers.
6. **Sur la machine** :
   - fixer la plaque bien à plat sur une planche martyre ;
   - faire le zéro X / Y à l'origine choisie et le zéro Z sur le cuivre ;
   - lancer le fichier.
7. **Enregistrer le projet** pour le retrouver plus tard.

Chaque bouton et chaque réglage a sa bulle d'aide : survol, ou bouton « ? » à côté des champs numériques. Le panneau
d'aide (icône livre) contient le guide pas à pas.

## Un logiciel « vibecodé », ouvert à tous

pcbCAM a été **vibecodé** : il est écrit presque entièrement par une intelligence artificielle (Claude, avec
Claude Code). Le travail humain a porté sur le besoin, l'orientation, les choix et les essais au fablab.

- Le code a été construit par étapes, avec plus de 300 tests automatiques :
  - comparaison des résultats d'isolation avec ceux de FlatCAM ;
  - fichiers G-code de référence ;
  - vérifications de sécurité.
- Il n'a pas été relu ligne à ligne comme un logiciel écrit à la main : la prudence d'usage sur la machine
  s'applique d'autant plus.

**Le projet est ouvert à toutes les modifications et à tous les clonages.**

- Forkez-le, adaptez-le à votre machine ou à votre atelier.
- Proposez des corrections et des améliorations : signalements et pull requests sont les bienvenus sur
  [GitHub](https://github.com/Nakio195/8-CAM).
- Reprenez-en des morceaux dans vos propres projets, dans le respect de la licence ci-dessous.

La documentation technique explique comment tout est construit et pourquoi :

- [`docs/architecture.md`](docs/architecture.md) : les choix, les algorithmes, leurs limites et ce qui reste ouvert ;
- [`specs/PROMPT_PCB_CAM_WEB.md`](specs/PROMPT_PCB_CAM_WEB.md) : le cahier des charges d'origine.

## Développement

Il faut [Node.js](https://nodejs.org) en version LTS.

```bash
npm install
npm run dev        # serveur de développement
npm run check      # lint, types et tests
npm run build      # site statique dans dist/
npm run bench      # mesures de performance sur des cartes denses
```

## Mise en ligne

`npm run build` produit un site **entièrement statique** dans `dist/`, à copier sur n'importe quel serveur web. Il
n'y a ni serveur applicatif ni base de données. Le détail se trouve dans
[`docs/mise-en-ligne.md`](docs/mise-en-ligne.md) : HTTPS, en-têtes de sécurité, cache.

Le fichier [`public/defaults.json`](public/defaults.json) fixe pour tous les utilisateurs du site :

- les réglages par défaut des opérations ;
- la machine proposée à une première visite ;
- les outils de base.

Il se modifie sur le serveur, sans reconstruire. Vérifier sa syntaxe avant de le mettre en ligne :

```bash
npm run check:defaults
```

## Licence

pcbCAM est un logiciel libre, sous licence
[Creative Commons Attribution - Partage dans les mêmes conditions 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.fr)
(CC BY-SA 4.0). Voir [`LICENSE`](LICENSE).

Ne sont pas couverts par cette licence :

- les éléments de marque du 8 Fablab Drôme (`assets/brand/`) ;
- les polices, sous licence SIL OFL ;
- les dépendances, chacune sous sa propre licence.
