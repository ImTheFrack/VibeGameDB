"""
Database seeding handler for initial test data.

This module provides a simple endpoint to seed the database with humorous test data
if it's empty. Useful for development and testing without manual data entry.
"""

from typing import Dict, Any
import sqlite3
import json
import os

try:
    import config
except Exception:
    class _C:
        DATABASE_FILE = os.path.join('data', 'gamedb.sqlite')
    config = _C()

# Import the single source of truth for the game schema
try:
    from .database_handler import GAME_COLUMNS, PLATFORM_COLUMNS, GAME_PLATFORM_COLUMNS
except ImportError:
    GAME_COLUMNS = ['name', 'description', 'cover_image_url', 'trailer_url', 'is_derived_work', 'is_sequel', 'related_game_id', 'tags']
    PLATFORM_COLUMNS = ['id', 'name', 'supports_digital', 'supports_physical', 'icon_url', 'description']
    GAME_PLATFORM_COLUMNS = ['game_id', 'platform_id', 'is_digital', 'acquisition_method']

def _get_conn(db_path: str = None):
    """Return a new SQLite connection for the configured DB path."""
    path = db_path or getattr(config, 'DATABASE_FILE', os.path.join('data', 'gamedb.sqlite'))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _is_database_empty(conn: sqlite3.Connection) -> bool:
    """Check if the database has any games or platforms."""
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) as count FROM games')
    game_count = cur.fetchone()['count']
    cur.execute('SELECT COUNT(*) as count FROM platforms')
    platform_count = cur.fetchone()['count']
    return game_count == 0 and platform_count == 0


def _seed_database(conn: sqlite3.Connection) -> Dict[str, Any]:
    """Seed the database with humorous test data."""
    cur = conn.cursor()
    
    # Create test platform
    platform_data = {
        'id': 'testplatform',
        'name': 'TestPlatform',
        'supports_digital': True,
        'supports_physical': False,
        'icon_url': '/img/icon_placeholder.svg',
        'description': 'A mysterious platform that exists only in the realm of testing. Legend has it that it runs on pure imagination and caffeine.',
        'year_acquired': 2024
    }
    
    p_fields, p_params = [], []
    for col in PLATFORM_COLUMNS:
        if col in platform_data:
            p_fields.append(col)
            p_params.append(platform_data[col])
    p_field_names = ", ".join(p_fields)
    p_placeholders = ", ".join(["?"] * len(p_fields))
    
    cur.execute(f'INSERT INTO platforms ({p_field_names}) VALUES ({p_placeholders})', p_params)
    
    # Create test game
    game_data = {
        'name': 'TestGame',
        'description': 'A legendary game that exists only in test databases. Rumor has it that beating this game grants you the power to debug any code. Speedrunners report completion times of 0.001 seconds.',
        'cover_image_url': '/img/cover_placeholder.svg',
        'trailer_url': 'https://example.com/testgame-trailer',
        'is_derived_work': False,
        'is_sequel': False,
        'related_game_id': None,
        'tags': ['test', 'legendary', 'mythical', 'debugging']
    }
    
    # Dynamically build the insert query based on the imported schema
    fields = []
    params = []
    for col in GAME_COLUMNS:
        if col in game_data:
            value = game_data[col]
            fields.append(col)
            if col == 'tags' and isinstance(value, list):
                params.append(json.dumps(value))
            else:
                params.append(value)

    field_names = ", ".join(fields)
    placeholders = ", ".join(["?"] * len(fields))
    
    cur.execute(f'INSERT INTO games ({field_names}) VALUES ({placeholders})', params)
    
    game_id = cur.lastrowid
    
    # Link game to platform (digital)
    gp_data = {
        'game_id': game_id,
        'platform_id': platform_data['id'],
        'is_digital': True,
        'acquisition_method': 'free'
    }
    gp_fields, gp_params = [], []
    for col in GAME_PLATFORM_COLUMNS:
        if col in gp_data:
            gp_fields.append(col)
            gp_params.append(gp_data[col])
    gp_field_names = ", ".join(gp_fields)
    gp_placeholders = ", ".join(["?"] * len(gp_fields))
    cur.execute(f'INSERT INTO game_platforms ({gp_field_names}) VALUES ({gp_placeholders})', gp_params)
    
    conn.commit()
    
    return {
        'status': 'seeded',
        'message': 'Database seeded with test data',
        'game': {
            'id': game_id,
            'name': game_data['name'],
            'description': game_data['description']
        },
        'platform': {
            'id': platform_data['id'],
            'name': platform_data['name']
        }
    }


def handle(req: Dict[str, Any]):
    """
    Main plugin entrypoint.
    
    GET /plugins/seed_handler/check - Check if database is empty
    POST /plugins/seed_handler/seed - Seed database with test data if empty
    """
    method = req.get('method', 'GET')
    subpath = (req.get('subpath', '') or '').lstrip('/')
    
    conn = _get_conn()
    try:
        if method == 'GET' and subpath == 'check':
            is_empty = _is_database_empty(conn)
            return {
                'empty': is_empty,
                'message': 'Database is empty' if is_empty else 'Database has data'
            }
        
        elif method == 'POST' and subpath == 'seed':
            if not _is_database_empty(conn):
                return (400, {'error': 'Database is not empty. Seeding is only for empty databases.'})
            
            result = _seed_database(conn)
            return result
        
        else:
            return (404, {'error': 'Unknown endpoint'})
    
    finally:
        conn.close()
