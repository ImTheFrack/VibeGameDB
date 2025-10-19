# VibeGameDB

A personal video game library manager and database. Track all the games you own, the platforms you own them on, and enrich your collection with details, screenshots, tags, and more.

This repository contains a small Python stdlib HTTP server (`main.py`) which serves a single-page frontend from `public/` and loads plugin-style handler modules from `handlers/` under `/plugins/<name>`. The backend uses SQLite for persistence and supports CSV import/export, AI-powered enrichment, and IGDB integration.

## What is included
- `main.py` — tiny HTTP server with a plugin loader.
- `public/` — frontend single-page app shell and static assets:
  - `index.html` — SPA shell with header, search, tabs, controls, and modals (templates)
  - `css/style.css` — dark theme styles
  - `js/app.js` — frontend behavior stubs, event handlers, and fetch calls
  - `img/` — local SVG placeholder images used by the examples
- `handlers/` — plugin modules (each exports `handle(req)`):
  - `database_handler.py` — CRUD API for games and platforms; persists to SQLite
  - `import_handler.py` — CSV import with intelligent column mapping and validation
  - `ai_handler.py` — AI enrichment (descriptions, tags, summaries) via `config.AI_ENDPOINT_URL`
  - `hello.py` — small echo example (existing)
- `config.py` — central configuration (AI endpoint, DB path, app title)
- `data/` — SQLite database file (`gamedb.sqlite`) and other persistent data

## Database Schema

VibeGameDB stores your game library in two main tables:

### `platforms` table
Represents physical or digital platforms you own (e.g., Steam, PlayStation 5, Nintendo Switch, GOG, Epic Games Store, etc.).

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY | Unique platform identifier |
| `name` | TEXT UNIQUE NOT NULL | Platform name (e.g., "Steam", "PS5") |
| `type` | TEXT | "digital" or "physical" |
| `icon_url` | TEXT | URL or path to platform icon |
| `image_url` | TEXT | URL or path to platform image |
| `description` | TEXT | Platform description or notes |
| `year_acquired` | INTEGER | Year you acquired this platform |
| `created_at` | TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | Record last update timestamp |

### `games` table
Represents games in your collection, with metadata and relationships to platforms.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY | Unique game identifier |
| `name` | TEXT NOT NULL | Game title |
| `description` | TEXT | Game description or summary |
| `cover_image_url` | TEXT | URL or path to cover art |
| `trailer_url` | TEXT | URL to game trailer |
| `is_remake` | BOOLEAN | Whether this is a remake of another game |
| `is_remaster` | BOOLEAN | Whether this is a remaster of another game |
| `related_game_id` | INTEGER | Foreign key to another game (if remake/remaster) |
| `tags` | TEXT | JSON array of tags (e.g., `["action", "RPG", "indie"]`) |
| `created_at` | TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | Record last update timestamp |

### `game_platforms` table (junction table)
Links games to platforms and tracks how you obtained each copy.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY | Unique record identifier |
| `game_id` | INTEGER NOT NULL | Foreign key to `games` |
| `platform_id` | INTEGER NOT NULL | Foreign key to `platforms` |
| `acquisition_method` | TEXT | How you obtained it: "bought", "free", "bundle", "gift", "subscription", etc. |
| `created_at` | TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | Record last update timestamp |

**Constraints & Integrity:**
- Every game must have at least one platform entry (no orphan games).
- A platform may have zero games (e.g., a newly added platform).
- Deleting a platform should cascade-delete its game_platforms entries; if a game loses all platforms, it becomes an orphan and should be handled carefully (warn user or auto-delete).
- Deleting a game cascades to game_platforms entries.
- Remakes/remasters can reference other games via `related_game_id` to maintain a game family tree.

## Features

### Current (Implemented)
- ✅ **Basic CRUD**: Create, read, update, delete games and platforms via REST API.
- ✅ **SQLite persistence**: Data stored in `data/gamedb.sqlite`.
- ✅ **Integration tests**: `scripts/db_integration_test.py` validates CRUD operations.

### Planned (In Priority Order)

1. **Browse & Filter** — View games and platforms in a Netflix-style scrollable interface with:
   - Sortable columns (name, date added, platform count, etc.)
   - Pagination and lazy loading
   - Filter by platform, tag, acquisition method, remake/remaster status
   - Two main tabs: "Games" (showing platforms each game is on) and "Platforms" (showing games on each platform)
   - Summary cards with key metadata

