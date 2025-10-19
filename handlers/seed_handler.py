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
        'description': 'A mysterious platform that exists only in the realm of testing. Legend has it that it runs on pure imagination and caffeine.'
    }
    
    cur.execute(
        'INSERT INTO platforms (id, name, supports_digital, supports_physical, icon_url, description) '
        'VALUES (?, ?, ?, ?, ?, ?)',
        (platform_data['id'], platform_data['name'], platform_data['supports_digital'], 
         platform_data['supports_physical'], platform_data['icon_url'], platform_data['description'])
    )
    
    # Create test game
    game_data = {
        'name': 'TestGame',
        'description': 'A legendary game that exists only in test databases. Rumor has it that beating this game grants you the power to debug any code. Speedrunners report completion times of 0.001 seconds.',
        'cover_image_url': '/img/cover_placeholder.svg',
        'trailer_url': 'https://example.com/testgame-trailer',
        'is_remake': False,
        'is_remaster': False,
        'related_game_id': None,
        'tags': json.dumps(['test', 'legendary', 'mythical', 'debugging'])
    }
    
    cur.execute(
        'INSERT INTO games (name, description, cover_image_url, trailer_url, is_remake, is_remaster, related_game_id, tags) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        (game_data['name'], game_data['description'], game_data['cover_image_url'], 
         game_data['trailer_url'], game_data['is_remake'], game_data['is_remaster'], 
         game_data['related_game_id'], game_data['tags'])
    )
    
    game_id = cur.lastrowid
    
    # Link game to platform (digital)
    cur.execute(
        'INSERT INTO game_platforms (game_id, platform_id, is_digital, acquisition_method) '
        'VALUES (?, ?, ?, ?)',
        (game_id, platform_data['id'], True, 'free')
    )
    
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
