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

## Quick start

The instructions below show how to create a virtual environment (recommended), activate it, and run the server on both Linux (Ubuntu / bash) and Windows (PowerShell).

### Using a Python virtual environment (recommended)

Bash / Ubuntu:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
# Optionally install dev deps here if added later
```

PowerShell (Windows):

```powershell
python -m venv .venv
# In PowerShell
.\.venv\Scripts\Activate.ps1
# If execution policy prevents running scripts, you can use:
# . .\.venv\Scripts\activate (Cmd-style) or run PowerShell as admin and allow the script
python -m pip install --upgrade pip
```

### Run the server

Bash / Ubuntu (inline env vars):

```bash
HOST=0.0.0.0 PORT=5000 DOC_ROOT=$(pwd)/public python main.py
```

PowerShell (set environment variables then run):

```powershell
$env:HOST = '0.0.0.0'
$env:PORT = '5000'
# Optional: where static files live
$env:DOC_ROOT = (Resolve-Path .\public).Path
python .\main.py
```

(Notes: `main.py` uses `ThreadingHTTPServer` and reads `HOST`/`PORT` from env in `__main__`. `run()` default port is 8000; `__main__` default is 5000.)

## Useful endpoints / smoke tests
- `GET /health` -> JSON `{"status":"ok"}`
- `GET /` -> serves `public/index.html` (if present)
- `GET /plugins/database_handler/games` -> sample games JSON: `{"games": [...]}`
- `GET /plugins/database_handler/platforms` -> sample platforms JSON: `{"platforms": [...]}`

### Example curl commands

Bash / Ubuntu:

```bash
curl http://localhost:5000/health
curl http://localhost:5000/plugins/database_handler/games
curl http://localhost:5000/plugins/database_handler/platforms
```

PowerShell:

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
