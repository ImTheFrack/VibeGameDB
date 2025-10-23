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
    'is_derived_work', 'is_sequel', 'related_game_id'
]

# Define which columns are user-editable via the standard form.
# This prevents accidental updates to protected fields like 'id' or 'created_at'.
EDITABLE_GAME_COLUMNS = GAME_COLUMNS + ['tags']

PLATFORM_COLUMNS = [
    'id', 'name', 'supports_digital', 'supports_physical', 'icon_url',
    'image_url', 'description', 'year_acquired'
]
EDITABLE_PLATFORM_COLUMNS = [col for col in PLATFORM_COLUMNS if col != 'id']

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
    VALUES (new.id, 'game', new.name, new.description);
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
    SET name = new.name, context = new.description
    WHERE row_id = new.id AND item_type = 'game';
END;

-- Triggers for platforms table
CREATE TRIGGER IF NOT EXISTS platforms_after_insert
AFTER INSERT ON platforms
BEGIN
    INSERT INTO search_idx (row_id, item_type, name, context)
    VALUES (new.id, 'platform', new.name, new.description);
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
    SET name = new.name, context = new.description
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

def _autocomplete(conn: sqlite3.Connection, qparams: Dict[str, List[str]]):
    """Perform a full-text search for autocomplete suggestions."""
    query = (qparams.get('q') or [''])[0].strip()
    if not query:
        return {'suggestions': []}

    # Align with frontend filter logic: "exact phrase" vs. word1 AND word2
    normalized_query = _normalize_name(query)
    search_term = ''
    # Check for an exact phrase query (starts with a quote)
    if query.startswith('"'):
        # Strip leading quote and any trailing quote to handle in-progress typing
        phrase = query.strip('"').strip()
        # FTS5 phrase search syntax uses double quotes. A wildcard is added for prefix matching on the phrase.
        if phrase:
            search_term = f'"{phrase}"*'
    else:
        # Default FTS5 behavior is AND for space-separated terms.
        # We add a wildcard to the last term for prefix matching.
        # e.g., "elden ri" becomes "elden ri*" which FTS5 treats as "elden AND ri*".
        search_term = f'{normalized_query}*'

    if not search_term.replace('*', ''):
        return {'suggestions': []}

    cur = conn.cursor()
    
    # Query the FTS index, ranking results.
    # We also fetch distinct tags separately.
    cur.execute("""
        SELECT row_id, item_type, name, context, rank
        FROM search_idx
        WHERE search_idx MATCH ?
        ORDER BY rank
        LIMIT 10
    """, (search_term,))
    
    suggestions = []
    for row in cur.fetchall():
        suggestions.append({
            'id': row['row_id'],
            'type': row['item_type'],
            'name': row['name'],
            'context': row['context']
        })

    return {'suggestions': suggestions}


def handle(req: Dict[str, Any]):
    """Main plugin entrypoint. Routes requests to the appropriate helpers.

    Returns either a `dict` (200 JSON) or a tuple `(status, body)`.
    """
    parsed = req
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
            if method == 'GET':
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
                return _autocomplete(conn, parsed.get('query', {}))
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

        return (404, {'error': 'unknown resource'})
    finally:
        conn.close()
