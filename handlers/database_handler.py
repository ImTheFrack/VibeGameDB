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

try:
    import config
except Exception:
    # If config is missing, fall back to sensible defaults
    class _C:
        DATABASE_FILE = os.path.join('data', 'gamedb.sqlite')
        APP_TITLE = 'My Game Library'
    config = _C()


DB_SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    trailer_url TEXT,
    is_remake BOOLEAN DEFAULT 0,
    is_remaster BOOLEAN DEFAULT 0,
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
    # Normalize tags to always be a list (defensive: handle legacy string storage)
    raw_tags = row['tags']
    tags = []
    if raw_tags:
        try:
            parsed = json.loads(raw_tags) if isinstance(raw_tags, str) else raw_tags
            if isinstance(parsed, list):
                tags = parsed
            elif isinstance(parsed, str):
                # Single string stored; wrap in list for frontend convenience
                tags = [parsed]
            else:
                # Unexpected type; fallback to empty list
                tags = []
        except Exception:
            # Malformed JSON, fallback to empty list
            tags = []

    return {
        'id': row['id'],
        'name': row['name'],
        'description': row['description'],
        'cover_image_url': row['cover_image_url'],
        'trailer_url': row['trailer_url'],
        'is_remake': bool(row['is_remake']),
        'is_remaster': bool(row['is_remaster']),
        'related_game_id': row['related_game_id'],
        'tags': tags,
        'created_at': row['created_at'],
        'updated_at': row['updated_at']
    }


def _platform_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'name': row['name'],
        'supports_digital': bool(row['supports_digital']),
        'supports_physical': bool(row['supports_physical']),
        'icon_url': row['icon_url'],
        'image_url': row['image_url'],
        'description': row['description'],
        'year_acquired': row['year_acquired'],
        'created_at': row['created_at'],
        'updated_at': row['updated_at']
    }


def _game_platform_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'game_id': row['game_id'],
        'platform_id': row['platform_id'],
        'is_digital': bool(row['is_digital']),
        'acquisition_method': row['acquisition_method'],
        'created_at': row['created_at'],
        'updated_at': row['updated_at']
    }


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

    cur.execute('SELECT * FROM games ORDER BY name COLLATE NOCASE')
    rows = cur.fetchall()
    games = [_game_row_to_dict(r) for r in rows]
    # Include all game_platforms in the response so frontend can perform filtering without extra round-trips
    cur.execute('SELECT * FROM game_platforms ORDER BY game_id, platform_id')
    gp_rows = cur.fetchall()
    game_platforms = [_game_platform_row_to_dict(r) for r in gp_rows]
    return {'games': games, 'game_platforms': game_platforms}


def _create_game(conn: sqlite3.Connection, data: Dict[str, Any]):
    # Basic validation
    name = data.get('name')
    if not name:
        return (400, {'error': 'name is required'})
    description = data.get('description')
    cover = data.get('cover_image_url')
    trailer = data.get('trailer_url')
    is_remake = bool(data.get('is_remake', False))
    is_remaster = bool(data.get('is_remaster', False))
    related_game_id = data.get('related_game_id')
    tags = data.get('tags') or []
    if not isinstance(tags, list):
        return (400, {'error': 'tags must be a list'})
    
    cur = conn.cursor()
    cur.execute(
        'INSERT INTO games (name, description, cover_image_url, trailer_url, is_remake, is_remaster, related_game_id, tags) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        (name, description, cover, trailer, is_remake, is_remaster, related_game_id, json.dumps(tags))
    )
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
    for k in ('name', 'description', 'cover_image_url', 'trailer_url', 'is_remake', 'is_remaster', 'related_game_id'):
        if k in data:
            fields.append(f"{k} = ?")
            params.append(data[k])
    if 'tags' in data:
        if not isinstance(data['tags'], list):
            return (400, {'error': 'tags must be a list'})
        fields.append('tags = ?')
        params.append(json.dumps(data['tags']))
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
    name = data.get('name')
    if not name:
        return (400, {'error': 'name is required'})
    supports_digital = bool(data.get('supports_digital', True))
    supports_physical = bool(data.get('supports_physical', False))
    
    if not supports_digital and not supports_physical:
        return (400, {'error': 'platform must support at least digital or physical'})
    
    description = data.get('description')
    icon_url = data.get('icon_url')
    image_url = data.get('image_url')
    year_acquired = data.get('year_acquired')
    
    # Generate a simple ID from the name (lowercase, replace spaces with underscores)
    pid = name.lower().replace(' ', '_').replace('-', '_')
    
    cur = conn.cursor()
    try:
        cur.execute(
            'INSERT INTO platforms (id, name, supports_digital, supports_physical, icon_url, image_url, description, year_acquired) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            (pid, name, supports_digital, supports_physical, icon_url, image_url, description, year_acquired)
        )
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
    for k in ('name', 'supports_digital', 'supports_physical', 'icon_url', 'image_url', 'description', 'year_acquired'):
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
    game_id = data.get('game_id')
    platform_id = data.get('platform_id')
    is_digital = data.get('is_digital')
    acquisition_method = data.get('acquisition_method')
    
    if game_id is None:
        return (400, {'error': 'game_id is required'})
    if platform_id is None:
        return (400, {'error': 'platform_id is required'})
    if is_digital is None:
        return (400, {'error': 'is_digital is required (true for digital, false for physical)'})
    
    is_digital = bool(is_digital)
    
    cur = conn.cursor()
    
    # Verify game exists
    cur.execute('SELECT 1 FROM games WHERE id = ?', (game_id,))
    if not cur.fetchone():
        return (404, {'error': 'game not found'})
    
    # Verify platform exists
    cur.execute('SELECT supports_digital, supports_physical FROM platforms WHERE id = ?', (platform_id,))
    platform = cur.fetchone()
    if not platform:
        return (404, {'error': 'platform not found'})
    
    # Validate that platform supports the requested format
    if is_digital and not platform['supports_digital']:
        return (400, {'error': f'platform {platform_id} does not support digital distribution'})
    if not is_digital and not platform['supports_physical']:
        return (400, {'error': f'platform {platform_id} does not support physical distribution'})
    
    try:
        cur.execute(
            'INSERT INTO game_platforms (game_id, platform_id, is_digital, acquisition_method) VALUES (?, ?, ?, ?)',
            (game_id, platform_id, is_digital, acquisition_method)
        )
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
    for k in ('acquisition_method',):
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

        return (404, {'error': 'unknown resource'})
    finally:
        conn.close()
