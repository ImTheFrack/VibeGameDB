# VibeGameDB
Vibe-coded GameDB

## Run

This is a tiny single-file HTTP server using Python stdlib. It exposes:
- `/` landing page (or serves `index.html` if present in the doc root)
- `/health` (GET -> `{ "status": "ok" }`)
- `/echo` (GET `?msg=...` -> JSON, POST JSON body -> echoes JSON)
- Static file serving from a document root

### Environment variables
- `HOST` (default `0.0.0.0`)
- `PORT` (default `5000` via `__main__`; `run()` default is `5000`)
- `DOC_ROOT` (optional) directory to serve static files from. If unset, the server uses `./public` if it exists, otherwise the current working directory.

### Start (PowerShell)
```powershell
$env:HOST = '0.0.0.0'
$env:PORT = '5000'
# Optional: where static files live
$env:DOC_ROOT = (Resolve-Path .\public).Path
python .\main.py
```

### Static files
- Any unmatched path is served from `DOC_ROOT`.
- Directories serve `index.html`/`index.htm` if present; otherwise a simple directory listing is returned.
- Path traversal is prevented; requests outside `DOC_ROOT` return 403.

### Quick tests
```powershell
# JSON endpoints
curl http://localhost:5000/health
curl "http://localhost:5000/echo?msg=hello"
curl -X POST -H "Content-Type: application/json" -d '{"x":1}' http://localhost:5000/echo

# Static file (assuming .\public\index.html exists)
curl http://localhost:5000/
```

### Plugins (/plugins/<name>)

The server includes a minimal plugin loader that loads Python modules from a
local `handlers/` directory next to `main.py`. Request paths under
`/plugins/<name>` map to `handlers/<name>.py` and invoke the module's
`handle(req)` function.

Key details:

- Handlers directory: `handlers/` alongside `main.py` (`HANDLERS_DIR`).
- Route: `/plugins/<name>` where `<name>` must match `[A-Za-z0-9_]+` (no slashes).
- Subpath: anything after the name is provided to the plugin as `req['subpath']`.
- Caching: modules are cached in-memory and reloaded when the file's mtime
	changes (mtime-based cache protected by a lock).

Plugin API (callable `handle(req)`):

- Input: a single `req` dict with these keys:
	- `method`: HTTP method string (GET/POST/etc.)
	- `path`: full request path
	- `subpath`: path after the plugin name (leading slash or empty string)
	- `query`: parsed query dict (values are lists)
	- `headers`: dict of request headers
	- `body`: raw request body as bytes (for POST/PUT/PATCH when Content-Length > 0)
	- `json`: parsed JSON object or `None` (only attempted for POST/PUT/PATCH when
		Content-Type contains `application/json`)

- Return values supported by the loader:
	- a `dict` -> sent as JSON (200)
	- `(status, body)` -> sends the body with given status (body may be str, bytes, dict/list)
	- `(status, headers, body)` -> same as above with explicit headers
	- any other value -> converted to string and sent as 200 text

Notes and security

- Name validation prevents slashes and suspicious characters. Names must be
	alphanumeric with underscores.
- The loader treats handler files as local code. Do not store secrets in
	handlers if they may be read by clients or third parties.
- The server does not authenticate plugin requests by default; add your own
	checks if needed.

Example handler file (`handlers/hello.py`):

		def handle(req):
				# echo query param or json body
				name = None
				q = req.get('query', {})
				if 'name' in q and q['name']:
						name = q['name'][0]
				elif req.get('json') and isinstance(req['json'], dict):
						name = req['json'].get('name')
				if not name:
						name = 'world'
				return {'greeting': f'hello {name}'}

Quick examples

```powershell
# GET plugin (no body):
curl http://localhost:5000/plugins/hello

# POST with JSON body (Content-Type must include application/json):
curl -X POST -H "Content-Type: application/json" -d '{"name":"alice"}' http://localhost:5000/plugins/hello
```