2. **Search & Autocomplete** — Fast search across games and platforms:
   - Autocomplete as you type (name, description, tags, platform names)
   - Full-text search fallback
   - Fuzzy matching for typos or partial matches
   - Dropdown suggestions with game/platform previews

3. **Edit & Bulk Operations** — Modify single or multiple entries:
   - Click to edit any game or platform
   - Bulk select and mass-edit (e.g., change acquisition method for multiple games)
   - Validation to prevent orphan games (every game must have a platform)
   - Cascade warnings when deleting platforms with games

4. **Smart Add Game** — Intelligent game addition workflow:
   - Quick "+" button to add a new game
   - Autocomplete to find existing games in your library
   - If found, quickly add it to another platform
   - If new or a remake/remaster, use IGDB or AI to auto-populate details
   - Ability to link remakes/remasters to original games

5. **AI Enrichment** — Supplement game data using AI:
   - Auto-generate or improve descriptions and summaries
   - Extract or suggest tags/keywords from descriptions or IGDB data
   - Fetch or generate review snippets
   - Validate and sanitize AI outputs (no chain-of-thought exposure)
   - Batch enrichment for multiple games

6. **IGDB Integration** — Fetch game metadata from Internet Game Database:
   - Search IGDB by game name
   - Auto-populate cover art, descriptions, release dates, genres, platforms
   - Link local games to IGDB IDs for future syncing
   - Handle API rate limits and caching

7. **Platform Management** — Add and manage platforms:
   - Create custom platforms (e.g., "Wishlist", "Backlog", "Completed")
   - Edit platform details (name, type, icon, description, year acquired)
   - Future: Direct API sync from stores (Steam, Epic, GOG, etc.)

8. **CSV Import** — Intelligent CSV import with validation:
   - Auto-detect and map CSV columns to database fields
   - Preview mapped data before import
   - Handle missing or malformed data gracefully
   - Support multiple CSV formats (user-exported, IGDB exports, etc.)
   - Merge or skip duplicate games based on user choice

9. **CSV Export** — Export your library for backup or external use:
   - Export all games and platforms to CSV
   - Include all metadata (tags, acquisition method, platforms, etc.)
   - Format is compatible with CSV import (round-trip safe)
   - Support filtered exports (e.g., only games on a specific platform)

10. **Screenshots & Media** — Store and display game media:
    - Upload and store multiple fullscreen screenshots per game
    - Display in lightbox or carousel on game detail view
    - Lazy-load images to keep UI responsive
    - Optional: Fetch screenshots from IGDB or other sources

11. **Tags & Organization** — Flexible tagging system:
    - Add custom tags to games (e.g., "co-op", "story-driven", "completed", "wishlist")
    - Filter and search by tags
    - Suggest tags based on IGDB genres or AI analysis
    - Tag management UI to view all tags and their usage counts

12. **Responsive UI & Polish** — Frontend refinements:
    - Mobile-friendly layout (games/platforms cards adapt to screen size)
    - Dark theme (already in place) with light theme option
    - Keyboard shortcuts for power users (e.g., Ctrl+K for search)
    - Undo/redo for accidental deletions
    - Loading states and error messages

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

## Development Roadmap

The features listed above are prioritized by user value and implementation complexity. Start with **Browse & Filter** and **Search & Autocomplete** to make the app usable for viewing your library, then move to **Edit & Bulk Operations** and **Smart Add Game** for data management.

**Near-term focus** (next 2–3 sprints):
- Browse & Filter (feature #1)
- Search & Autocomplete (feature #2)
- Edit & Bulk Operations (feature #3)
- Smart Add Game (feature #4)

**Medium-term** (sprints 4–6):
- AI Enrichment (feature #5)
- IGDB Integration (feature #6)
- CSV Import/Export (features #8–9)

**Long-term** (future enhancements):
- Screenshots & Media (feature #10)
- Tags & Organization (feature #11)
- Responsive UI & Polish (feature #12)
- Platform API sync (part of feature #7)

## Testing

Run the integration test to verify database CRUD operations:

```bash
python scripts/db_integration_test.py
```

This test creates a temporary database, performs CRUD operations on games and platforms, validates data integrity, and cleans up.

---

License: see `LICENSE` in the repo root.
