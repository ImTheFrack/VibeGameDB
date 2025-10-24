"""
SQLite-backed database handler.

This implements basic CRUD operations for games and read for platforms.
It stores data in a SQLite file configured by `config.DATABASE_FILE`.

Design notes and contract:
- Exposes subpaths under `/plugins/database_handler/<resource>` where
  `<resource>` is one of: `games`, `platforms`.
- Supported methods for `games`:
    - GET /games -> list of games (supports optional ?id=<int> to fetch a single game)
    - POST /games -> create a game (JSON body)
    - PUT /games/<id> -> update a game (JSON body)
    - DELETE /games/<id> -> delete a game
- The handler uses simple JSON shapes and returns `(status, dict)` or `dict` for 200 responses.

Security and concurrency:
- The server is threaded (`ThreadingHTTPServer`); sqlite3 connections are created per-call which is safe for this small app.
- Inputs are minimally validated; production code should harden validation and authentication.

All mutable configuration values live in `config.py` (per project rules).
"""

from typing import Dict, Any, Optional, List
import sqlite3
import json
import os
import re
import difflib

try:
    import config
except Exception:
    # If config is missing, fall back to sensible defaults
    class _C:
        DATABASE_FILE = os.path.join('data', 'gamedb.sqlite')
        APP_TITLE = 'My Game Library'
    config = _C()

# --- Schema Definition: Single Source of Truth ---
# Define the columns for the 'games' table. This list is used to dynamically
# build queries and validate data, reducing errors from schema changes.
GAME_COLUMNS = [
    'name', 'description', 'release_year', 'cover_image_url', 'trailer_url',
    'is_derived_work', 'is_sequel', 'related_game_id', 'igdb_id', 'esrb_rating',
    'genre', 'target_audience', 'developer', 'publisher', 'plot_synopsis', 'notes'
]

# Define which columns are user-editable via the standard form.
# This prevents accidental updates to protected fields like 'id' or 'created_at'.
EDITABLE_GAME_COLUMNS = GAME_COLUMNS + ['tags']

PLATFORM_COLUMNS = [
    'id', 'name', 'supports_digital', 'supports_physical', 'icon_url', 'image_url',
    'description', 'year_acquired', 'generation', 'manufacturer'
]
EDITABLE_PLATFORM_COLUMNS = [
    'name', 'supports_digital', 'supports_physical', 'icon_url', 'image_url',
    'description', 'year_acquired', 'generation', 'manufacturer'
]

GAME_PLATFORM_COLUMNS = [
    'game_id', 'platform_id', 'is_digital', 'acquisition_method'
]
EDITABLE_GAME_PLATFORM_COLUMNS = GAME_PLATFORM_COLUMNS

# Columns that can be mapped during CSV import
IMPORT_GAME_COLUMNS = EDITABLE_GAME_COLUMNS
IMPORT_GAME_PLATFORM_COLUMNS = ['acquisition_method'] # game_id/platform_id are handled by column header



DB_SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    release_year INTEGER,
    cover_image_url TEXT,
    trailer_url TEXT,
    is_derived_work BOOLEAN DEFAULT 0,
    is_sequel BOOLEAN DEFAULT 0,
    related_game_id INTEGER,
    tags TEXT,
    igdb_id INTEGER,
    esrb_rating TEXT,
    genre TEXT,
    target_audience TEXT,
    developer TEXT,
    publisher TEXT,
    plot_synopsis TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platforms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    supports_digital BOOLEAN DEFAULT 1,
    supports_physical BOOLEAN DEFAULT 0,
    icon_url TEXT,
    image_url TEXT,
    description TEXT,
    year_acquired INTEGER,
    generation INTEGER,
    manufacturer TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_platforms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    platform_id TEXT NOT NULL,
    is_digital BOOLEAN NOT NULL,
    acquisition_method TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE,
    UNIQUE(game_id, platform_id, is_digital)
);

-- Full-Text Search (FTS5) virtual table for autocomplete/search
CREATE VIRTUAL TABLE IF NOT EXISTS search_idx USING fts5(
    row_id UNINDEXED, -- Reference to original table row ID
    item_type UNINDEXED, -- 'game', 'platform', 'tag'
    name, -- The primary text for display and searching
    context, -- Secondary text like description
    tokenize = 'porter unicode61'
);

-- Triggers to keep the search_idx table in sync with the games table
CREATE TRIGGER IF NOT EXISTS games_after_insert
AFTER INSERT ON games
BEGIN
    INSERT INTO search_idx (row_id, item_type, name, context)
    VALUES (new.id, 'game', new.name,
        new.description || ' ' ||
        IFNULL(new.genre, '') || ' ' ||
        IFNULL(new.developer, '') || ' ' ||
        IFNULL(new.publisher, ''));
END;

CREATE TRIGGER IF NOT EXISTS games_after_delete
AFTER DELETE ON games
BEGIN
    DELETE FROM search_idx WHERE row_id = old.id AND item_type = 'game';
END;

