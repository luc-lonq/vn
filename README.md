# tiếng việt

App perso pour apprendre le vietnamien : notes markdown, vocabulaire en répétition espacée (type Anki) et historique des modifications sous forme de diffs.

## Démarrer

```bash
cp .env.example .env      # puis change APP_PASSWORD
docker compose up --build
```

→ http://localhost:5173

Le code est monté en volume : le front (Vite) et l'API (`node --watch`) se rechargent tout seuls. Si tu ajoutes une dépendance npm : `docker compose up --build` (et pour le front, `docker compose down -v` avant si besoin de reconstruire le volume `node_modules` — attention, `-v` supprime aussi la base).

## Stack

| | |
|---|---|
| front | React 19, Tailwind 4, Vite, react-markdown (+GFM) |
| back | Express 4 |
| base | SQLite (better-sqlite3), fichier unique dans le volume `db-data` |
| auth | un mot de passe (`APP_PASSWORD`), cookie httpOnly signé HMAC, 30 jours |

SQLite parce que c'est mono-utilisateur : zéro service à gérer, un seul fichier à sauvegarder, et largement assez rapide.

## Fonctionnalités

**Vocabulaire**
- Révision : `espace` affiche la réponse, `1` `2` `3` `4` notent (à revoir / difficile / bien / facile), `v` prononce le mot (voix vi-VN du navigateur si installée).
- Algo SM-2 simplifié, intervalle affiché sur chaque bouton. 20 nouvelles cartes/jour par défaut.
- Sens vi → fr ou fr → vi.
- Import en masse : `vietnamien ; français ; exemple`, une ligne par carte (`;`, `|` ou tabulation).

**Notes** : markdown avec aperçu côte à côte, `ctrl+s` pour enregistrer, tableaux GFM.

**Historique** : chaque création / modif / suppression de note ou carte génère une entrée avec un diff `+`/`−`. Les modifs successives d'un même élément en moins de 30 min sont fusionnées en un seul diff. Chaque jour a un résumé auto (révisions, oublis, notes touchées, imports).

## Sauvegarde de la base

```bash
docker compose exec api node -e "require('better-sqlite3')('/data/viet.db').backup('/data/backup.db')"
docker compose cp api:/data/backup.db ./backup.db
```

## API

`POST /api/auth/login` · `GET|POST /api/notes` · `GET|PUT|DELETE /api/notes/:id` · `GET|POST /api/cards` · `POST /api/cards/import` · `PUT|DELETE /api/cards/:id` · `GET /api/review/next` · `POST /api/review/:id` · `GET /api/stats` · `GET /api/history`
