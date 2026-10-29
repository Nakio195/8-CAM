# Étude : refaire le zéro Z pendant une pause CNC sur la Snapmaker Artisan

Étude de faisabilité, sans changement du code de pcbCAM. Sources lues le 28/10/2026 sur GitHub (branche `main`) :
`Snapmaker/Artisan-Controller` (firmware du contrôleur, Marlin 2.1) et `Snapmaker/Snapmaker-Artisan-Screen-App`
(application Android de l'écran). Les numéros de ligne renvoient à ces versions.

**Question.** Pendant une tâche CNC en pause (`M600`), peut-on déplacer Z à pas fins (0,01 / 0,05 mm, le plus fin
est 0,1 mm aujourd'hui), refaire le zéro Z avec le nouvel outil, puis reprendre la tâche avec ce zéro ?

## En bref

| Partie                                   | Constat                                                                                                          | Difficulté                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Contrôleur : mouvement et `G92` en pause | **pas refusés** ; le nouveau zéro reste après la reprise                                                         | rien à changer pour cela                           |
| Contrôleur : reprise                     | revient au Z **machine** enregistré : un outil plus long descend plus bas, de la différence de longueur          | petit correctif (~20 lignes) + compilation, essais |
| Écran : jog et « zéro Z » en pause       | code simple à écrire (composants existants)                                                                      | 1 à 2 jours de code                                |
| Écran : installation                     | **bloquante** : l'app tourne avec l'identité système et la clé de Snapmaker, une APK modifiée est refusée        | pas faisable sans les clés de Snapmaker            |
| Contrôleur : installation                | le paquet de mise à jour n'a qu'une somme de contrôle, pas de signature : un firmware modifié semble installable | possible, risque de machine bloquée                |

Conclusion : **modifier l'écran n'est pas réaliste** ; modifier le seul contrôleur est possible mais n'apporte pas
l'interface (pas de jog sur l'écran en pause). La voie raisonnable reste celle de pcbCAM aujourd'hui (un fichier par
outil), ou un pilotage depuis un ordinateur (section 4).

## 1. Le contrôleur (firmware)

### 1.1 Le contrôleur ne refuse pas le jog ni l'origine pendant la pause

- Les commandes de l'écran passent par le protocole SACP. Déplacement absolu, réglage d'origine et choix du repère sont
  déclarés avec l'attribut `SACP_CB_ATTR_BLOCKED_WITH_MOTION` (`snapmaker/src/service/motion_platform.cpp`, l. 660-667).
  Cet attribut ne rejette une commande que si le fil de mouvement est **occupé** ; le test « machine en pause » est
  en commentaire, marqué `TODO: re-check condition!!!` (`snapmaker/src/host/sacp_hmi.cpp`, l. 951-971).
- Déplacement : `hmi_cb_move_absoluty` (`motion_platform.cpp`, l. 199-305) ne vérifie que les exceptions
  (`system_svc.allow_moving()`, l. 212 ; `system.cpp`, l. 645-653), pas l'état de la tâche. Les positions arrivent en
  **micromètres** (`value / 1000.0`) : un pas de 0,01 mm passe déjà, la limite de 0,1 mm vient de l'écran.
- Origine : `hmi_cb_set_origin` (`motion_platform.cpp`, l. 168-197) envoie `G92 Z…` puis **enregistre** l'origine en
  mémoire (`save_settings()`, l. 194). `G92` déplace le décalage de repère (`position_shift`,
  `Marlin/src/gcode/geometry/G92.cpp`), que la reprise ne remet pas à zéro.
- Pendant la pause, la boucle du fil de mouvement continue de traiter ces demandes (`motion_background`,
  `motion_platform.cpp`, l. 609-620 ; `dispatch_motion_request`, l. 1629).
- `M600` lu dans un fichier : Snapmaker l'a réécrit, il attend la fin des mouvements et demande la pause
  (`Marlin/src/gcode/feature/pause/M600.cpp`, l. 184-196). Envoyé par la liaison série ou SACP, c'est une pause du
  même type (`PUASE_WITH_SERIAL_OR_SACP_M600`).

Donc côté contrôleur, un jog et un `G92 Z0` pendant la pause sont acceptés et le nouveau zéro sert aux lignes
suivantes du fichier. C'est **l'écran** qui ne les propose pas (section 2).

### 1.2 Le vrai problème : la reprise revient au Z machine enregistré

- À la pause, `save_env` (`snapmaker/src/service/job_ctrl.cpp`, l. 348-433) enregistre la position **machine**
  (`_env.current_pos = sm_current_position`, l. 415). La structure `JobEnv` (`job_ctrl.h`, l. 149-174) ne garde pas le
  décalage de repère, seulement le numéro du repère actif.