CREATE TRIGGER IF NOT EXISTS games_after_update
AFTER UPDATE ON games
BEGIN
    UPDATE search_idx
    SET name = new.name,
        context = new.description || ' ' ||
        IFNULL(new.genre, '') || ' ' ||
        IFNULL(new.developer, '') || ' ' ||
        IFNULL(new.publisher, '')
    WHERE row_id = new.id AND item_type = 'game';
END;

-- Triggers for platforms table
CREATE TRIGGER IF NOT EXISTS platforms_after_insert
AFTER INSERT ON platforms
BEGIN
    INSERT INTO search_idx (row_id, item_type, name, context)
    VALUES (new.id, 'platform', new.name,
        new.description || ' ' ||
        IFNULL(new.manufacturer, ''));
END;

CREATE TRIGGER IF NOT EXISTS platforms_after_delete
AFTER DELETE ON platforms
BEGIN
    DELETE FROM search_idx WHERE row_id = old.id AND item_type = 'platform';
END;

CREATE TRIGGER IF NOT EXISTS platforms_after_update
AFTER UPDATE ON platforms
BEGIN
    UPDATE search_idx
    SET name = new.name,
        context = new.description || ' ' ||
        IFNULL(new.manufacturer, '')
    WHERE row_id = new.id AND item_type = 'platform';
