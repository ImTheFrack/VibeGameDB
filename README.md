VibeGameDB
==========

A personal video game library manager and database. Track all the games you own, the platforms you own them on, and enrich your collection with details, screenshots, tags, and more.

This repository contains a small Python stdlib HTTP server (main.py) which serves a single-page frontend from public/ and loads plugin-style handler modules from handlers/ under /plugins/<name>. The backend uses SQLite for persistence and supports CSV import/export, AI-powered enrichment, and IGDB integration.

What is included
----------------

- main.py -- tiny HTTP server with a plugin loader.
- public/ -- frontend single-page app shell and static assets:
  - index.html -- SPA shell with header, search, tabs, controls, and modals (templates)
  - css/style.css -- dark theme styles
  - js/main.js -- ES module entry point that wires the app together
  - js/state.js -- centralized state (games, platforms, filters, display options)
  - js/api.js -- tiny fetch helpers for plugin endpoints
  - js/render.js -- render functions for games and platforms
  - js/filters.js -- filter logic and active filter display
  - js/modals.js -- modal open/close helpers and modal population
  - js/events.js -- DOM event wiring and form handlers
  - img/ -- local SVG placeholder images that can be used by examples
- handlers/ -- plugin modules (each exports handle(req)):
  - config_handler.py - reads config.values and exposes it under the plugin loaders
  - database_handler.py -- CRUD API for games and platforms; persists to SQLite
  - import_handler.py -- CSV import with intelligent column mapping and validation
  - ai_handler.py -- AI enrichment (descriptions, tags, summaries) via config.AI_ENDPOINT_URL
  - init.py -- make handlers an importable task
  - seed_handler.py -- make dummy data if no database.
- config.py -- central configuration (AI endpoint, DB path, app title)
- data/ -- SQLite database file (gamedb.sqlite) and other persistent data
- scripts/-- test scripts (examples)
  - check_imports.py -- check if imports are properly imported in python
  - db_integration_test.py -- check if database CRUD tools (database_handler) is working

Database Schema
---------------

VibeGameDB stores your game library in two main tables:

THE `platforms` table
Represents platforms you own (e.g., Steam, PlayStation 5, Nintendo Switch, GOG, Epic Games Store, etc.). A platform can support both digital and physical distribution.

| Column            | Type    | Notes                                         |
|-------------------|---------|-----------------------------------------------|
| id                | TEXT PRIMARY KEY | Unique platform identifier (e.g., "playstation_5") |
| name              | TEXT UNIQUE NOT NULL | Platform name (e.g., "PlayStation 5") |
| supports_digital  | BOOLEAN | Whether this platform supports digital distribution |
| supports_physical | BOOLEAN | Whether this platform supports physical distribution |
| icon_url          | TEXT    | URL or path to platform icon                  |
| image_url         | TEXT    | URL or path to platform image                 |
| description       | TEXT    | Platform description or notes                 |
| year_acquired     | INTEGER | Year you acquired this platform               |
| generation        | INTEGER | Console generation (e.g., 8, 9)               |
| manufacturer      | TEXT    | Platform manufacturer (e.g., "Sony")          |
| created_at        | TIMESTAMP | Record creation timestamp                   |
| updated_at        | TIMESTAMP | Record last update timestamp                |

THE `games` table
Represents games in your collection, with metadata and relationships to platforms.

| Column            | Type        | Notes                                          |
|-------------------|-------------|------------------------------------------------|
| id                | INTEGER PRIMARY KEY | Unique game identifier                 |
| name              | TEXT NOT NULL | Game title                                     |
| description       | TEXT        | Game description or summary                    |
| cover_image_url   | TEXT        | URL or path to cover art                       |
| trailer_url       | TEXT        | URL to game trailer                            |
| is_derived_work   | BOOLEAN     | Whether this is a remake or remaster of another game |
| is_sequel         | BOOLEAN     | Whether this is a sequel to another game       |
| related_game_id   | INTEGER     | Foreign key to another game (if derived or sequel) |
| tags              | TEXT        | JSON array of tags (e.g., `["action", "RPG"]`) |
| igdb_id           | INTEGER     | ID from the Internet Game Database (IGDB)      |
| esrb_rating       | TEXT        | ESRB rating (e.g., "T", "M")                   |
| genre             | TEXT        | Comma-separated list of genres (e.g., "Action, RPG") |
| target_audience   | TEXT        | Comma-separated list of target audiences     |
| developer         | TEXT        | Comma-separated list of developers           |
| publisher         | TEXT        | Comma-separated list of publishers           |
| plot_synopsis     | TEXT        | Detailed plot summary                          |
| notes             | TEXT        | Personal notes about the game                  |
| created_at        | TIMESTAMP   | Record creation timestamp                      |
| updated_at        | TIMESTAMP   | Record last update timestamp                   |

