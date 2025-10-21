"""Simple tests for handlers/import_handler.py

These are quick, runnable checks that exercise preview parsing and the import
flow using a temporary database file. They do not require running the HTTP
server; instead they import the handler module and call `handle(req)` with
constructed request dicts similar to how `main.py` would do.

Run:
    python scripts/test_import_handler.py

"""
import os
import tempfile
import json
import sqlite3
import importlib.util
import sys

# Import the handler module by path
HERE = os.path.dirname(os.path.dirname(__file__))
HANDLER_PATH = os.path.join(HERE, 'handlers', 'import_handler.py')
spec = importlib.util.spec_from_file_location('import_handler', HANDLER_PATH)
import_handler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(import_handler)

# Ensure repo root is on sys.path so local imports (config, handlers) resolve
if HERE not in sys.path:
    sys.path.insert(0, HERE)

# Use a temporary database file and patch config
import config as project_config
orig_db = getattr(project_config, 'DATABASE_FILE', None)

try:
    fd, tmp = tempfile.mkstemp(suffix='.sqlite')
    os.close(fd)
    project_config.DATABASE_FILE = tmp
    # Ensure the imported handler uses the same temp DB path
    try:
        import_handler.config.DATABASE_FILE = tmp
    except Exception:
        pass

    # Ensure database schema exists by invoking database_handler's schema helper
    DBH_PATH = os.path.join(HERE, 'handlers', 'database_handler.py')
    spec2 = importlib.util.spec_from_file_location('database_handler', DBH_PATH)
    database_handler = importlib.util.module_from_spec(spec2)
    spec2.loader.exec_module(database_handler)

    # Create schema by connecting directly to the temp DB and calling the ensureer
    conn = sqlite3.connect(tmp)
    conn.row_factory = sqlite3.Row
    try:
        database_handler._ensure_schema(conn)
    except Exception:
        conn.execute('CREATE TABLE IF NOT EXISTS platforms (id TEXT PRIMARY KEY, name TEXT, supports_digital INT, supports_physical INT)')
    # insert a platform used by the CSV sample
    try:
        conn.execute("INSERT OR IGNORE INTO platforms (id, name, supports_digital, supports_physical) VALUES ('steam','Steam',1,0)")
        conn.commit()
    finally:
        conn.close()

    # Test 1: Preview with platform columns
    csv_text = 'Title,Tags,Steam,EGS,GOG\nHades,roguelike;action,$,,Free\nCeleste,platformer,Free,$,'
    req = {'method':'POST','subpath':'/preview','json':{'csv_text': csv_text}}
    resp = import_handler.handle(req)
    assert isinstance(resp, dict), f'preview response not dict: {resp}'
    assert 'headers' in resp and 'preview' in resp and 'mapping' in resp
    print('Preview OK:', resp['headers'], len(resp['preview']))

    # Test 2: Import with platform columns
    # Manually set mapping to use platform columns
    mapping = {
        'Title': 'name',
        'Tags': 'tags',
        'Steam': 'platform:steam',
        'EGS': 'platform:NEW:Epic Games Store',
        'GOG': 'platform:gog'
    }
    req2 = {'method':'POST','subpath':'/import','json':{'csv_text': csv_text, 'mapping': mapping, 'options': {'on_duplicate': 'skip'}}}
    imported = import_handler.handle(req2)
    assert isinstance(imported, dict)
    print('Import result:', imported)
    assert imported['created_games'] == 2, f"Expected 2 games, got {imported['created_games']}"
    assert imported['created_links'] >= 3, f"Expected at least 3 links, got {imported['created_links']}"

    # Test 3: Validate DB content
    conn = sqlite3.connect(tmp)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute('SELECT name FROM games ORDER BY name')
    games = [r[0] for r in cur.fetchall()]
    print('Games in DB:', games)
    assert 'Hades' in games and 'Celeste' in games
    
    # Check platforms were created
    cur.execute('SELECT id, name FROM platforms ORDER BY id')
    platforms = [(r['id'], r['name']) for r in cur.fetchall()]
    print('Platforms in DB:', platforms)
    assert any(p[0] == 'steam' for p in platforms), "Steam platform not found"
    assert any('epic' in p[1].lower() for p in platforms), "Epic Games Store platform not found"
    
    # Check game-platform links
    cur.execute('SELECT game_id, platform_id, is_digital, acquisition_method FROM game_platforms ORDER BY game_id, platform_id')
    links = [(r['game_id'], r['platform_id'], r['is_digital'], r['acquisition_method']) for r in cur.fetchall()]
    print('Game-Platform links:', links)
    assert len(links) >= 3, f"Expected at least 3 links, got {len(links)}"
    
    conn.close()

finally:
    # cleanup
    if orig_db is not None:
        project_config.DATABASE_FILE = orig_db
    try:
        os.remove(tmp)
    except Exception:
        pass

print('All import handler tests passed')