END;
"""


def _get_conn(db_path: Optional[str] = None):
    """Return a new SQLite connection for the configured DB path.

    We create connections per request to avoid sharing connections across
    threads. Caller is responsible for closing the connection.
    """
    path = db_path or getattr(config, 'DATABASE_FILE', os.path.join('data', 'gamedb.sqlite'))
    # Ensure parent directory exists
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_schema(conn: sqlite3.Connection):
    cur = conn.executescript(DB_SCHEMA)
    conn.commit()


def _game_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    """Converts a sqlite3.Row object for a game into a dictionary."""
    game_dict = dict(row)
    # Ensure 'tags' is a list, parsing from JSON if it's a string.
    if 'tags' in game_dict and isinstance(game_dict['tags'], str):
        try:
            game_dict['tags'] = json.loads(game_dict['tags'])
        except (json.JSONDecodeError, TypeError):
            game_dict['tags'] = []
    elif 'tags' not in game_dict or game_dict['tags'] is None:
        game_dict['tags'] = []
    # Ensure boolean fields are actual booleans
    for key in ['is_derived_work', 'is_sequel']:
        if key in game_dict:
            game_dict[key] = bool(game_dict[key])
    return game_dict


def _platform_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    """Converts a sqlite3.Row object for a platform into a dictionary."""
    platform_dict = dict(row)
    for key in ['supports_digital', 'supports_physical']:
        if key in platform_dict:
            platform_dict[key] = bool(platform_dict[key])
    return platform_dict


def _game_platform_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    """Converts a sqlite3.Row object for a game_platform link into a dictionary."""
    gp_dict = dict(row)
    if 'is_digital' in gp_dict:
        gp_dict['is_digital'] = bool(gp_dict['is_digital'])
    return gp_dict


def _list_games(conn: sqlite3.Connection, qparams: Dict[str, List[str]]):
    cur = conn.cursor()
    if 'id' in qparams and qparams['id']:
        try:
            gid = int(qparams['id'][0])
        except Exception:
            return (400, {'error': 'invalid id'})
        cur.execute('SELECT * FROM games WHERE id = ?', (gid,))
        row = cur.fetchone()
        if not row:
            return (404, {'error': 'not found'})
        game = _game_row_to_dict(row)
        # Include game_platforms for this game
        cur.execute('SELECT * FROM game_platforms WHERE game_id = ? ORDER BY platform_id', (gid,))
        gp_rows = cur.fetchall()
        game_platforms = [_game_platform_row_to_dict(r) for r in gp_rows]
        return {'game': game, 'game_platforms': game_platforms}

    cur.execute('SELECT * FROM games ORDER BY release_year DESC, name COLLATE NOCASE')
    rows = cur.fetchall()
    games = [_game_row_to_dict(r) for r in rows]
    # Include all game_platforms in the response so frontend can perform filtering without extra round-trips
    cur.execute('SELECT * FROM game_platforms ORDER BY created_at, game_id, platform_id')
    gp_rows = cur.fetchall()
    game_platforms = [_game_platform_row_to_dict(r) for r in gp_rows]
    return {'games': games, 'game_platforms': game_platforms}


def _create_game(conn: sqlite3.Connection, data: Dict[str, Any]):
    """Creates a new game record from a dictionary of data."""
    if not data.get('name'):
        return (400, {'error': 'name is required'})

    # Filter data to only include columns that exist in the schema
    fields = []
    params = []
    for col in EDITABLE_GAME_COLUMNS:
        if col in data:
            value = data[col]
            if col == 'tags':
                if not isinstance(value, list): return (400, {'error': 'tags must be a list'})
                params.append(json.dumps(value))
            else:
                params.append(value)
            fields.append(col)

    field_names = ", ".join(fields)
    placeholders = ", ".join(["?"] * len(fields))
    
    cur = conn.cursor()
    cur.execute(f'INSERT INTO games ({field_names}) VALUES ({placeholders})', params)
    conn.commit()
    gid = cur.lastrowid
    cur.execute('SELECT * FROM games WHERE id = ?', (gid,))
    row = cur.fetchone()
    return {'game': _game_row_to_dict(row)}


def _update_game(conn: sqlite3.Connection, gid: int, data: Dict[str, Any]):
    cur = conn.cursor()
    cur.execute('SELECT * FROM games WHERE id = ?', (gid,))
    if not cur.fetchone():
        return (404, {'error': 'not found'})
    # Build update
    fields = []
    params = []
    # Use the centralized list of editable columns
    for k in EDITABLE_GAME_COLUMNS:
        if k in data:
            value = data[k]
            if k == 'tags':
                if not isinstance(value, list): return (400, {'error': 'tags must be a list'})
                params.append(json.dumps(value))
            else:
                params.append(value)
            fields.append(f"{k} = ?")

    if not fields:
        return (400, {'error': 'no fields to update'})
    fields.append('updated_at = CURRENT_TIMESTAMP')
    params.append(gid)
    cur.execute(f'UPDATE games SET {",".join(fields)} WHERE id = ?', params)
    conn.commit()
    cur.execute('SELECT * FROM games WHERE id = ?', (gid,))
    return {'game': _game_row_to_dict(cur.fetchone())}


def _delete_game(conn: sqlite3.Connection, gid: int) -> Dict[str, Any]:
    cur = conn.cursor()
    cur.execute('SELECT 1 FROM games WHERE id = ?', (gid,))
    if not cur.fetchone():
        return (404, {'error': 'not found'})

    # Find platforms this game is on to check for newly-empty platforms later
    cur.execute('SELECT DISTINCT platform_id FROM game_platforms WHERE game_id = ?', (gid,))
    platform_ids_to_check = [row['platform_id'] for row in cur.fetchall()]

    # Delete the game (cascades to game_platforms)
    cur.execute('DELETE FROM games WHERE id = ?', (gid,))

    # Check which of the affected platforms are now empty
    empty_platforms = []
    if platform_ids_to_check:
        for pid in platform_ids_to_check:
            cur.execute('SELECT 1 FROM game_platforms WHERE platform_id = ? LIMIT 1', (pid,))
            if not cur.fetchone():
                empty_platforms.append(pid)

    conn.commit()
    return (200, {'status': 'deleted', 'empty_platforms': empty_platforms})


def _get_orphaned_games_on_platform_deletion(conn: sqlite3.Connection, pid: str) -> List[Dict[str, Any]]:
    """Find games that would have no platforms left if the specified platform is deleted."""
    cur = conn.cursor()
    # Find all games on the platform to be deleted
    cur.execute('SELECT DISTINCT game_id FROM game_platforms WHERE platform_id = ?', (pid,))
    game_ids = [row['game_id'] for row in cur.fetchall()]

    orphans = []
    for gid in game_ids:
        cur.execute('SELECT COUNT(*) FROM game_platforms WHERE game_id = ? AND platform_id != ?', (gid, pid))
        if cur.fetchone()[0] == 0:
            cur.execute('SELECT id, name FROM games WHERE id = ?', (gid,))
            orphans.append(dict(cur.fetchone()))
    return orphans


def _list_platforms(conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute('SELECT * FROM platforms ORDER BY name COLLATE NOCASE')
    rows = cur.fetchall()
    return {'platforms': [_platform_row_to_dict(r) for r in rows]}


def _create_platform(conn: sqlite3.Connection, data: Dict[str, Any]):
    # Basic validation
    if not data.get('name'):
        return (400, {'error': 'name is required'})
    if not data.get('supports_digital') and not data.get('supports_physical'):
        return (400, {'error': 'platform must support at least digital or physical'})
    
    # Generate a simple ID from the name (lowercase, replace spaces with underscores)
    pid = data['name'].lower().replace(' ', '_').replace('-', '_')
    data['id'] = pid

    fields = []
    params = []
    for col in PLATFORM_COLUMNS:
        if col in data:
            fields.append(col)
            params.append(data[col])

    field_names = ", ".join(fields)
    placeholders = ", ".join(["?"] * len(fields))

    cur = conn.cursor()
    try:
        cur.execute(f'INSERT INTO platforms ({field_names}) VALUES ({placeholders})', params)
        conn.commit()
    except sqlite3.IntegrityError:
        return (400, {'error': 'platform already exists'})
    
    cur.execute('SELECT * FROM platforms WHERE id = ?', (pid,))
    row = cur.fetchone()
    return {'platform': _platform_row_to_dict(row)}


def _update_platform(conn: sqlite3.Connection, pid: str, data: Dict[str, Any]):
    cur = conn.cursor()
    cur.execute('SELECT * FROM platforms WHERE id = ?', (pid,))
    if not cur.fetchone():
        return (404, {'error': 'not found'})
    
    # Build update
    fields = []
    params = []
    for k in EDITABLE_PLATFORM_COLUMNS:
        if k in data:
            fields.append(f"{k} = ?")
            params.append(data[k])
    
    if not fields:
        return (400, {'error': 'no fields to update'})
    
    fields.append('updated_at = CURRENT_TIMESTAMP')
    params.append(pid)
    cur.execute(f'UPDATE platforms SET {",".join(fields)} WHERE id = ?', params)
    conn.commit()
    cur.execute('SELECT * FROM platforms WHERE id = ?', (pid,))
    return {'platform': _platform_row_to_dict(cur.fetchone())}


def _delete_platform(conn: sqlite3.Connection, pid: str, qparams: Dict[str, List[str]]):
    cur = conn.cursor()
    cur.execute('SELECT 1 FROM platforms WHERE id = ?', (pid,))
    if not cur.fetchone():
        return (404, {'error': 'not found'})

    force = 'force' in qparams and qparams['force'] and qparams['force'][0].lower() == 'true'

    if not force:
        orphaned_games = _get_orphaned_games_on_platform_deletion(conn, pid)
        if orphaned_games:
            return (409, {'error': 'This would orphan games.', 'orphaned_games': orphaned_games})

    cur.execute('DELETE FROM platforms WHERE id = ?', (pid,))
    conn.commit()

    return (200, {'status': 'deleted'})


def _list_game_platforms(conn: sqlite3.Connection, qparams: Dict[str, List[str]]):
    """List game-platform links, optionally filtered by game_id or platform_id."""
    cur = conn.cursor()
    
    # Support filtering by game_id or platform_id
    if 'game_id' in qparams and qparams['game_id']:
        try:
            gid = int(qparams['game_id'][0])
        except Exception:
            return (400, {'error': 'invalid game_id'})
        cur.execute('SELECT * FROM game_platforms WHERE game_id = ? ORDER BY platform_id', (gid,))
    elif 'platform_id' in qparams and qparams['platform_id']:
        pid = qparams['platform_id'][0]
        cur.execute('SELECT * FROM game_platforms WHERE platform_id = ? ORDER BY game_id', (pid,))
    else:
        cur.execute('SELECT * FROM game_platforms ORDER BY game_id, platform_id')
    
    rows = cur.fetchall()
    return {'game_platforms': [_game_platform_row_to_dict(r) for r in rows]}


def _create_game_platform(conn: sqlite3.Connection, data: Dict[str, Any]):
    """Link a game to a platform with a specific format (digital/physical)."""
    if data.get('game_id') is None or data.get('platform_id') is None or data.get('is_digital') is None:
        return (400, {'error': 'is_digital is required (true for digital, false for physical)'})
    
    is_digital = bool(data['is_digital'])
    
    cur = conn.cursor()
    
    # Verify game exists
    cur.execute('SELECT 1 FROM games WHERE id = ?', (data['game_id'],))
    if not cur.fetchone():
        return (404, {'error': 'game not found'})
    
    # Verify platform exists
    cur.execute('SELECT supports_digital, supports_physical FROM platforms WHERE id = ?', (data['platform_id'],))
    platform = cur.fetchone()
    if not platform:
        return (404, {'error': 'platform not found'})
    
    # Validate that platform supports the requested format
    if is_digital and not platform['supports_digital']:
        return (400, {'error': f'platform {data["platform_id"]} does not support digital distribution'})
    if not is_digital and not platform['supports_physical']:
        return (400, {'error': f'platform {data["platform_id"]} does not support physical distribution'})
    
    fields = []
    params = []
    for col in GAME_PLATFORM_COLUMNS:
        if col in data:
            fields.append(col)
            params.append(data[col])

    field_names = ", ".join(fields)
    placeholders = ", ".join(["?"] * len(fields))

    try:
        cur.execute(f'INSERT INTO game_platforms ({field_names}) VALUES ({placeholders})', params)
        conn.commit()
    except sqlite3.IntegrityError:
        return (400, {'error': 'this game-platform-format combination already exists'})
    
    gp_id = cur.lastrowid
    cur.execute('SELECT * FROM game_platforms WHERE id = ?', (gp_id,))
    row = cur.fetchone()
    return {'game_platform': _game_platform_row_to_dict(row)}


def _update_game_platform(conn: sqlite3.Connection, gp_id: int, data: Dict[str, Any]):
    """Update a game-platform link."""
    cur = conn.cursor()
    cur.execute('SELECT * FROM game_platforms WHERE id = ?', (gp_id,))
    if not cur.fetchone():
        return (404, {'error': 'not found'})
    
    fields = []
    params = []
    for k in EDITABLE_GAME_PLATFORM_COLUMNS:
        if k in data:
            fields.append(f"{k} = ?")
            params.append(data[k])
    
    if not fields:
        return (400, {'error': 'no fields to update'})
    
    fields.append('updated_at = CURRENT_TIMESTAMP')
    params.append(gp_id)
    cur.execute(f'UPDATE game_platforms SET {",".join(fields)} WHERE id = ?', params)
    conn.commit()
    cur.execute('SELECT * FROM game_platforms WHERE id = ?', (gp_id,))
    return {'game_platform': _game_platform_row_to_dict(cur.fetchone())}


def _delete_game_platform(conn: sqlite3.Connection, gp_id: int):
    """Remove a game-platform link."""
    cur = conn.cursor()
    cur.execute('SELECT 1 FROM game_platforms WHERE id = ?', (gp_id,))
    if not cur.fetchone():
        return (404, {'error': 'not found'})
    cur.execute('DELETE FROM game_platforms WHERE id = ?', (gp_id,))
    conn.commit()
    return (200, {'status': 'deleted'})


def _autocomplete(conn: sqlite3.Connection, qparams: Dict[str, List[str]], limit: int = 10):
    """
    Perform a multi-stage search for autocomplete suggestions.
    
    Strategy:
    1. Exact/Prefix matches via FTS5 (fast, handles word-based matches)
    2. Word-based fuzzy matches via FTS5 (handles typos in individual words)
    3. Character-level fuzzy matches via difflib (handles typos like "Eldn" -> "Elden")
    
    This approach balances speed (FTS5 is fast) with accuracy (difflib handles typos).
    """
    print(f"\n--- _autocomplete called with query: '{qparams.get('q')}' ---")
    query = (qparams.get('q') or [''])[0].strip()
    if not query:
        return {'suggestions': []}

    normalized_query = _normalize_name(query)
    query_words = normalized_query.split()
    
    # --- Stage 1: Exact and Prefix Matches ---
    exact_search_term = f'{query}*'
    print(f"Stage 1: FTS5 exact/prefix search for '{exact_search_term}'")
    cur = conn.cursor()
    cur.execute("""
        SELECT row_id, item_type, name, context, rank
        FROM search_idx
        WHERE search_idx MATCH ?
        ORDER BY rank
        LIMIT ?
    """, (exact_search_term, limit * 2))  # Get more to filter later
    stage1_rows = cur.fetchall()
    print(f"Stage 1: FTS5 query executed. Found {len(stage1_rows)} raw results (before filtering/dedup).")

    suggestions = []
    seen_ids = set()
    for row in stage1_rows:
        suggestion_id = f"{row['item_type']}-{row['row_id']}"
        if suggestion_id in seen_ids:
            continue
        seen_ids.add(suggestion_id)
        suggestions.append({
            'id': row['row_id'],
            'type': row['item_type'],
            'name': row['name'],
            'context': row['context'],
            'match_type': 'fts_exact_prefix',
            'score': 1.0  # Exact matches get highest score
        })
    print(f"Stage 1: Added {len(suggestions)} unique exact/prefix suggestions.")

    # --- Stage 2: Word-based Fuzzy Matches via FTS5 ---
    # Only proceed if we have no good matches from Stage 1.
    # If the query is short (e.g., < 3 chars), we should always try to find more results.
    # If the query is longer and we found exact prefixes, we can stop early.
    if len(suggestions) < limit : # and (len(suggestions) == 0 or len(query) < 3)
        print(f"Stage 2: Not enough suggestions from Stage 1 ({len(suggestions)}/{limit}). Proceeding with FTS5 word-based fuzzy search.")
        or_terms = ' OR '.join(query_words)
        fuzzy_term = f"({or_terms}) OR \"{query}*\""
        
        cur.execute("""
            SELECT row_id, item_type, name, context, rank
            FROM search_idx
            WHERE search_idx MATCH ?
            ORDER BY rank
            LIMIT ?
        """, (fuzzy_term, limit * 3))
        stage2_rows = cur.fetchall()
        print(f"Stage 2: FTS5 query executed for '{fuzzy_term}'. Found {len(stage2_rows)} raw results (before filtering/dedup).")

        for row in stage2_rows:
            suggestion_id = f"{row['item_type']}-{row['row_id']}"
            if suggestion_id not in seen_ids:
                seen_ids.add(suggestion_id)
                suggestions.append({
                    'id': row['row_id'],
                    'type': row['item_type'],
                    'name': row['name'],
                    'context': row['context'],
                    'match_type': 'fts_word_fuzzy',
                    'score': 0.8  # Word-based fuzzy is good but not exact
                })
        print(f"Stage 2: Total unique suggestions after Stage 2: {len(suggestions)}.")

    # --- Stage 3: Character-level Fuzzy Matches ---
    # Only compute expensive fuzzy matching if we still need more results
    if len(suggestions) < limit : # and (len(suggestions) == 0 or len(query) < 3) 
        print(f"Stage 3: Not enough suggestions from previous stages ({len(suggestions)}/{limit}). Proceeding with character-level fuzzy matching (difflib).")
        # Fetch all games and platforms to do character-level fuzzy matching
        cur.execute("""
            SELECT row_id, item_type, name, context
            FROM search_idx
            WHERE item_type IN ('game', 'platform')
        """)
        
        fuzzy_candidates = []
        for row in cur.fetchall():
            suggestion_id = f"{row['item_type']}-{row['row_id']}"
            if suggestion_id in seen_ids:
                continue
            
            # print(f"  Processing candidate: '{row['name']}' (type: {row['item_type']}, id: {row['row_id']})")
            normalized_name = _normalize_name(row['name'])
            target_words = normalized_name.split()
            
            # --- Calculate best score using different fuzzy strategies ---
            # Strategy A: Character-level fuzzy match on the full name (handles "Eldenring" -> "Elden Ring")
            # By removing spaces from both query and target, this handles cases where a user
            # query like "eldenring" should match "Elden Ring". It also helps with short
            # queries like "eldn" which would otherwise have a very low ratio against "elden ring".
            query_compact = normalized_query.replace(' ', '')
            target_compact = normalized_name.replace(' ', '')
            # print(f"    Strategy A (char_score): query_compact='{query_compact}', target_compact='{target_compact}'")
            char_score = _fuzzy_match_score(query_compact, target_compact, threshold=0.6)
            # print(f"    Strategy A result: char_score={char_score}")
            
            # Strategy B: Word-level fuzzy match (handles "Eldn rign" -> "Elden Ring")
            # print(f"    Strategy B (word_score): query_words={query_words}, normalized_name='{normalized_name}'")
            word_score = _fuzzy_match_words(query_words, normalized_name, threshold=0.6)
            # print(f"    Strategy B result: word_score={word_score}")
            
            # Strategy C (for single-word queries): Match against individual target words (handles "Eldn" -> "Elden" in "Elden Ring")
            single_word_best_score = None
            if len(query_words) == 1:
                # print(f"    Strategy C (single_word_best_score): query_word='{query_words[0]}', target_words={target_words}")
                scores = [_fuzzy_match_score(query_words[0], tword, threshold=0.6) for tword in target_words]
                valid_scores = [s for s in scores if s is not None]
                if valid_scores:
                    single_word_best_score = max(valid_scores)
                # print(f"    Strategy C result: single_word_best_score={single_word_best_score}")

            # --- Use the highest score from all successful strategies ---
            all_scores = [s for s in [char_score, word_score, single_word_best_score] if s is not None]
            # print(f"    All valid scores for '{row['name']}': {all_scores}")
            best_score = max(all_scores) if all_scores else None

            if best_score is not None:
                fuzzy_candidates.append({
                    'id': row['row_id'],
                    'type': row['item_type'],
                    'name': row['name'],
                    'context': row['context'],
                    'match_type': 'char_fuzzy',
                    'score': round(best_score, 2) # Round for cleaner debug output
                })
                # print(f"    Candidate '{row['name']}' added with score: {best_score}")
            # else:
                # print(f"    Candidate '{row['name']}' did not meet any fuzzy threshold.")
      
        
        # Sort by score descending and add to suggestions
        fuzzy_candidates.sort(key=lambda x: x['score'], reverse=True)
        print(f"Stage 3: Sorted {len(fuzzy_candidates)} fuzzy candidates.")
        for candidate in fuzzy_candidates:
            if len(suggestions) >= limit:
                break
            suggestions.append(candidate)

    # Trim to limit and return
    print(f"--- _autocomplete returning {len(suggestions[:limit])} suggestions. ---")
    return {'suggestions': suggestions[:limit]}

def _normalize_name(name: str) -> str:
    """
    Normalizes a name for searching, mirroring the frontend logic.
    - Converts to lowercase.
    - Removes leading articles.
    - Replaces punctuation with spaces and collapses whitespace.
    """
    if not name:
        return ''
    name = name.lower().strip()
    name = re.sub(r"^(a|an|the|le|la|l')\s+", '', name)
    name = re.sub(r'[^\w\s]', ' ', name) # Replace punctuation with space
    name = re.sub(r'\s+', ' ', name).strip() # Collapse whitespace
    return name


def _fuzzy_match_score(query: str, target: str, threshold: float = 0.6) -> Optional[float]:
    """
    Compute a fuzzy match score using difflib.SequenceMatcher.ratio().

    The ratio is a measure of the sequences' similarity, calculated as
    2.0 * M / T, where T is the total number of elements in both sequences,
    and M is the number of matches. This is effective for typos.

    Returns a score between 0 and 1 if >= threshold, else None.
    
    Args:
        query: The user's search term (normalized).
        target: The game/platform name (normalized).
        threshold: Minimum score to consider a match (0.0-1.0).
    
    Returns:
        Match score (0-1) if >= threshold, else None.
    """
    # print(f"  _fuzzy_match_score: query='{query}', target='{target}', threshold={threshold}")
    if not query or not target:
        # print("  _fuzzy_match_score: Empty query or target, returning None.")
        return None
    
    matcher = difflib.SequenceMatcher(None, query, target)
    ratio = matcher.ratio()
    # print(f"  _fuzzy_match_score: Calculated ratio={ratio:.2f}. Meets threshold ({threshold})? {ratio >= threshold}")
    return ratio if ratio >= threshold else None


def _fuzzy_match_words(query_words: List[str], target: str, threshold: float = 0.6) -> Optional[float]:
    """
    Try to match query words (with typos) against target words.
    
    For each query word, find the best match in target words.
    Return average score if all query words match, else None.
    
    This handles cases like "Eldn rign" -> "Elden Ring" by matching
    each word individually with fuzzy matching.
    
    Args:
        query_words: List of normalized query words
        target: The full target string (normalized)
        threshold: Minimum score per word
    
    Returns:
        Average match score if all words match, else None
    """
    # print(f"  _fuzzy_match_words: query_words={query_words}, target='{target}', threshold={threshold}")
    if not query_words or not target:
        # print("  _fuzzy_match_words: Empty query_words or target, returning None.")
        return None
    
    target_words = target.split()
    scores = []
    
    for qword in query_words:
        # print(f"    _fuzzy_match_words: Matching query word '{qword}' against target words {target_words}")
        best_score = None
        for tword in target_words:
            score = _fuzzy_match_score(qword, tword, threshold=0.5)  # Lower threshold for individual words
            if score and (best_score is None or score > best_score):
                best_score = score
        # print(f"    _fuzzy_match_words: Best score for '{qword}': {best_score}")
        
        if best_score is None:
            return None  # One query word didn't match any target word
        scores.append(best_score)
    
    # Return average score of all matched words
    return sum(scores) / len(scores) if scores else None


def _bulk_operations(conn: sqlite3.Connection, data: Dict[str, Any]):
    """
    Handle bulk operations like mass delete, assign/remove platform.
    """
    action = data.get('action')
    item_type = data.get('item_type')
    ids = data.get('ids', [])
    params = data.get('params', {})

    if not all([action, item_type, ids]):
        return (400, {'error': 'action, item_type, and ids are required.'})

    cur = conn.cursor()
    processed_count = 0

    try:
        if action == 'delete':
            if item_type == 'game':
                placeholders = ','.join('?' for _ in ids)
                cur.execute(f'DELETE FROM games WHERE id IN ({placeholders})', ids)
                processed_count = cur.rowcount
            elif item_type == 'platform':
                # Note: This is a force delete, ignoring orphan checks for simplicity in bulk mode.
                placeholders = ','.join('?' for _ in ids)
                cur.execute(f'DELETE FROM platforms WHERE id IN ({placeholders})', ids)
                processed_count = cur.rowcount
            else:
                return (400, {'error': f'Unsupported item_type for delete: {item_type}'})

        elif action == 'assign_platform':
            if item_type != 'game':
                return (400, {'error': 'assign_platform is only for games.'})
            platform_id = params.get('platform_id')
            if not platform_id:
                return (400, {'error': 'platform_id is required for assign_platform.'})

            # For simplicity, we insert one by one, ignoring duplicates.
            # A more optimized version could use INSERT OR IGNORE with a subquery.
            for game_id in ids:
                try:
                    # Assuming digital=true, acquisition=bulk_assign
                    cur.execute('INSERT INTO game_platforms (game_id, platform_id, is_digital, acquisition_method) VALUES (?, ?, ?, ?)',
                                (game_id, platform_id, True, 'bulk_assign'))
                    processed_count += 1
                except sqlite3.IntegrityError:
                    # Ignore if the link already exists
                    pass

        elif action == 'remove_platform':
            if item_type != 'game':
                return (400, {'error': 'remove_platform is only for games.'})
            platform_id = params.get('platform_id')
            if not platform_id:
                return (400, {'error': 'platform_id is required for remove_platform.'})

            placeholders = ','.join('?' for _ in ids)
            cur.execute(f'DELETE FROM game_platforms WHERE platform_id = ? AND game_id IN ({placeholders})', [platform_id] + ids)
            processed_count = cur.rowcount

        elif action == 'edit_fields':
            if item_type != 'game':
                return (400, {'error': 'edit_fields is only for games.'})
            
            fields_to_update = []
            values_to_update = []
            
            # Iterate over editable columns and add them to the update query if present in params
            for col in EDITABLE_GAME_COLUMNS:
                if col in params:
                    fields_to_update.append(f"{col} = ?")
                    value = params[col]
                    # Special handling for tags, which should be JSON
                    if col == 'tags' and isinstance(value, list):
                        values_to_update.append(json.dumps(value))
                    else:
                        values_to_update.append(value)
            
            if not fields_to_update:
                return (400, {'error': 'No valid fields provided for update.'})

            placeholders = ','.join('?' for _ in ids)
            cur.execute(f'UPDATE games SET {", ".join(fields_to_update)} WHERE id IN ({placeholders})', values_to_update + ids)
            processed_count = cur.rowcount
        else:
            return (400, {'error': f'Unknown bulk action: {action}'})

        conn.commit()
        return (200, {'status': 'ok', 'message': f'Successfully processed {processed_count} of {len(ids)} items.'})

    except Exception as e:
        conn.rollback()
        return (500, {'error': f'An error occurred: {str(e)}'})

def handle(req: Dict[str, Any]):
    """Main plugin entrypoint. Routes requests to the appropriate helpers.

    Returns either a `dict` (200 JSON) or a tuple `(status, body)`.
    """
    parsed = req
    print(f"\n--- handle called. Method: {parsed.get('method')}, Subpath: {parsed.get('subpath')}, Query: {parsed.get('query')} ---")
    subpath = parsed.get('subpath', '') or ''
    sp = subpath.lstrip('/')

    # Connect to DB and ensure schema
    conn = _get_conn()
    try:
        _ensure_schema(conn)

        # Resource routing: accept /games and /platforms and their subpaths
        if sp.startswith('games'):
            # Possible forms: /games, /games/<id>
            parts = sp.split('/') if sp else []
            method = parsed.get('method', 'GET')
            if method == 'GET' and len(parts) <= 2:
                return _list_games(conn, parsed.get('query', {}))
            if method == 'POST' and (len(parts) == 1 or parts == ['games']):
                body = parsed.get('json')
                if body is None:
                    return (400, {'error': 'invalid or missing JSON body'})
                return _create_game(conn, body)
            if method in ('PUT', 'PATCH') and len(parts) >= 2:
                try:
                    gid = int(parts[1])
                except Exception:
                    return (400, {'error': 'invalid id'})
                body = parsed.get('json')
                if body is None:
                    return (400, {'error': 'invalid or missing JSON body'})
                return _update_game(conn, gid, body)
            if method == 'DELETE' and len(parts) >= 2:
                try:
                    gid = int(parts[1]) # No query params needed for game deletion
                except Exception:
                    return (400, {'error': 'invalid id'})
                return _delete_game(conn, gid)

            return (405, {'error': 'method not allowed'})

        if sp.startswith('platforms'):
            # Possible forms: /platforms, /platforms/<id>
            parts = sp.split('/') if sp else []
            method = parsed.get('method', 'GET')
            if method == 'GET':
                return _list_platforms(conn)
            if method == 'POST' and (len(parts) == 1 or parts == ['platforms']):
                body = parsed.get('json')
                if body is None:
                    return (400, {'error': 'invalid or missing JSON body'})
                return _create_platform(conn, body)
            if method in ('PUT', 'PATCH') and len(parts) >= 2:
                pid = parts[1]
                body = parsed.get('json')
                if body is None:
                    return (400, {'error': 'invalid or missing JSON body'})
                return _update_platform(conn, pid, body)
            if method == 'DELETE' and len(parts) >= 2:
                pid = parts[1]
                return _delete_platform(conn, pid, parsed.get('query', {}))
            
            return (405, {'error': 'method not allowed'})

        if sp.startswith('game_platforms'):
            # Possible forms: /game_platforms, /game_platforms/<id>
            parts = sp.split('/') if sp else []
            method = parsed.get('method', 'GET')
            if method == 'GET':
                return _list_game_platforms(conn, parsed.get('query', {}))
            if method == 'POST' and (len(parts) == 1 or parts == ['game_platforms']):
                body = parsed.get('json')
                if body is None:
                    return (400, {'error': 'invalid or missing JSON body'})
                return _create_game_platform(conn, body)
            if method in ('PUT', 'PATCH') and len(parts) >= 2:
                try:
                    gp_id = int(parts[1])
                except Exception:
                    return (400, {'error': 'invalid id'})
                body = parsed.get('json')
                if body is None:
                    return (400, {'error': 'invalid or missing JSON body'})
                return _update_game_platform(conn, gp_id, body)
            if method == 'DELETE' and len(parts) >= 2:
                try:
                    gp_id = int(parts[1])
                except Exception:
                    return (400, {'error': 'invalid id'})
                return _delete_game_platform(conn, gp_id)
            
            return (405, {'error': 'method not allowed'})

        if sp.startswith('autocomplete'):
            method = parsed.get('method', 'GET')
            if method == 'GET':
                return _autocomplete(conn, parsed.get('query', {}), limit=10)
            return (405, {'error': 'method not allowed'})

        if sp.startswith('schema'):
            method = parsed.get('method', 'GET')
            if method == 'GET':
                return {
                    'game_columns': IMPORT_GAME_COLUMNS,
                    'platform_columns': EDITABLE_PLATFORM_COLUMNS,
                    'game_platform_columns': IMPORT_GAME_PLATFORM_COLUMNS
                }
            return (405, {'error': 'method not allowed'})

        if sp.startswith('bulk'):
            method = parsed.get('method', 'GET')
            if method == 'POST':
                body = parsed.get('json')
                if body is None: return (400, {'error': 'invalid or missing JSON body'})
                return _bulk_operations(conn, body)
            return (405, {'error': 'method not allowed'})
        
        if sp.startswith('bulk_edit_games'):
            method = parsed.get('method', 'POST')
            if method == 'POST':
                body = parsed.get('json')
                if body is None: return (400, {'error': 'invalid or missing JSON body'})
                return _bulk_operations(conn, body) # Reuse the same handler
            return (405, {'error': 'method not allowed'})

        return (404, {'error': 'unknown resource'})
    finally:
        conn.close()