Note: Games are linked to platforms via the game_platforms junction table (see below).

THE `game_platforms` table (junction table)
Links games to platforms and tracks how you obtained each copy and in what format.

| Column             | Type        | Notes                                           |
|--------------------|-------------|-------------------------------------------------|
| id                 | INTEGER PRIMARY KEY | Unique record identifier              |
| game_id            | INTEGER NOT NULL | Foreign key to `games`                      |
| platform_id        | TEXT NOT NULL | Foreign key to `platforms`                    |
| is_digital         | BOOLEAN     | Whether this copy is digital (true) or physical (false) |
| acquisition_method | TEXT        | How you obtained it: "bought", "free", "bundle", "gift", "subscription", etc. |
| created_at         | TIMESTAMP   | Record creation timestamp                       |
| updated_at         | TIMESTAMP   | Record last update timestamp                    |

Constraints:
- If is_digital = true, the platform must have supports_digital = true.
- If is_digital = false, the platform must have supports_physical = true.
- A game can appear multiple times on the same platform if it has both digital and physical copies.

Constraints & Integrity:
- Every game must have at least one platform entry (no orphan games).
- A platform may have zero games (e.g., a newly added platform).
- Deleting a platform should cascade-delete its game_platforms entries; if a game loses all platforms, it becomes an orphan and should be handled carefully (warn user or auto-delete).
- Deleting a game cascades to game_platforms entries.
- Remakes/remasters can reference other games via related_game_id to maintain a game family tree.
- Derived works (remakes/remasters) or sequels can reference other games via related_game_id.

Features
--------
- [x] Basic CRUD: Create, read, update, delete games and platforms via REST API.
- [x] SQLite persistence: Data stored in data/gamedb.sqlite.
- [x] Integration tests: scripts/db_integration_test.py validates CRUD operations.
- [x] Two main tabs: "Games" (showing platforms each game is on) and "Platforms" (showing games on each platform)
- [x] Summary cards: Display games/platforms with key metadata.
- [x] Display Controls: "Display" button with modal to show/hide card elements (cover, title, description, tags, platforms). Changes apply immediately.
- [x] Multi-Criteria Filtering: "Filter" button with modal supporting:
  - Keyword search (name/description, case-insensitive)
  - Platform filtering (multi-select checkboxes)
  - Tag filtering (multi-select checkboxes, dynamically extracted)
  - Active filter display in controls bar
- [x] Smart Tab Integration: Filter button only appears on Games tab; hidden on Platforms tab.
- [x] Interactive Pills: Clickable pills on game cards allow quick filter application/removal.
- [x] CSV Import -- Intelligent CSV import with validation:
   - Auto-detect and map CSV columns to database fields (games and/or platforms)
   - Preview mapped data before import
   - Handle missing or malformed data gracefully
     - After the import, modals.js displays an alert() with a summary of created_games, created_links, and any errors reported by the backend.
     - It also alerts the user if no CSV text is provided or if a network error occurs.
     - Upon successful (or partially successful) import, the modal is closed, and a vgd:import_complete event is dispatched, triggering a refresh of the game/platform lists.
   - Pre-fetching Game Data: Before processing CSV, all existing game names are loaded into a dictionary (existing_games_by_name). 
   - Batching New Games:New games are collected into a games_to_insert list. A single cursor.executemany() call then inserts all of them at once. This is the most significant optimization and dramatically reduces database overhead.
   - Batching New PlatformsStaging Links: The platform links for the new games are staged in a links_to_insert list. After the games are batch-inserted, we retrieve their newly created IDs and then create the links. While the link creation itself remains iterative in this implementation (due to platform validation logic), the heaviest part—the game insertion—is now batched.
   - Support multiple CSV formats (user-exported, IGDB exports, etc.)
   - Merge or skip duplicate games based on user choice
