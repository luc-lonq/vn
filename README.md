# tiếng việt

A small self-hosted web app to learn Vietnamese: Markdown notes, spaced-repetition vocabulary (Anki-style) and a GitHub-style history of every change.

The UI is in French; the code and docs are in English.

## Features

**Vocabulary**

- Review with keyboard shortcuts: `space` shows the answer, `1`–`4` rate it (again / hard / good / easy), `v` reads the word aloud (browser `vi-VN` voice, if installed).
- Simplified SM-2 scheduler; the next interval is shown on each button. 20 new cards per day by default.
- Vietnamese → French or French → Vietnamese.
- Bulk import: one card per line, `vietnamese ; french ; example` (`;`, `|` or tab separated, so pasting from a spreadsheet works).

**Notes**: Markdown with side-by-side preview, GFM tables, `Ctrl+S` to save.

**History**: every create / update / delete of a note or card produces an entry with a `+`/`−` diff. Successive edits of the same item within 30 minutes are merged into a single diff. Each day gets an automatic summary (reviews, lapses, notes edited, imports).

## Getting started

Requires Docker with the Compose plugin.

```bash
cp .env.example .env      # then set APP_PASSWORD
docker compose up --build
```

Open http://localhost:5173.

Source folders are mounted as volumes: the frontend (Vite) and the API (`node --watch`) reload on change. After adding an npm dependency, run `docker compose up --build` again.

### Without Docker

```bash
cd server && npm install && APP_PASSWORD=dev npm run dev
cd web && npm install && npm run dev      # in another terminal
```

## Stack

|          |                                                                                  |
| -------- | -------------------------------------------------------------------------------- |
| Frontend | React 19, Tailwind CSS 4, Vite, react-markdown (+GFM)                             |
| Backend  | Node 22, Express 4                                                               |
| Database | SQLite via better-sqlite3 — single user, so one file is all it needs             |
| Auth     | One password from the environment; stateless HMAC-signed httpOnly cookie, 30 days |

## Project structure

```
server/
  src/
    server.js          entry point (config, database, HTTP server)
    app.js             Express app factory, route wiring
    config.js          environment variables
    db/                schema and connection
    middleware/        auth (sessions, login rate limit), error handler
    routes/            notes, cards, review, history
    services/          SM-2 scheduler, review queue and stats, history/diffs
    utils/
  test/                node:test suites (unit + API against an in-memory database)
web/
  src/
    App.jsx            routing and session check
    components/        shared UI (header, Markdown)
    hooks/             useSearch, useKeyboard, useTheme
    lib/               API client, formatting, speech, storage
    pages/             login, notes/, vocab/, history/
```

## Development

Each package has the same scripts:

```bash
npm run lint           # ESLint
npm run format         # Prettier
npm test               # server only
```

CI (`.github/workflows/ci.yml`) runs lint, format check, tests and the frontend build on every push and pull request, then deploys `main`.

## Deployment

See [DEPLOY.md](DEPLOY.md) — a Docker image served behind an existing nginx, deployed by GitHub Actions or with a single script on the server.

## API

All routes are under `/api` and require the session cookie, except `health` and `auth/*`.

| Method              | Route               | Description                                 |
| ------------------- | ------------------- | ------------------------------------------- |
| `GET`               | `/health`           | Liveness check                              |
| `POST`              | `/auth/login`       | `{ password }` → sets the session cookie    |
| `POST`              | `/auth/logout`      |                                             |
| `GET`               | `/auth/me`          | `{ authed }`                                |
| `GET` `POST`        | `/notes`            | List (`?q=` search) / create                |
| `GET` `PUT` `DELETE` | `/notes/:id`        |                                             |
| `GET` `POST`        | `/cards`            | List (`?q=` search) / create                |
| `POST`              | `/cards/import`     | `{ text, tags }`, one card per line         |
| `PUT` `DELETE`      | `/cards/:id`        |                                             |
| `GET`               | `/review/next`      | Next card, interval previews and stats      |
| `POST`              | `/review/:id`       | `{ rating: 1-4 }`                           |
| `GET`               | `/stats`            | Due / new / reviewed today / streak / total |
| `GET`               | `/history`          | Paginated entries with diffs (`?before=`)   |
