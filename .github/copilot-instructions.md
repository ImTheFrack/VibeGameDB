## Purpose
Short, actionable guidance for AI coding agents working on this repository (VibeGameDB).

This repo is now a small web application skeleton: a tiny Python stdlib web server (`main.py`) that serves
static files from `public/` and a plugin system that loads Python modules from `handlers/` and exposes them
under `/plugins/<name>`. The frontend SPA shell lives in `public/` and fetches example data from the plugin
endpoints so the repository can be run locally without external dependencies.

Additional note: the server includes a minimal plugin loader that loads Python
modules from a local `handlers/` directory and exposes them under `/plugins/<name>`.

New project structure you should know about:

```
/
├── public/                  # Static files (DOC_ROOT) - SPA shell, CSS, JS, images
│   ├── index.html           # SPA shell (header, tabs, controls, modals)
│   ├── css/style.css        # Dark theme styles
│   ├── js/app.js            # Frontend behavior stubs and fetch calls
│   └── img/                 # Local placeholder images
├── handlers/                # Python plugin modules
│   ├── database_handler.py  # CRUD API stubs for games/platforms (returns sample JSON)
│   ├── import_handler.py    # CSV import placeholder
│   └── ai_handler.py        # AI enrichment placeholder (uses config.AI_ENDPOINT_URL)
├── data/                    # Data storage (empty placeholder)
├── config.py                # Central configuration (AI endpoint, DB path, app title)
├── main.py                  # Server and plugin loader (unchanged core behavior)
```

## Important implementation notes / patterns to preserve
- Centralized response helper: `_send(status, body, content_type, extra_headers)` — use this to set Content-Type and Content-Length consistently.
- Convenience wrappers: `send_text(...)` and `send_json(...)` should be used when adding endpoints.
- Request JSON parsing: `parse_body_json()` reads Content-Length and returns `None` on missing/invalid JSON — handlers treat `None` as a 400 error response.
 - Plugin request parsing: plugin modules receive a `req` dict from the loader. See the "Plugin loader" section below for fields and return formats.
- Concurrency: `ThreadingHTTPServer` is used. Keep handlers thread-safe (no shared mutable globals without locking).
- Logging: `log_message` is overridden to print compact logs to stdout. Follow this approach for consistent console output.

Frontend notes:
- `public/index.html` is a single page application shell wired to `public/js/app.js`.
- `app.js` performs initial fetch to `/plugins/database_handler/games` and `/plugins/database_handler/platforms` (see TODO below).
- Example cards in `index.html` use local SVG placeholders from `public/img/` to avoid external DNS or placeholder service failures.

## Files to inspect when making changes
- `main.py` — entire server and plugin loader.
- `README.md` — updated project description and run instructions.

Optional: `handlers/` — place example plugin modules here; the loader looks for `handlers/<name>.py`.

## Developer workflows (how to run & test locally)
- Run the server directly with Python. The process reads `HOST` and `PORT` environment variables in `__main__`.
- Note: `run()` has a default port of `8000`, while `__main__` uses the environment variable default `5000` — be aware of this mismatch when testing.

Example (PowerShell):
```powershell
$env:HOST = '0.0.0.0'
$env:PORT = '5000'
python .\main.py
```

Quick smoke tests (PowerShell):
```powershell
# health
curl http://localhost:5000/health
# echo GET
curl "http://localhost:5000/echo?msg=hello"
# echo POST (JSON)
curl -X POST -H "Content-Type: application/json" -d '{"x":1}' http://localhost:5000/echo
```

Plugin quick tests (PowerShell):

```powershell
# GET plugin (no body)
curl http://localhost:5000/plugins/hello

# POST plugin with JSON
curl -X POST -H "Content-Type: application/json" -d '{"name":"alice"}' http://localhost:5000/plugins/hello
```

## What to change and how to structure edits
- Add new endpoints by editing `do_GET`, `do_POST`, and `do_HEAD` in `RequestHandler`. Use `send_json`/`send_text` and `parse_body_json`.
- Avoid changing the server bootstrap unless adding a CLI or config file; prefer environment variables for runtime overrides.
- Keep changes small and testable: add a unit-level test script or small integration test that starts the server on an ephemeral port and exercises endpoints.

When adding or modifying frontend behavior, update `public/js/app.js` and add any new static assets under `public/` so they are served by the doc root.

## Plugin loader (what to know when editing)

- The loader looks for modules at `handlers/<name>.py` where `<name>` must match `[A-Za-z0-9_]+`.
- Modules are loaded via `importlib.util.spec_from_file_location` and cached in `_PLUGIN_CACHE` with mtime; the cache is protected by `_PLUGIN_LOCK` and modules are reloaded when file mtime changes.
- Plugins must expose a callable `handle(req)` function. The server will call `module.handle(req)` and normalize the result.
- `req` shape (provided to plugins):
	- `method`: HTTP method string
	- `path`: full request path
	- `subpath`: part of the path after the plugin name (leading slash or empty)
	- `query`: parsed query params (values are lists)
	- `headers`: dict of request headers
	- `body`: raw bytes (for POST/PUT/PATCH when Content-Length > 0)
	- `json`: parsed JSON or `None` (attempted only for POST/PUT/PATCH when Content-Type contains `application/json`)

- Plugin return formats understood by the loader:
	- `dict` -> returned as JSON (200)
	- `(status, body)` -> sends body with given status (body may be str, bytes, dict/list)
	- `(status, headers, body)` -> same as above with explicit headers
	- any other value -> converted to string and sent as 200 text

Important: prefer returning `dict` objects for successful JSON responses. Returning a raw `list` can be ambiguous: the loader treats `list/tuple` of length >= 2 as a `(status, body)` tuple, which can cause runtime errors if the first list element is not an integer status code.

## Integration points and side effects to watch
- The server relies on the `Content-Length` header for POST JSON parsing; clients that send chunked bodies or omit the header will not be supported.
- No database or external services are present — adding one should include a simple config pattern (env vars) and avoid global state.

TODO (near term priorities)
- Wire `public/js/app.js` to real CRUD endpoints and implement minimal `POST /plugins/database_handler/games` to create entries in a simple JSON or SQLite file (under `data/`).
- Implement CSV parsing in `handlers/import_handler.py` and mapping preview UI in `public/index.html`/`app.js`.
- Add modal open/close logic and form submission handling in `public/js/app.js`.
- Add small integration tests that start the server and assert plugin endpoints return expected shapes.
- Add instructions in `README.md` for developer workflow and a `requirements.txt` only if external dependencies are introduced.

If you need me to implement any TODOs, tell me which one to tackle next and I'll change the code directly.