- [x] Edit Operations -- Modify single entries:
   - Click to edit any game or platform
     - Edit any data in the game or platform
     - Pull from IGDB/match AI (dummy for now)
     - Delete entry
     - Clone entry
     - Assign Game to Platform
   - Validation to prevent orphan games (every game should have a platform)
   - Cascade warnings when deleting platforms with games
 - [x] Browse & Filter -- View games and platforms in a Netflix-style scrollable interface with:
   - Sortable columns (name, date added, platform count, etc.)
   - Pagination and lazy loading
   - Filter by platform, tag, keyword, acquisition method, remake/remaster status
   - Modern Filter UI 
 - [x] Search & Autocomplete -- Fast search across games and platforms:
   - Autocomplete as you type (name, description, tags, platform names)
   - Full-text search fallback
   - Dropdown suggestions with game/platform previews
   - Basic fuzzy Logic (OR basics, really).
   - Advanced fuzzy logic (character, word, and substring-level-matching)
 - [x] Bulk Operations
   - Bulk select and mass-edit (e.g., change acquisition method for multiple games)
     - any field can be mass edited but obivously some will make more sense than others
     - mass delete
     - mass assign platform
 - [x] Smart Add Game -- Intelligent game addition workflow:
   - Quick "Add Game" button to add a new game from search
   - Autocomplete to find existing games in your library
   - If found, quickly add it to another platform
   - TODO: If new, a derived work, or a sequel, use IGDB or AI to auto-populate details
   - TODO: Ability to link derived works/sequels to original games
 - [x] UPDATE TO DATABASE for way more fields and filters
   - Games: Genre, Rating, Target AUdience, Developer(s), Publisher(s), IGDB ID
   - Platforms: Generation, Manufacturer
 - [x] IGDB Integration -- Fetch game metadata from Internet Game Database:
   - Search IGDB by game name or IGDB tag
   - Auto-populate cover art, descriptions, release dates, genres, platforms, keywords, etc.
   - Link local games to IGDB IDs for future syncing
   - TODO: Handle API rate limits and caching
 - [x] INFINITE SCROLL OPTION - don't like old-school pages?  you can "Infinite Scroll"

TODO   
1. AI Enrichment -- Supplement game data using AI:
   - Auto-generate or improve descriptions and summaries
   - Extract or suggest tags/keywords from descriptions or IGDB data
   - Fetch or generate review snippets
   - Validate and sanitize AI outputs (no chain-of-thought exposure)
   - Batch enrichment for multiple games

2. Platform Management -- Add and manage platforms:
   - Future: Direct API sync from stores (Steam, Epic, GOG, etc.)

3. CSV Export -- Export your library for backup or external use:
   - Export all games and platforms to CSV
   - Include all metadata (tags, acquisition method, platforms, etc.)
   - Format is compatible with CSV import (round-trip safe)
   - Support filtered exports (e.g., only games on a specific platform)

4. Screenshots & Media -- Store and display game media:
    - Upload and store multiple fullscreen screenshots per game
    - Display in lightbox or carousel on game detail view
    - Lazy-load images to keep UI responsive
    - Optional: Fetch screenshots from IGDB or other sources

5. Tags & Organization -- Flexible tagging system:
    - Add custom tags to games (e.g., "co-op", "story-driven", "completed", "wishlist")
    - Filter and search by tags
    - Suggest tags based on IGDB genres or AI analysis
    - Tag management UI to view all tags and their usage counts

6. Responsive UI & Polish -- Frontend refinements:
    - Mobile-friendly layout (games/platforms cards adapt to screen size)
    - Dark theme (already in place) with light theme option
    - Keyboard shortcuts for power users (e.g., Ctrl+K for search)
    - Undo/redo for accidental deletions
    - Loading states and error messages

Quick start
-----------

The instructions below show how to create a virtual environment (recommended), activate it, and run the server on both Linux (Ubuntu / bash) and Windows (PowerShell).

