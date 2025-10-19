## Purpose
Short, actionable guidance for AI coding agents working on this repository (VibeGameDB).

Keep edits minimal and idiomatic: this is a tiny, single-file Python HTTP service implemented using the stdlib.

## Quick repo summary (big picture)
- Single-process HTTP service implemented in `main.py` using `http.server.ThreadingHTTPServer` and a `RequestHandler` subclass.
- Endpoints: `/` (HTML landing), `/health` (GET -> JSON {"status":"ok"}), `/echo` (GET query `?msg=...` -> JSON, POST JSON body -> echoes JSON). HEAD is implemented for these paths.
- No external dependencies; everything uses Python standard library.

Additional note: the server includes a minimal plugin loader that loads Python
modules from a local `handlers/` directory and exposes them under `/plugins/<name>`.

## Important implementation notes / patterns to preserve
- Centralized response helper: `_send(status, body, content_type, extra_headers)` — use this to set Content-Type and Content-Length consistently.
- Convenience wrappers: `send_text(...)` and `send_json(...)` should be used when adding endpoints.
- Request JSON parsing: `parse_body_json()` reads Content-Length and returns `None` on missing/invalid JSON — handlers treat `None` as a 400 error response.
 - Plugin request parsing: plugin modules receive a `req` dict from the loader. See the "Plugin loader" section below for fields and return formats.
- Concurrency: `ThreadingHTTPServer` is used. Keep handlers thread-safe (no shared mutable globals without locking).
- Logging: `log_message` is overridden to print compact logs to stdout. Follow this approach for consistent console output.

## Files to inspect when making changes
- `main.py` — entire application. All routes and helper functions live here.
- `README.md` — project description (very small).

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

Plugin loader (what to know when editing)

- The loader looks for modules at `handlers/<name>.py` where `<name>` must match `[A-Za-z0-9_]+`.
- Modules are loaded via `importlib.util.spec_from_file_location` and cached in `_PLUGIN_CACHE` keyed by name with the file mtime; the cache is protected by `_PLUGIN_LOCK` and the module is reloaded when mtime changes.
- Plugins must expose a callable `handle(req)` function. The server will call `module.handle(req)` and normalize the result.
- `req` shape (provided to plugins):
	- `method`: HTTP method string
	- `path`: full path on the request
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

- Error handling: if plugin import or execution fails, the server returns a 500 with a short message; if plugin module is not found, it returns 404.

## Integration points and side effects to watch
- The server relies on the `Content-Length` header for POST JSON parsing; clients that send chunked bodies or omit the header will not be supported.
- No database or external services are present — adding one should include a simple config pattern (env vars) and avoid global state.

## Examples from the codebase
- Response helpers: see `RequestHandler._send`, `send_json`, and `send_text` in `main.py`.
- JSON body parsing: `RequestHandler.parse_body_json()` returns `None` on invalid/missing JSON — callers return `400` in that case.

## Merge behavior for AI agents
- If updating this file, preserve the short structure and concrete examples. If a `.github/copilot-instructions.md` already exists, merge by keeping unique, repository-specific lines above and consolidating duplicate guidance.

## When in doubt
- Run the server locally and exercise endpoints before opening a PR. Keep changes minimal and document any new runtime env vars in `README.md`.

If you need the loader to behave differently (signed plugins, different reload strategy, or remote fetching), document the desired contract and add tests that exercise reloads and error paths.

---
If something in this file is unclear or you want more examples (tests, CI snippets, or a consistent port default), tell me which area to expand.