- `machine_standby` monte Z au maximum pour une tâche CNC (`job_ctrl.cpp`, l. 670-692).
- À la reprise, `resume_env` (`job_ctrl.cpp`, l. 467-621) va en X/Y puis **redescend au Z machine enregistré**
  (`dest.z = _env.current_pos.z`, l. 564-565), puis le fichier continue.

Avec pcbCAM, le `M600` suit une montée à la hauteur de sécurité (Zs). Si le nouvel outil dépasse de Δ de plus que
l'ancien, la reprise met sa pointe à **Zs − Δ** au-dessus de la carte, puis le G-code suivant (en coordonnées de
travail, avec le nouveau zéro) est juste. Conséquence :

- Δ < Zs : pas de collision, ça marche déjà sans changer le firmware ;
- Δ ≥ Zs : la fraise **plonge dans la carte** à la vitesse de reprise, broche lancée.

**Correctif proposé** (contrôleur) : enregistrer `position_shift.z` dans `JobEnv` à la pause et, à la reprise d'une
tâche CNC, corriger la cible : `dest.z = _env.current_pos.z + (position_shift.z − shift_enregistré)`, c'est-à-dire
revenir au même Z **de travail** et non au même Z machine. Par prudence : descendre d'abord au-dessus de la cible,
puis finir lentement. Environ 20 lignes dans `job_ctrl.h` / `job_ctrl.cpp`. Une autre solution, plus simple, est de
ne pas redescendre du tout en CNC et de laisser le G-code redescendre lui-même (pcbCAM écrit déjà un rapide à la
hauteur de sécurité après chaque changement d'outil).

### 1.3 Reprise après coupure de courant

L'environnement de tâche (`JobEnv`) est aussi celui de la reprise après coupure ; il garde la position machine, pas le
décalage. Un `G92` venu de l'écran est enregistré (`save_settings`), un `G92` lu dans le G-code ne l'est pas. Le
correctif ci-dessus doit donc aussi enregistrer le décalage dans `JobEnv`, sinon une coupure après un changement
d'outil reprendrait avec le Z de l'ancien outil. À tester explicitement.

## 2. L'écran (application Android)

### 2.1 Ce qu'il faudrait changer

- **Écran de pause** : `features/print/src/main/java/fabscreen/features/print/a400platform/PrintA400AdjustmentContainerFragment.java`,
  `getLeftSections()` l. 62-94. En CNC (l. 79-83), seules la vitesse de travail, l'enceinte et le purificateur sont
  ajoutés. Il faudrait une section « Jog / zéro Z » pour `CNC`, qui réutilise `A400PrepareJogControlFragment` (panneau
  de jog et boutons d'origine de la préparation, l. 74-170), ou une version réduite à Z.
- **Bouton « zéro Z »** : existe déjà en préparation, `PrepareJogControlViewModel.setOrigin()` (l. 106-117) →
  `MachineController.setWorkOrigin()` (`platform/base/.../machine/controller/MachineController.java`, l. 347).
  Attention : le constructeur du modèle de vue change de repère (`updateCoordinateSystem`, l. 53-54, soit `G54`) ;
  à éviter pendant une pause.
- **Pas de 0,01 et 0,05 mm** : les pas sont écrits en dur à trois endroits :
  - `PrepareJogControlViewModel.java` l. 28 : `{0.1f, 1f, 10f, 100f}` ;
  - `platform/core/src/main/java/fabscreen/platform/core/ui/view/A400XYZBControlPanel.java` l. 41 (même tableau) et
    `setLinTabValue()` l. 121-129 (libellés) ;
  - la disposition `widget_calibration_control_xyzb` a **4 onglets** : il faut en ajouter (ou remplacer 100 mm), avec
    leurs libellés (`R.string.all_0_1mm`…) dans chaque langue.
  - Le déplacement est calculé en absolu depuis la position courante (`MoveController.stepToPosition`,
    `platform/core/.../ui/data/MoveController.java` l. 33-81) ; le contrôleur accepte le micromètre (1.1).
- Écrire ce code est simple (1 à 2 jours avec les essais à l'écran, l'interface s'appuyant sur des composants
  existants). Construire l'APK demande Android Studio, le NDK 22 et de retirer Firebase (`README.md` du dépôt).

### 2.2 Ce qui bloque : l'installation

- L'application déclare `android:sharedUserId="android.uid.system"` (`apps/a400/src/main/AndroidManifest.xml`, l. 5) :
  elle tourne avec l'identité système d'Android. Android n'installe une telle APK que si elle est signée avec la **clé
  de plateforme** du système de l'écran, et une mise à jour de `com.snapmaker.fabscreena400` doit porter **la même
  signature** que l'app installée. Le dépôt ne fournit pas ces clés (`apps/a400/build.gradle`, l. 9-19 : magasin de
  clés `ScreenA400.keystore` à fournir soi-même).
- Une APK signée avec notre propre clé serait donc refusée, par l'outil de mise à jour comme par `adb install`.
  Retirer `sharedUserId` pour l'installer à côté ferait perdre les droits système (port série vers le contrôleur,
  installation, propriétaire de l'appareil) : l'app ne fonctionnerait pas.
- `adb` sur l'écran : rien de confirmé pour l'Artisan. Sur le forum, des utilisateurs de la 2.0 ont activé le débogage
  USB sans obtenir de droits root ni installer d'APK sur l'écran.

**Verdict : modifier l'écran n'est pas faisable sans les clés de Snapmaker** (ou un accès root à l'écran, non
documenté et risqué).

## 3. Installation du firmware du contrôleur, retour arrière, garantie

- **Format** : un fichier `Artisan_V<version>_<date>.bin` (ex. `Artisan_V2.8.0_20260210.bin`) qui peut contenir le
  firmware du contrôleur, ceux des modules et l'APK de l'écran (`snapmaker/scripts/pack_for_hmi.py`, types 0, 1 et 3,
  l. 20-23 et 86-165). Installation : clé USB dans le contrôleur, _Settings > Firmware Update > Local Update > USB_.
- **Pas de signature** : le script ne calcule qu'une somme des octets (`pack_minor_image`) ; le contrôleur vérifie
  l'en-tête et cette somme (`snapmaker/src/service/upgrade/upgrade_host_to_controller.cpp`, l. 133-178 et 227-236) ;
  l'app de l'écran lit l'en-tête sans vérification cryptographique
  (`platform/base/.../lib/update/UpdateFileParser.java`). Un paquet ne contenant **que** le contrôleur, compilé
  depuis les sources (PlatformIO, `platformio.ini`, un `docker-compose.yml` est fourni), semble donc installable par
  l'écran officiel. Non essayé : un contrôle de version dans l'écran pourrait refuser un numéro donné.
- **Retour arrière** : réinstaller le `.bin` officiel par le même chemin (les versions de V2.0.8 à V2.8.0 sont en
  téléchargement sur le forum Snapmaker). La V2.7.3 corrige un défaut qui empêchait de revenir à un firmware de module
  plus ancien : le retour arrière n'est pas garanti dans tous les cas.
- **Risque de machine bloquée** : si le firmware modifié plante au démarrage, l'écran ne peut plus parler au
  contrôleur pour le remplacer. Le chargeur de démarrage n'est pas dans le dépôt ; la réparation passerait par une
  programmation directe de la carte (sonde SWD, image d'usine, cf. `pack_for_programming.py`) : compétence et matériel
  nécessaires.
- **Garantie** : pas de clause trouvée sur un firmware modifié. Prudence : considérer qu'un dommage causé par un
  firmware non officiel n'est pas couvert, et demander à Snapmaker ou au revendeur avant. Le firmware est sous GPL v3,
  sa modification est permise, mais chaque mise à jour officielle écrasera la version modifiée.

## 4. Effort, risques, alternatives

### 4.1 Estimation

| Travail                                            | Effort                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Correctif de reprise dans le contrôleur (1.2, 1.3) | 0,5 jour de code ; 2 à 4 jours avec la compilation, le paquet et les essais sur la machine |
| Jog et zéro Z sur l'écran de pause, pas fins (2.1) | 1 à 2 jours de code, **non installable** (2.2)                                             |
| Suivre les mises à jour officielles                | refaire le correctif à chaque version                                                      |

### 4.2 Risques

- **Collision** : une erreur dans la reprise fait plonger la fraise dans la carte et la planche martyre, broche lancée.
  Essais à faire sans outil, puis en l'air (zéro pris au-dessus de la carte).
- **Reprise après coupure** avec le mauvais zéro (1.3).
- **Machine bloquée** par un firmware qui ne démarre pas (3).
- Jog à 0,01 mm : la résolution mécanique réelle de Z (pas des moteurs, jeu) est à vérifier ; un pas plus fin que le
  jeu n'apporte rien.

### 4.3 Alternatives sans modifier le firmware

1. **Un fichier par outil** (ce que fait pcbCAM, `docs/architecture.md` section 19.5) : zéro Z refait avec les écrans
   officiels entre deux fichiers. Aucun risque nouveau ; seule limite, le pas de 0,1 mm. Méthode du papier : descendre
   à 0,1 mm jusqu'au contact puis retirer l'épaisseur de la feuille (~0,1 mm) dans le zéro ; ou une cale d'épaisseur
   connue.
2. **Pause dans un seul fichier, outils de longueur proche** : d'après 1.2, la reprise ne heurte pas la carte tant que
   le nouvel outil dépasse de moins que la hauteur de sécurité. Mais l'écran ne permet pas de refaire le zéro pendant la
   pause : le zéro Z du premier outil reste. Aucun gain.
3. **Piloter depuis un ordinateur par la liaison USB série** (câble mini-USB du contrôleur, pilote CH340) : le
   logiciel hôte envoie le G-code ligne à ligne. Pour un changement d'outil, l'hôte **arrête d'envoyer** (pause côté
   hôte, sans `M600`, qui déclencherait la pause du firmware et sa reprise au Z machine), puis on envoie soi-même
   `G91`, `G0 Z-0.01`, …, `G92 Z0`, `G90`, et on reprend l'envoi. Le firmware n'intervient pas dans la reprise : le
   nouveau zéro est pris en compte. Logiciels possibles : Luban (connexion série, panneau de contrôle et pause), ou un
   hôte Marlin (Pronterface, OctoPrint, avec des pas de jog réglables ou des commandes tapées). À vérifier sur la
   machine : un débranchement du câble arrête la tâche sans reprise possible ; un utilisateur signale que la console de
   Luban 4.15.2 répond « ok » sans agir, alors que Pronterface fonctionnait. pcbCAM pourrait alors écrire un repère de
   pause propre à l'hôte au lieu de `M600`.
4. **Luban en Wi-Fi pendant une pause de l'écran** : le contrôleur accepte déplacement et origine en pause (1.1). Si
   le panneau de contrôle de Luban reste utilisable pendant une tâche en pause, le zéro Z pourrait être refait ainsi,
   avec la limite de la reprise vue en 1.2 (Δ < hauteur de sécurité). Non vérifié : à essayer sans outil.
5. **Palpeur** (plaque de contact) : `G38` n'est pas compilé et la broche CNC n'a pas d'entrée de palpage connue ;
   demanderait firmware **et** matériel. Écarté.

**Recommandation** : garder l'export « un fichier par outil ». Si le pas de 0,1 mm gêne, essayer d'abord
l'alternative 3 (pilotage série) sur une chute, sans toucher au firmware. Le correctif du contrôleur n'a d'intérêt
qu'avec une interface de jog en pause, que seul un hôte (Luban, Pronterface) peut fournir.

## Sources

Dépôts (lus le 28/10/2026, branche `main`) :

- <https://github.com/Snapmaker/Artisan-Controller> :
  `snapmaker/src/service/job_ctrl.cpp`, `job_ctrl.h`, `motion_platform.cpp`, `system.cpp`,
  `snapmaker/src/host/sacp_hmi.cpp`, `snapmaker/src/service/upgrade/upgrade_host_to_controller.cpp`,
  `Marlin/src/gcode/feature/pause/M600.cpp`, `Marlin/src/gcode/geometry/G92.cpp`, `Marlin/src/gcode/gcode.cpp`,
  `snapmaker/scripts/pack_for_hmi.py`.
- <https://github.com/Snapmaker/Snapmaker-Artisan-Screen-App> : `README.md`, `apps/a400/AndroidManifest.xml`,
  `apps/a400/build.gradle`, `features/print/.../a400platform/PrintA400AdjustmentContainerFragment.java`,
  `A400PrepareJogControlFragment.java`, `WorkPrepareWithJogFragment.java`,
  `viewmodel/PrepareJogControlViewModel.java`, `viewmodel/WorkOriginControlViewModel.java`,
  `platform/core/.../ui/view/A400XYZBControlPanel.java`, `platform/core/.../ui/data/MoveController.java`,
  `platform/base/.../machine/controller/MachineController.java`, `platform/base/.../lib/update/`.

Pages consultées :

- Versions du firmware de l'Artisan et installation par clé USB :
  <https://forum.snapmaker.com/t/snapmaker-artisan-firmware-updates-and-downloads/29975>
- Mise à jour du firmware (wiki) : <https://wiki.snapmaker.com/en/snapmaker_artisan/manual/update_firmware>
- Ouverture de l'Android de l'écran, adb (2.0) :
  <https://forum.snapmaker.com/t/can-android-on-touchscreen-be-more-open/22387?page=2>
- Connexion série avec Luban : <https://wiki.snapmaker.com/en/Snapmaker_Luban/manual/connect_with_machine_via_serial_port>
- Envoi de G-code de Luban à l'Artisan : <https://forum.snapmaker.com/t/sending-gcode-from-snapmaker-luban-to-artisan/40362>
