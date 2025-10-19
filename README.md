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
