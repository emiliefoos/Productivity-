# Broll Sort — trie tes photos et vidéos, retrouve tes broll en un instant

Une petite application web (PWA) installable sur ton téléphone pour **importer, taguer et
rechercher** tes photos et vidéos, avec un focus sur le tri rapide de tes **broll** de tournage.

Tout fonctionne **100 % en local, dans le navigateur de ton téléphone** : aucune photo, vidéo
ou donnée n'est envoyée sur un serveur. Les fichiers sont stockés dans le stockage du
navigateur (IndexedDB), donc c'est privé — mais ça veut aussi dire que si tu vides le cache du
navigateur ou changes de téléphone, il faudra réimporter tes médias.

## Fonctionnalités

- **Import** depuis la galerie de ton téléphone (sélection multiple, photos et vidéos), ou
  **import d'un dossier entier en un tap** (ex. le dossier Camera/DCIM sur Android) pour ne
  pas avoir à sélectionner chaque fichier un par un.
- **Tags manuels illimités** + une série de **catégories broll prédéfinies** en un tap
  (Nature, Ville, Mains, Détail, Transition, Ciel/Météo, Mouvement, Calme, etc.).
- **Suggestions de tags automatiques par IA**, optionnelles, exécutées entièrement sur
  l'appareil (TensorFlow.js + MobileNet) — reconnaît le contenu visuel (objets, lieux,
  ambiances) pour t'aider à retrouver des médias que tu n'as jamais tagués toi-même.
- **Recherche** par nom de fichier ou par tag, **filtres rapides** (Photos / Vidéos /
  Favoris / Broll) et **filtre par tag** en tapant sur les tags les plus utilisés.
- **Favoris** et **marqueur Broll** dédié pour retrouver instantanément tes clips de
  tournage pendant que tu filmes.
- **Installable** sur l'écran d'accueil (PWA), fonctionne hors-ligne une fois ouverte une
  première fois.
- Aperçu du **stockage utilisé** et option pour demander au navigateur de ne pas nettoyer
  automatiquement les données de l'app.

## Comment l'utiliser sur ton téléphone

Un navigateur ne peut pas exécuter une PWA installable directement depuis un fichier local
(`file://`) — il faut la servir via `http(s)://`, même en local. Le plus simple :

### Option A — GitHub Pages (recommandé, gratuit)

1. Dans les réglages du dépôt GitHub → **Pages**, active GitHub Pages sur la branche
   principale (dossier racine `/`).
2. Une fois publié, ouvre l'URL fournie (`https://<utilisateur>.github.io/<repo>/`)
   **depuis le navigateur de ton téléphone**.
3. Menu du navigateur → **« Ajouter à l'écran d'accueil »** (Safari sur iPhone) ou
   **« Installer l'application »** (Chrome sur Android).

### Option B — tester en local sur ton ordinateur

```bash
# Depuis la racine du projet
python3 -m http.server 8080
# puis ouvre http://localhost:8080 dans le navigateur
```

Pour tester sur ton téléphone depuis ton réseau local, remplace `localhost` par l'adresse IP
locale de ton ordinateur (ex : `http://192.168.1.23:8080`) — le téléphone et l'ordinateur
doivent être sur le même Wi-Fi. Note : la plupart des navigateurs mobiles exigent HTTPS pour
installer une PWA en tant qu'app ; en HTTP local tu pourras quand même l'utiliser dans un
onglet normal.

## Limites à connaître

- Un navigateur ne peut pas scanner automatiquement toute la pellicule de ton téléphone sans
  action de ta part (sécurité du système) : à chaque import, tu choisis les photos/vidéos via
  le sélecteur natif de ta galerie (comme quand tu envoies une photo dans une appli de
  messagerie), ou tu importes un dossier entier en un tap (voir bouton **＋**). Sur iPhone,
  l'import de dossier n'est pas proposé par le système — utilise la sélection multiple et
  fais glisser ton doigt sur les vignettes pour en cocher beaucoup d'un coup. Une fois
  importés, les médias restent disponibles dans l'app même hors-ligne.
- Les fichiers importés sont **copiés** dans le stockage du navigateur : pour de grosses
  vidéothèques, surveille l'espace utilisé dans **Réglages** (⚙️).
- Les suggestions IA utilisent un modèle générique (reconnaissance d'objets/lieux) : elles
  aident à la recherche mais ne remplacent pas un tag « broll » précis — d'où les
  catégories broll manuelles en un tap.

## Structure du projet

```
index.html              Interface principale
manifest.webmanifest     Métadonnées PWA (icône, nom, couleurs)
service-worker.js        Cache hors-ligne de l'app (pas des médias)
css/style.css             Styles (clair/sombre automatique)
js/db.js                  Stockage local (IndexedDB) : médias, tags, réglages
js/media.js                Miniatures, métadonnées, couleur dominante
js/classifier.js           Suggestions de tags par IA (TensorFlow.js + MobileNet)
js/app.js                  Logique de l'interface (galerie, recherche, édition)
icons/                     Icônes de l'app
```
