# 8-CAM : note pour la mise en ligne

Note destinée à l'assistant qui gère mon serveur, pour m'aider à publier 8-CAM.

## Ce qu'est le projet

8-CAM est une application web de FAO pour circuits imprimés, faite pour 8 Fablab Drôme. Elle lit des fichiers Gerber
et de perçage (Excellon) et calcule les parcours d'outil : isolation des pistes, perçage, détourage. Elle écrit ensuite
le G-code pour la fraiseuse (GRBL, Marlin, LinuxCNC, Snapmaker Artisan).

**Point essentiel pour l'hébergement : c'est un site 100 % statique.**

- Pas de serveur applicatif, pas de base de données, pas de compte, pas de PHP ni de Node en production.
- Tout le calcul se fait dans le navigateur de l'utilisateur, dans des Web Workers. Les fichiers des utilisateurs ne
  sont jamais envoyés au serveur.
- Aucun cookie, aucun traceur, aucun service externe. Les polices sont hébergées avec le site.
- Les réglages de chaque utilisateur (machines, outils) restent dans son navigateur (IndexedDB et localStorage).

## Code source et construction

- Dépôt : https://github.com/Nakio195/8-CAM, branche `main`.
- Technologies : Vite 8, Svelte 5, TypeScript.
- Il faut Node.js LTS (testé avec Node 22.16 et npm 10.9) **pour construire seulement**. Node n'a pas besoin d'être sur
  le serveur si la construction se fait ailleurs.

```bash
npm ci             # installe les dépendances exactes (package-lock.json)
npm run check      # optionnel : lint, types et 325 tests
npm run build      # produit le dossier dist/
```

`dist/` pèse environ 1,3 Mo et contient 33 fichiers :

| Fichier ou dossier      | Rôle                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `index.html`            | l'application                                                                                              |
| `styleguide.html`       | page interne de charte graphique, sans danger, pas utile au public                                         |
| `assets/`               | JavaScript, CSS et Web Workers ; noms avec empreinte (`main-B19f0Imu.js`…), changent à chaque construction |
| `fonts/`, `favicon.png` | polices et icône                                                                                           |
| `examples/ftdi-max/`    | carte d'exemple chargée par le bouton « Carte d'exemple »                                                  |
| `defaults.json`         | réglages par défaut du site (voir plus bas)                                                                |

## Mise en ligne

1. **Servir le contenu de `dist/`** comme site statique, avec n'importe quel serveur web (Apache, nginx, Caddy…).
   - Il n'y a pas de routes côté client : aucune réécriture d'URL vers `index.html` n'est nécessaire.
2. **Dans un sous-dossier** (par exemple `https://exemple.fr/8cam/`), il faut construire avec le chemin :
   `npm run build -- --base=/8cam/`. À la racine d'un domaine ou d'un sous-domaine, rien à faire.
3. **Types MIME** : les fichiers `.js` doivent partir en `text/javascript`. Sinon, les modules et les Web Workers sont
   refusés par le navigateur et la page reste blanche. Il faut aussi `.json` en `application/json`, `.svg` en
   `image/svg+xml` et `.woff2` en `font/woff2`.
4. **HTTPS obligatoire**, avec redirection de HTTP vers HTTPS.
5. **Choisir l'adresse définitive dès le début.** Les réglages des utilisateurs sont rangés par origine (domaine et
   port). Changer de domaine plus tard leur ferait perdre leurs machines et leurs outils enregistrés.

## En-têtes HTTP à ajouter

La page porte déjà sa propre politique de sécurité du contenu, dans une balise `<meta>` ajoutée à la construction.
Voici sa valeur :

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
font-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'
```

Une balise ne peut pas porter les protections suivantes : elles sont à ajouter sur le serveur.

```text
Content-Security-Policy: frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

**Attention :** si le serveur ajoute sa propre politique complète, le navigateur applique les deux en même temps (il
garde seulement ce que les deux permettent). Une politique serveur plus stricte que celle ci-dessus casserait
l'application. Le plus simple est que le serveur n'envoie que `frame-ancestors 'none'`.

Exemple Apache (`.htaccess` à côté de `index.html`) :

```apache
Header always set Content-Security-Policy "frame-ancestors 'none'"
Header always set X-Content-Type-Options "nosniff"
Header always set Referrer-Policy "no-referrer"
```

Exemple nginx :

```nginx
add_header Content-Security-Policy "frame-ancestors 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
```

## Cache conseillé

| Fichiers                             | Cache                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `assets/*` (noms avec empreinte)     | long : `Cache-Control: public, max-age=31536000, immutable`                     |
| `index.html`, `styleguide.html`      | `Cache-Control: no-cache`, pour que les mises à jour arrivent tout de suite     |
| `defaults.json`                      | `Cache-Control: no-cache` (l'application le redemande déjà à chaque chargement) |
| `fonts/`, `examples/`, `favicon.png` | moyen, par exemple une semaine                                                  |

## Le fichier `defaults.json` : à gérer avec soin

- `defaults.json` fixe pour **tous les utilisateurs** les réglages des nouvelles opérations (passes, sens d'usinage,
  attaches…) et la machine proposée à une première visite (actuellement la Snapmaker Artisan).
- Je peux le modifier **directement sur le serveur**, sans reconstruire : le changement s'applique au prochain
  chargement de la page.
- **Piège au redéploiement :** copier un nouveau `dist/` écrase `defaults.json` avec la version du dépôt
  (`public/defaults.json`). Il faut donc choisir l'une des deux façons de faire :
  - le modifier seulement dans le dépôt (`public/defaults.json`), puis reconstruire et redéployer ;
  - ou l'exclure de la copie au déploiement, par exemple `rsync --exclude defaults.json`, et le modifier seulement sur
    le serveur.
- Un réglage invalide dans ce fichier ne casse rien : il est ignoré et la console du navigateur dit lequel.
- L'accès en écriture au serveur doit rester protégé, puisque ce fichier règle l'application de tout le monde.

## Mettre à jour le site

```bash
git pull
npm ci
npm run build
rsync -av --delete --exclude defaults.json dist/ utilisateur@serveur:/chemin/du/site/
```

`--exclude defaults.json` est à garder ou à retirer selon le choix fait plus haut. `--delete` retire les anciens
fichiers de `assets/` : sans risque, car `index.html` est envoyé en même temps.

## Vérifications après la mise en ligne

- Ouvrir le site, cliquer sur « Carte d'exemple » :
  - la carte s'affiche ;
  - dans l'onglet Usinage, une isolation se calcule ;
  - dans l'onglet Machine, « Écrire le G-code » produit un fichier.
- Console du navigateur (F12) : aucune erreur, en particulier aucune violation de « Content-Security-Policy » ni
  d'erreur de type MIME.
- Vérifier les en-têtes : `curl -I https://adresse-du-site/` doit montrer `frame-ancestors`, `nosniff`,
  `Referrer-Policy` et les bons `Cache-Control`.
- `https://adresse-du-site/defaults.json` doit répondre en `application/json`.

## Questions à trancher avec moi

- Adresse : sous-domaine dédié (par exemple `8cam.8fablab.fr`) ou sous-dossier d'un site existant ?
- Construction : sur ma machine puis envoi de `dist/`, sur le serveur (Node nécessaire), ou par une action GitHub qui
  déploie à chaque envoi sur `main` ?
- `defaults.json` : modifié dans le dépôt, ou seulement sur le serveur ?
- Publier ou non `styleguide.html` (page interne, il suffit de ne pas la copier).
