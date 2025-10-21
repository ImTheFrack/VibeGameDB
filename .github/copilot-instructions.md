# Copilot instructions for VibeGameDB

Purpose
-------
This file gives short, actionable guidance for automated coding agents and contributors working on VibeGameDB.
The repo is a tiny Python stdlib HTTP server that serves a SPA frontend from `public/` and exposes plugin-style
endpoints under `/plugins/<name>` by loading Python modules from `handlers/`.

Goals for edits
---------------
- Keep the HTTP server and plugin loader behaviour unchanged unless intentionally extending it.
- Prefer small, testable changes. Add unit/integration tests when adding endpoints or changing plugin contracts.
- Preserve thread-safety: `ThreadingHTTPServer` is used so avoid shared mutable globals without proper locks.
- Keep frontend and backend contracts stable (JSON shapes, `games`/`platforms`/`game_platforms` payloads) to avoid breaking the SPA.

Quick project map
-----------------
- `main.py` — HTTP server and plugin loader. Key helpers: `_send()`, `send_text()`, `send_json()`, `parse_body_json()`.
- `public/` — static SPA files (served as DOC_ROOT): `index.html`, `css/style.css`, `js/main.js`, `img/`.
- `handlers/` — plugin modules, each must expose `handle(req)`.
  - `database_handler.py` — CRUD endpoints for games, platforms and `game_platforms` junctions.
  - `import_handler.py` — CSV import logic (placeholder to extend).
  - `ai_handler.py` — AI enrichment (uses `config.AI_ENDPOINT_URL`).
- `data/` — persistent storage (SQLite file `gamedb.sqlite` is used by the backend by default).
- `config.py` — runtime configuration (DB path, AI endpoint, app title).

What to inspect before changing behavior
---------------------------------------
- `main.py` for server bootstrapping, request parsing, and plugin loader caching/locking behavior.
- `public/js/main.js` and all of the nested ES scripts .js for frontend state shapes and functions: `renderGames()`, `populateFilterModal()`, `applyFilters()`, `applyDisplayOptions()`, and how `currentFilters` and `displayOptions` are used.
 - `public/js/main.js` and all nested ES modules for frontend state shapes and functions: `renderGames()`, `populateFilterModal()`, `applyFilters()`, and how `currentFilters` and `displayOptions` are used. Display options are applied within rendering logic.
- `handlers/database_handler.py` to confirm data shapes returned by `GET` endpoints (games, platforms, game_platforms) and expected POST/PUT payloads.
- `ARCHITECTURE.md` and `README.md` — authoritative description of implemented features (filtering, display controls, game_platforms).

Plugin loader contract (summary)
--------------------------------
- The loader loads `handlers/<name>.py` modules and calls `handle(req)`.
- `req` is a dict with: `method`, `path`, `subpath`, `query`, `headers`, `body`, `json`.
  - `json` is only parsed for POST/PUT/PATCH when `Content-Type` contains `application/json` and `Content-Length` is present; if parsing fails `json` is `None`.
- Plugin return formats accepted by the loader:
  - Return a `dict` &rarr; JSON response, status 200.
  - Return `(status, body)` &rarr; explicit status; `body` may be `str`, `bytes`, or JSON-serializable.
  - Return `(status, headers, body)` &rarr; explicit headers and body.
  - Any other return value &rarr; coerced to a string and sent as 200 text.
- Important: prefer returning `dict` for success responses. Returning raw `list`/`tuple` can be misinterpreted as `(status, body)`.

Server-side patterns and helpers to use
-------------------------------------
- Use `send_json()` and `send_text()` where appropriate so Content-Type and Content-Length are consistent.
- Use `parse_body_json()` carefully; it expects `Content-Length` present. If `parse_body_json()` returns `None`, return a 400 with a helpful error.
- Keep DB connections per-request and short-lived. Avoid module-level connection objects unless protected by locks.

Frontend contract and important shapes
-------------------------------------
The frontend expects consistent JSON shapes from the backend. Keep these contracts stable or provide migration-compatible endpoints.

Games (GET /plugins/database_handler/games) — returned object example:
```
{
  "games": [
    {
      "id": 1,
      "name": "Game Title",
      "description": "...",
      "cover_image_url": "...",
      "trailer_url": "...",
      "is_remake": false,
      "is_remaster": false,
      "related_game_id": null,
      "tags": ["action", "RPG"],
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "game_platforms": [
    { "id": 1, "game_id": 1, "platform_id": "steam", "is_digital": true, "acquisition_method": "bought" }
  ]
}
```
Platforms (GET /plugins/database_handler/platforms) — returned object example:
```
{ "platforms": [ { "id": "steam", "name": "Steam", "supports_digital": true, ... } ] }
```

DATABASE STRUCTURE
--------------------------
- Games are now independent entities (no embedded platforms array)
- Platforms are independent entities (no embedded games array)
- The `game_platforms` junction table manages the many-to-many relationship
- Each entry specifies whether the copy is digital or physical
- A game can appear multiple times on the same platform (once for digital, once for physical)
- Deleting a game cascades to delete all its `game_platforms` entries
- Deleting a platform cascades to delete all its `game_platforms` entries
- Orphaned games (with no platforms) are allowed but should be handled carefully
VALIDATION RULES
----------------
- Platform must support at least one format (digital or physical)
- Can't create a digital game-platform link if platform doesn't support digital
- Can't create a physical game-platform link if platform doesn't support physical
- Duplicate game-platform-format combinations are prevented by UNIQUE constraint

Frontend features to be aware of (already implemented)
-----------------------------------------------------
- Modal-based multi-criteria filtering on the Games tab (keyword, platform, tags). State object: `currentFilters = { keyword: '', platforms: [], tags: [] }`.
- Display controls modal for toggling which card elements are shown. State object: `displayOptions = { show_cover, show_title, show_description, show_tags, show_platforms }
 - Display controls modal for toggling which card elements are shown. State object: `displayOptions = { show_cover, show_title, show_description, show_tags, show_platforms }`
- Clickable "pills" on game cards to quickly apply/remove filters.
- Smart tab UI: Filter button is only visible on the Games tab.

When editing frontend code
-------------------------
- Keep the `currentFilters` and `displayOptions` objects consistent and avoid renaming their properties without updating all usages.
- Use `populateFilterModal()` to source platforms (from `/plugins/database_handler/platforms`) and tags (extracted from `games`).
- If you change the format of a games or platforms response, update the frontend modules (e.g., `render.js`, `filters.js`, `modals.js`) and `ARCHITECTURE.md`/`README.md` together.

Security, side-effects and concurrency
-------------------------------------
- Do not commit secrets (API keys) into the repo. Prefer environment variables via `config.py`.
- The server relies on `Content-Length` for POST JSON parsing — clients must set this header. Document this in tests if necessary.
- Avoid long-running synchronous work in request handlers (offload to background jobs or threads if needed).