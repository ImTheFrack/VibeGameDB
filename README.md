# VibeGameDB

A lightweight personal Video Game Database web app skeleton.

This repository contains a small Python stdlib HTTP server (`main.py`) which serves a single-page frontend from `public/` and loads plugin-style handler modules from `handlers/` under `/plugins/<name>`.

## What is included
- `main.py` — tiny HTTP server with a plugin loader.
- `public/` — frontend single-page app shell and static assets:
  - `index.html` — SPA shell with header, search, tabs, controls, and modals (templates)
  - `css/style.css` — dark theme styles
  - `js/app.js` — frontend behavior stubs, event handlers, and fetch calls
  - `img/` — local SVG placeholder images used by the examples
- `handlers/` — plugin modules (each exports `handle(req)`):
  - `database_handler.py` — returns sample `games` and `platforms` JSON for the frontend
  - `import_handler.py` — CSV import placeholder
  - `ai_handler.py` — AI enrichment placeholder (reads `config.AI_ENDPOINT_URL`)
  - `hello.py` — small echo example (existing)
- `config.py` — central configuration (AI endpoint, DB path, app title)
- `data/` — empty directory placeholder for future DB files

## Quick start (PowerShell)
From the repository root run:

```powershell
$env:HOST = '0.0.0.0'
$env:PORT = '5000'
# Optional: serve a different doc root
$env:DOC_ROOT = (Resolve-Path .\public).Path
python .\main.py
```

Open your browser at http://localhost:5000/ to see the SPA shell.

## Useful endpoints / smoke tests
- `GET /health` -> JSON `{"status":"ok"}`
- `GET /` -> serves `public/index.html` (if present)
- `GET /plugins/database_handler/games` -> sample games JSON: `{"games": [...]}`
- `GET /plugins/database_handler/platforms` -> sample platforms JSON: `{"platforms": [...]}`

Sample PowerShell curl commands:

```powershell
curl http://localhost:5000/health
curl http://localhost:5000/plugins/database_handler/games
curl http://localhost:5000/plugins/database_handler/platforms
```

## Plugin API (what handler authors should know)
Handlers must be placed in `handlers/` and implement `handle(req)` where `req` is a dict with the following keys:
- `method`, `path`, `subpath`, `query`, `headers`, `body`, `json` (see `main.py` for exact behavior)

Return formats supported by the loader in `main.py`:
- Return a `dict` to emit JSON with HTTP 200.
- Return `(status, body)` where `body` may be `str`, `bytes`, or JSON-serializable `dict`/`list`.
- Return `(status, headers, body)` to provide explicit headers.

Important note: prefer returning `dict` for JSON success responses. Returning a raw `list` can be ambiguous: `main.py` interprets `list`/`tuple` of length >= 2 as a `(status, body)` tuple and will attempt to coerce the first element to an integer status code. This can cause runtime errors if the first element isn't an integer.

## Development notes
- The server uses `ThreadingHTTPServer` — ensure plugin code is thread-safe.
- `main.py` relies on `Content-Length` for POST bodies; clients must set this header.
- `config.py` centralizes changeable values (AI endpoint, DB path, app title).

## Current TODOs (next work items)
1. Wire frontend forms/modals in `public/js/app.js` to real CRUD endpoints on `database_handler.py` (implement POST/PUT/DELETE).
2. Implement simple persistence (JSON or SQLite) under `data/` and update `database_handler` accordingly.
3. Implement CSV import parsing and mapping UI in `handlers/import_handler.py` + `public/index.html` + `app.js`.
4. Implement real AI enrichment in `handlers/ai_handler.py` using `config.AI_ENDPOINT_URL` and add careful parsing/validation of AI outputs (avoid exposing chain-of-thought).
5. Add small integration tests that start the server and assert endpoints return expected shapes.
6. Add modal open/close and form validation logic in the frontend.

If you want, I can implement TODO #1 (basic create/update/delete and local persistence) next — say the word and I'll implement it and add tests.

---

License: see `LICENSE` in the repo root.