1.  Using a Python virtual environment (recommended)

Bash / Ubuntu:

```
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
# Optionally install dev deps here if added later
```

PowerShell (Windows):

```
python -m venv .venv
# In PowerShell
.\.venv\Scripts\Activate.ps1
# If execution policy prevents running scripts, you can use:
# . .\.venv\Scripts\activate (Cmd-style) or run PowerShell as admin and allow the script
python -m pip install --upgrade pip
```

2. Run the server

Bash / Ubuntu (inline env vars):

```
HOST=0.0.0.0 PORT=5000 DOC_ROOT=$(pwd)/public python main.py
```

PowerShell (set environment variables then run):

```
$env:HOST = '0.0.0.0'
$env:PORT = '5000'
# Optional: where static files live
$env:DOC_ROOT = (Resolve-Path .\public).Path
python .\main.py
```

(Notes: main.py uses ThreadingHTTPServer and reads HOST/PORT from env in __main__. run() default port is 8000; __main__ default is 5000.)

Useful endpoints / smoke tests
-----------------------------
- GET /health -> JSON {"status":"ok"}
- GET / -> serves public/index.html (if present)
- GET /plugins/database_handler/games -> sample games JSON: {"games": [...]}
- GET /plugins/database_handler/platforms -> sample platforms JSON: {"platforms": [...]}

3. Example curl commands

Bash / Ubuntu:

```
curl http://localhost:5000/health
curl http://localhost:5000/plugins/database_handler/games
curl http://localhost:5000/plugins/database_handler/platforms
```

PowerShell:

```
curl http://localhost:5000/health
curl http://localhost:5000/plugins/database_handler/games
curl http://localhost:5000/plugins/database_handler/platforms
```

Plugin API (what handler authors should know)
--------------------------------------------
Handlers must be placed in handlers/ and implement handle(req) where req is a dict with the following keys:
- method, path, subpath, query, headers, body, json (see main.py for exact behavior)

Return formats supported by the loader in main.py:
- Return a dict to emit JSON with HTTP 200.
- Return (status, body) where body may be str, bytes, or JSON-serializable dict/list.
- Return (status, headers, body) to provide explicit headers.

Important note: prefer returning dict for JSON success responses. Returning a raw list can be ambiguous: main.py interprets list/tuple of length >= 2 as a (status, body) tuple and will attempt to coerce the first element to an integer status code. This can cause runtime errors if the first element isn't an integer.

Development notes
-----------------
- The server uses ThreadingHTTPServer -- ensure plugin code is thread-safe.
- main.py relies on Content-Length for POST bodies; clients must set this header.
- config.py centralizes changeable values (AI endpoint, DB path, app title).

Development Roadmap
-------------------

The features listed above are prioritized by user value and implementation complexity. Start with Browse & Filter and Search & Autocomplete to make the app usable for viewing your library, then move to Edit & Bulk Operations and Smart Add Game for data management.

Completed:
- [x] Basic CRUD operations (games, platforms, game-platform links)
- [x] Multi-criteria filtering (keyword, platform, tag)
- [x] Display controls (show/hide card elements)
- [x] Interactive pills for quick filter application

Near-term focus (next 2-3 sprints):
- Edit & Bulk Operations (feature #3) -- edit game/platform modals with pre-filled data
- Search & Autocomplete (feature #2) -- fast search with autocomplete suggestions
- Smart Add Game (feature #4) -- intelligent game addition workflow
- Additional filters (acquisition method, game type)

Medium-term (sprints 4-6):
- AI Enrichment (feature #5)
- IGDB Integration (feature #6)
- CSV Import/Export (features #8-9)

Long-term (future enhancements):
- Screenshots & Media (feature #10)
- Tags & Organization (feature #11)
- Responsive UI & Polish (feature #12)
- Platform API sync (part of feature #7)
- Filter/display state persistence (localStorage, URL parameters)

Testing
-------

Run the integration test to verify database CRUD operations:

```
python scripts/db_integration_test.py
```

This test creates a temporary database, performs CRUD operations on games and platforms, validates data integrity, and cleans up.

---

License: see LICENSE in the repo root.