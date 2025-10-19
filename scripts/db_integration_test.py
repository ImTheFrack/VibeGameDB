"""Enhanced integration test for handlers/database_handler.py

This script runs comprehensive CRUD operations including:
- Multiple games with different platform combinations
- Platform table validation
- Filtering and querying
- Error cases
"""
import os
import sys
import tempfile
import shutil
import json

# Add parent directory to path so handlers can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from handlers import database_handler as dbh

def assert_eq(actual, expected, msg):
    """Simple assertion helper."""
    if actual != expected:
        raise AssertionError(f"{msg}: expected {expected}, got {actual}")

def assert_true(condition, msg):
    """Assert condition is truthy."""
    if not condition:
        raise AssertionError(msg)

# Use a temporary database file
tmpdir = tempfile.mkdtemp(prefix='vdb_test_')
dbfile = os.path.join(tmpdir, 'test_gamedb.sqlite')

try:
    # Initialize DB
    conn = dbh._get_conn(dbfile)
    dbh._ensure_schema(conn)
    conn.close()

    # Monkey-patch _get_conn to use our tmp db for all subsequent calls
    orig_get_conn = dbh._get_conn
    dbh._get_conn = lambda path=None: orig_get_conn(dbfile)

    print("=== Testing Database Handler ===\n")

    # --- Test 1: Create multiple games with different platforms ---
    print("TEST 1: Create multiple games")
    games_data = [
        {
            'name': 'Elden Ring',
            'description': 'Action RPG by FromSoftware',
            'cover_image_url': '/img/elden_ring.svg',
            'trailer_url': 'https://example.com/trailer1',
            'platforms': ['Steam', 'PlayStation 5', 'Xbox Series X']
        },
        {
            'name': 'Hades',
            'description': 'Roguelike dungeon crawler',
            'cover_image_url': '/img/hades.svg',
            'trailer_url': 'https://example.com/trailer2',
            'platforms': ['Steam', 'Nintendo Switch']
        },
        {
            'name': 'Baldur\'s Gate 3',
            'description': 'Turn-based RPG',
            'cover_image_url': '/img/bg3.svg',
            'trailer_url': '',
            'platforms': ['Steam', 'PlayStation 5']
        }
    ]

    game_ids = []
    for game_data in games_data:
        req = {
            'method': 'POST',
            'subpath': '/games',
            'json': game_data
        }
        res = dbh.handle(req)
        assert_true(isinstance(res, dict), f"CREATE response should be dict, got {type(res)}")
        assert_true('game' in res, f"Response missing 'game' key: {res}")
        
        game = res['game']
        assert_true('id' in game, f"Game missing 'id': {game}")
        assert_eq(game['name'], game_data['name'], f"Game name mismatch")
        assert_eq(game['platforms'], game_data['platforms'], f"Platforms mismatch for {game_data['name']}")
        
        game_ids.append(game['id'])
        print(f"  ✓ Created '{game_data['name']}' (ID: {game['id']}) with platforms: {game['platforms']}")

    print()

    # --- Test 2: List all games ---
    print("TEST 2: List all games")
    res = dbh.handle({'method': 'GET', 'subpath': '/games', 'query': {}})
    assert_true(isinstance(res, dict), f"LIST response should be dict")
    assert_true('games' in res, f"Response missing 'games' key: {res}")
    assert_eq(len(res['games']), 3, "Should have 3 games")
    print(f"  ✓ Listed {len(res['games'])} games")
    for game in res['games']:
        print(f"    - {game['name']} on {game['platforms']}")

    print()

    # --- Test 3: Query single game by ID ---
    print("TEST 3: Query single game by ID")
    res = dbh.handle({'method': 'GET', 'subpath': '/games', 'query': {'id': [str(game_ids[0])]}})
    assert_true(isinstance(res, dict), f"Single game query should return dict")
    assert_true('game' in res, f"Response missing 'game' key: {res}")
    assert_eq(res['game']['id'], game_ids[0], "Game ID mismatch")
    assert_eq(res['game']['name'], 'Elden Ring', "Game name mismatch")
    print(f"  ✓ Retrieved game ID {game_ids[0]}: {res['game']['name']}")

    print()

    # --- Test 4: Update a game (change platforms) ---
    print("TEST 4: Update game platforms")
    upd_req = {
        'method': 'PUT',
        'subpath': f'/games/{game_ids[1]}',
        'json': {'platforms': ['Steam', 'Nintendo Switch', 'Xbox Game Pass']}
    }
    res = dbh.handle(upd_req)
    assert_true(isinstance(res, dict), f"UPDATE response should be dict")
    assert_true('game' in res, f"Response missing 'game' key: {res}")
    updated_game = res['game']
    assert_eq(len(updated_game['platforms']), 3, "Should have 3 platforms after update")
    assert_true('Xbox Game Pass' in updated_game['platforms'], "Xbox Game Pass should be in platforms")
    print(f"  ✓ Updated game ID {game_ids[1]} platforms to: {updated_game['platforms']}")

    print()

    # --- Test 5: Update game description ---
    print("TEST 5: Update game description")
    upd_req = {
        'method': 'PUT',
        'subpath': f'/games/{game_ids[2]}',
        'json': {'description': 'An epic turn-based RPG with incredible depth'}
    }
    res = dbh.handle(upd_req)
    assert_true('game' in res, f"Response missing 'game' key: {res}")
    assert_eq(res['game']['description'], 'An epic turn-based RPG with incredible depth', "Description mismatch")
    print(f"  ✓ Updated game ID {game_ids[2]} description")

    print()

    # --- Test 6: List platforms (should be empty or minimal) ---
    print("TEST 6: List platforms")
    res = dbh.handle({'method': 'GET', 'subpath': '/platforms', 'query': {}})
    assert_true(isinstance(res, dict), f"PLATFORMS response should be dict")
    assert_true('platforms' in res, f"Response missing 'platforms' key: {res}")
    print(f"  ✓ Listed {len(res['platforms'])} platform entries")
    # Note: platforms table is separate; games just reference them by name in JSON array

    print()

    # --- Test 7: Delete a game ---
    print("TEST 7: Delete a game")
    del_req = {'method': 'DELETE', 'subpath': f'/games/{game_ids[0]}'}
    res = dbh.handle(del_req)
    assert_true(isinstance(res, dict), f"DELETE response should be dict")
    assert_true('status' in res, f"Response missing 'status' key: {res}")
    print(f"  ✓ Deleted game ID {game_ids[0]}")

    print()

    # --- Test 8: Verify deletion ---
    print("TEST 8: Verify deletion")
    res = dbh.handle({'method': 'GET', 'subpath': '/games', 'query': {}})
    assert_eq(len(res['games']), 2, "Should have 2 games after deletion")
    remaining_names = [g['name'] for g in res['games']]
    assert_true('Elden Ring' not in remaining_names, "Elden Ring should be deleted")
    print(f"  ✓ Confirmed deletion; remaining games: {remaining_names}")

    print()

    # --- Test 9: Error cases ---
    print("TEST 9: Error handling")
    
    # Missing required field
    bad_req = {'method': 'POST', 'subpath': '/games', 'json': {'description': 'No name'}}
    res = dbh.handle(bad_req)
    assert_true(isinstance(res, tuple) and res[0] == 400, f"Should return 400 for missing name, got {res}")
    print(f"  ✓ Correctly rejected game with missing name")

    # Invalid game ID
    res = dbh.handle({'method': 'GET', 'subpath': '/games', 'query': {'id': ['99999']}})
    assert_true(isinstance(res, tuple) and res[0] == 404, f"Should return 404 for nonexistent ID, got {res}")
    print(f"  ✓ Correctly returned 404 for nonexistent game ID")

    # Invalid platforms type
    bad_req = {'method': 'POST', 'subpath': '/games', 'json': {'name': 'Bad', 'platforms': 'Steam'}}
    res = dbh.handle(bad_req)
    assert_true(isinstance(res, tuple) and res[0] == 400, f"Should return 400 for non-list platforms, got {res}")
    print(f"  ✓ Correctly rejected non-list platforms")

    print()
    print("=== All tests passed! ===")

except Exception as e:
    print(f"\n❌ TEST FAILED: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

finally:
    # Restore original _get_conn and cleanup
    dbh._get_conn = orig_get_conn
    shutil.rmtree(tmpdir)
    print("\nCleaned up test database")
