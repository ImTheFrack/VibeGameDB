"""Simple integration test for handlers/database_handler.py

This script runs CRUD operations against a temporary SQLite file under data/
so it doesn't interfere with any real DB file.
"""
import os
import sys
import tempfile
import shutil
import json

# Add parent directory to path so handlers can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from handlers import database_handler as dbh

# Use a temporary database file
tmpdir = tempfile.mkdtemp(prefix='vdb_test_')
dbfile = os.path.join(tmpdir, 'test_gamedb.sqlite')

try:
    conn = dbh._get_conn(dbfile)
    dbh._ensure_schema(conn)
    conn.close()

    # Create a game
    req = {
        'method': 'POST',
        'subpath': '/games',
        'json': {
            'name': 'Test Game',
            'description': 'A test',
            'cover_image_url': '/img/cover_placeholder.svg',
            'trailer_url': '',
            'platforms': ['TestStation']
        }
    }
    # Monkey-patch _get_conn to use our tmp db
    orig_get_conn = dbh._get_conn
    dbh._get_conn = lambda path=None: orig_get_conn(dbfile)

    res = dbh.handle(req)
    print('CREATE:', res)
    if isinstance(res, tuple) and res[0] != 200:
        raise SystemExit('Create failed: ' + str(res))
    gid = res.get('game', {}).get('id') if isinstance(res, dict) else res[1].get('game', {}).get('id')

    # Read list
    res = dbh.handle({'method': 'GET', 'subpath': '/games', 'query': {}})
    print('LIST:', res)

    # Update
    upd = {'method': 'PUT', 'subpath': f'/games/{gid}', 'json': {'description': 'Updated'}}
    res = dbh.handle(upd)
    print('UPDATE:', res)

    # Delete
    res = dbh.handle({'method': 'DELETE', 'subpath': f'/games/{gid}'})
    print('DELETE:', res)

    # Confirm deleted
    res = dbh.handle({'method': 'GET', 'subpath': '/games', 'query': {'id': [str(gid)]}})
    print('GET AFTER DELETE:', res)

finally:
    # cleanup
    dbh._get_conn = orig_get_conn
    shutil.rmtree(tmpdir)
    print('Cleaned up test DB')
