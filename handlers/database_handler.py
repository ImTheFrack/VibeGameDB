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
    platforms TEXT -- JSON array of platform ids/names
);

CREATE TABLE IF NOT EXISTS platforms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    icon_url TEXT
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
    return {
        'id': row['id'],
        'name': row['name'],
        'description': row['description'],
        'cover_image_url': row['cover_image_url'],
        'trailer_url': row['trailer_url'],
        'platforms': json.loads(row['platforms']) if row['platforms'] else []
    }


def _platform_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'name': row['name'],
        'type': row['type'],
        'icon_url': row['icon_url']
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
        return {'game': _game_row_to_dict(row)}

    cur.execute('SELECT * FROM games ORDER BY name COLLATE NOCASE')
    rows = cur.fetchall()
    return {'games': [_game_row_to_dict(r) for r in rows]}


def _create_game(conn: sqlite3.Connection, data: Dict[str, Any]):
    # Basic validation
    name = data.get('name')
    if not name:
        return (400, {'error': 'name is required'})
    description = data.get('description')
    cover = data.get('cover_image_url')
    trailer = data.get('trailer_url')
    platforms = data.get('platforms') or []
    if not isinstance(platforms, list):
        return (400, {'error': 'platforms must be a list'})
    cur = conn.cursor()
    cur.execute('INSERT INTO games (name,description,cover_image_url,trailer_url,platforms) VALUES (?,?,?,?,?)',
                (name, description, cover, trailer, json.dumps(platforms)))
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
    for k in ('name', 'description', 'cover_image_url', 'trailer_url'):
        if k in data:
            fields.append(f"{k} = ?")
            params.append(data[k])
    if 'platforms' in data:
        if not isinstance(data['platforms'], list):
            return (400, {'error': 'platforms must be a list'})
        fields.append('platforms = ?')
        params.append(json.dumps(data['platforms']))
    if not fields:
        return (400, {'error': 'no fields to update'})
    params.append(gid)
    cur.execute(f'UPDATE games SET {",".join(fields)} WHERE id = ?', params)
    conn.commit()
    cur.execute('SELECT * FROM games WHERE id = ?', (gid,))
    return {'game': _game_row_to_dict(cur.fetchone())}


def _delete_game(conn: sqlite3.Connection, gid: int):
    cur = conn.cursor()
    cur.execute('SELECT 1 FROM games WHERE id = ?', (gid,))
    if not cur.fetchone():
        return (404, {'error': 'not found'})
    cur.execute('DELETE FROM games WHERE id = ?', (gid,))
    conn.commit()
    return (200, {'status': 'deleted'})


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
    platform_type = data.get('type', 'Digital')
    description = data.get('description')
    icon_url = data.get('icon_url')
    
    # Generate a simple ID from the name (lowercase, replace spaces with underscores)
    pid = name.lower().replace(' ', '_').replace('-', '_')
    
    cur = conn.cursor()
    try:
        cur.execute('INSERT INTO platforms (id, name, type, icon_url) VALUES (?, ?, ?, ?)',
                    (pid, name, platform_type, icon_url))
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
    for k in ('name', 'type', 'icon_url'):
        if k in data:
            fields.append(f"{k} = ?")
            params.append(data[k])
    
    if not fields:
        return (400, {'error': 'no fields to update'})
    
    params.append(pid)
    cur.execute(f'UPDATE platforms SET {",".join(fields)} WHERE id = ?', params)
    conn.commit()
    cur.execute('SELECT * FROM platforms WHERE id = ?', (pid,))
    return {'platform': _platform_row_to_dict(cur.fetchone())}


def _delete_platform(conn: sqlite3.Connection, pid: str):
    cur = conn.cursor()
    cur.execute('SELECT 1 FROM platforms WHERE id = ?', (pid,))
    if not cur.fetchone():
        return (404, {'error': 'not found'})
    cur.execute('DELETE FROM platforms WHERE id = ?', (pid,))
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
                    gid = int(parts[1])
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
                return _delete_platform(conn, pid)
            
            return (405, {'error': 'method not allowed'})

        return (404, {'error': 'unknown resource'})
    finally:
        conn.close()
