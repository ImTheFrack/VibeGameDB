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

    # --- Test 1: Create platforms ---
    print("TEST 1: Create platforms")
    platforms_data = [
        {
            'name': 'Steam',
            'supports_digital': True,
            'supports_physical': False,
            'description': 'Valve\'s digital distribution platform'
        },
        {
            'name': 'PlayStation 5',
            'supports_digital': True,
            'supports_physical': True,
            'description': 'Sony\'s latest console'
        },
        {
            'name': 'Nintendo Switch',
            'supports_digital': True,
            'supports_physical': True,
            'description': 'Nintendo\'s hybrid console'
        }
    ]

    platform_ids = []
    for platform_data in platforms_data:
        req = {
            'method': 'POST',
            'subpath': '/platforms',
            'json': platform_data
        }
        res = dbh.handle(req)
        assert_true(isinstance(res, dict), f"CREATE platform response should be dict, got {type(res)}")
        assert_true('platform' in res, f"Response missing 'platform' key: {res}")
        
        platform = res['platform']
        assert_true('id' in platform, f"Platform missing 'id': {platform}")
        assert_eq(platform['name'], platform_data['name'], f"Platform name mismatch")
        
        platform_ids.append(platform['id'])
        print(f"  ✓ Created '{platform_data['name']}' (ID: {platform['id']})")

    print()

    # --- Test 2: Create multiple games ---
    print("TEST 2: Create multiple games")
    games_data = [
        {
            'name': 'Elden Ring',
            'description': 'Action RPG by FromSoftware',
            'cover_image_url': '/img/elden_ring.svg',
            'trailer_url': 'https://example.com/trailer1',
            'tags': ['action', 'RPG', 'souls-like'],
            'is_remake': False,
            'is_remaster': False
        },
        {
            'name': 'Hades',
            'description': 'Roguelike dungeon crawler',
            'cover_image_url': '/img/hades.svg',
            'trailer_url': 'https://example.com/trailer2',
            'tags': ['roguelike', 'indie'],
            'is_remake': False,
            'is_remaster': False
        },
        {
            'name': 'Baldur\'s Gate 3',
            'description': 'Turn-based RPG',
            'cover_image_url': '/img/bg3.svg',
            'trailer_url': '',
            'tags': ['RPG', 'turn-based'],
            'is_remake': False,
            'is_remaster': False
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
        assert_true(isinstance(res, dict), f"CREATE game response should be dict, got {type(res)}")
        assert_true('game' in res, f"Response missing 'game' key: {res}")
        
        game = res['game']
        assert_true('id' in game, f"Game missing 'id': {game}")
        assert_eq(game['name'], game_data['name'], f"Game name mismatch")
        assert_eq(game['tags'], game_data['tags'], f"Tags mismatch for {game_data['name']}")
        
        game_ids.append(game['id'])
        print(f"  ✓ Created '{game_data['name']}' (ID: {game['id']}) with tags: {game['tags']}")

    print()

    # --- Test 3: Link games to platforms (game_platforms) ---
    print("TEST 3: Link games to platforms")
    game_platform_links = [
        {'game_id': game_ids[0], 'platform_id': platform_ids[0], 'is_digital': True, 'acquisition_method': 'bought'},  # Elden Ring on Steam (digital)
        {'game_id': game_ids[0], 'platform_id': platform_ids[1], 'is_digital': True, 'acquisition_method': 'bought'},  # Elden Ring on PS5 (digital)
        {'game_id': game_ids[0], 'platform_id': platform_ids[1], 'is_digital': False, 'acquisition_method': 'bought'}, # Elden Ring on PS5 (physical)
        {'game_id': game_ids[1], 'platform_id': platform_ids[0], 'is_digital': True, 'acquisition_method': 'free'},    # Hades on Steam (digital)
        {'game_id': game_ids[1], 'platform_id': platform_ids[2], 'is_digital': True, 'acquisition_method': 'bought'},  # Hades on Switch (digital)
        {'game_id': game_ids[2], 'platform_id': platform_ids[0], 'is_digital': True, 'acquisition_method': 'bought'},  # BG3 on Steam (digital)
    ]

    gp_ids = []
    for link_data in game_platform_links:
        req = {
            'method': 'POST',
            'subpath': '/game_platforms',
            'json': link_data
        }
        res = dbh.handle(req)
        assert_true(isinstance(res, dict), f"CREATE game_platform response should be dict, got {type(res)}")
        assert_true('game_platform' in res, f"Response missing 'game_platform' key: {res}")
        
        gp = res['game_platform']
        assert_true('id' in gp, f"game_platform missing 'id': {gp}")
        gp_ids.append(gp['id'])
        
        game_name = next(g['name'] for g in games_data if g == games_data[game_ids.index(link_data['game_id'])])
        plat_name = next(p['name'] for p in platforms_data if p == platforms_data[platform_ids.index(link_data['platform_id'])])
        fmt = 'digital' if link_data['is_digital'] else 'physical'
        print(f"  ✓ Linked '{game_name}' to '{plat_name}' ({fmt})")

    print()

    # --- Test 4: List all games ---
    print("TEST 4: List all games")
    res = dbh.handle({'method': 'GET', 'subpath': '/games', 'query': {}})
    assert_true(isinstance(res, dict), f"LIST games response should be dict")
    assert_true('games' in res, f"Response missing 'games' key: {res}")
    assert_eq(len(res['games']), 3, "Should have 3 games")
    print(f"  ✓ Listed {len(res['games'])} games")

    print()

    # --- Test 5: Query single game by ID ---
    print("TEST 5: Query single game by ID")
    res = dbh.handle({'method': 'GET', 'subpath': '/games', 'query': {'id': [str(game_ids[0])]}})
    assert_true(isinstance(res, dict), f"Single game query should return dict")
    assert_true('game' in res, f"Response missing 'game' key: {res}")
    assert_eq(res['game']['id'], game_ids[0], "Game ID mismatch")
    assert_eq(res['game']['name'], 'Elden Ring', "Game name mismatch")
    print(f"  ✓ Retrieved game ID {game_ids[0]}: {res['game']['name']}")

    print()

    # --- Test 6: Update game description ---
    print("TEST 6: Update game description")
    upd_req = {
        'method': 'PUT',
        'subpath': f'/games/{game_ids[2]}',
        'json': {'description': 'An epic turn-based RPG with incredible depth', 'tags': ['RPG', 'turn-based', 'fantasy']}
    }
    res = dbh.handle(upd_req)
    assert_true('game' in res, f"Response missing 'game' key: {res}")
    assert_eq(res['game']['description'], 'An epic turn-based RPG with incredible depth', "Description mismatch")
    assert_eq(len(res['game']['tags']), 3, "Should have 3 tags after update")
    print(f"  ✓ Updated game ID {game_ids[2]} description and tags")

    print()

    # --- Test 7: List game_platforms ---
    print("TEST 7: List game_platforms")
    res = dbh.handle({'method': 'GET', 'subpath': '/game_platforms', 'query': {}})
    assert_true(isinstance(res, dict), f"LIST game_platforms response should be dict")
    assert_true('game_platforms' in res, f"Response missing 'game_platforms' key: {res}")
    assert_eq(len(res['game_platforms']), len(game_platform_links), f"Should have {len(game_platform_links)} game_platform entries")
    print(f"  ✓ Listed {len(res['game_platforms'])} game-platform links")

    print()

    # --- Test 8: Filter game_platforms by game_id ---
    print("TEST 8: Filter game_platforms by game_id")
    res = dbh.handle({'method': 'GET', 'subpath': '/game_platforms', 'query': {'game_id': [str(game_ids[0])]}})
    assert_true(isinstance(res, dict), f"Filtered game_platforms response should be dict")
    assert_eq(len(res['game_platforms']), 3, "Elden Ring should have 3 platform entries (Steam digital, PS5 digital, PS5 physical)")
    print(f"  ✓ Elden Ring has {len(res['game_platforms'])} platform entries")

    print()

    # --- Test 9: Verify platform constraints ---
    print("TEST 9: Verify platform constraints")
    # Try to add a physical copy to Steam (which only supports digital)
    bad_req = {
        'method': 'POST',
        'subpath': '/game_platforms',
        'json': {'game_id': game_ids[1], 'platform_id': platform_ids[0], 'is_digital': False, 'acquisition_method': 'bought'}
    }
    res = dbh.handle(bad_req)
    assert_true(isinstance(res, tuple) and res[0] == 400, f"Should return 400 for physical on digital-only platform, got {res}")
    print(f"  ✓ Correctly rejected physical copy on digital-only platform")

    print()

    # --- Test 10: Delete a game_platform link ---
    print("TEST 10: Delete a game_platform link")
    del_req = {'method': 'DELETE', 'subpath': f'/game_platforms/{gp_ids[0]}'}
    res = dbh.handle(del_req)
    assert_true(isinstance(res, dict), f"DELETE response should be dict, got {type(res)}")
    assert_true('status' in res, f"Response missing 'status' key: {res}")
    print(f"  ✓ Deleted game_platform link ID {gp_ids[0]}")

    print()

    # --- Test 11: Delete a game (should cascade delete game_platforms) ---
    print("TEST 11: Delete a game (cascade delete)")
    del_req = {'method': 'DELETE', 'subpath': f'/games/{game_ids[0]}'}
    res = dbh.handle(del_req)
    assert_true(isinstance(res, dict), f"DELETE game response should be dict, got {type(res)}")
    print(f"  ✓ Deleted game ID {game_ids[0]}")

    print()

    # --- Test 12: Verify cascade deletion ---
    print("TEST 12: Verify cascade deletion")
    res = dbh.handle({'method': 'GET', 'subpath': '/games', 'query': {}})
    assert_eq(len(res['games']), 2, "Should have 2 games after deletion")
    remaining_names = [g['name'] for g in res['games']]
    assert_true('Elden Ring' not in remaining_names, "Elden Ring should be deleted")
    print(f"  ✓ Confirmed deletion; remaining games: {remaining_names}")

    print()

    # --- Test 13: Error cases ---
    print("TEST 13: Error handling")
    
    # Missing required field in game
    bad_req = {'method': 'POST', 'subpath': '/games', 'json': {'description': 'No name'}}
    res = dbh.handle(bad_req)
    assert_true(isinstance(res, tuple) and res[0] == 400, f"Should return 400 for missing name, got {res}")
    print(f"  ✓ Correctly rejected game with missing name")

    # Invalid game ID
    res = dbh.handle({'method': 'GET', 'subpath': '/games', 'query': {'id': ['99999']}})
    assert_true(isinstance(res, tuple) and res[0] == 404, f"Should return 404 for nonexistent ID, got {res}")
    print(f"  ✓ Correctly returned 404 for nonexistent game ID")

    # Platform must support at least one format
    bad_req = {'method': 'POST', 'subpath': '/platforms', 'json': {'name': 'Bad Platform', 'supports_digital': False, 'supports_physical': False}}
    res = dbh.handle(bad_req)
    assert_true(isinstance(res, tuple) and res[0] == 400, f"Should return 400 for platform with no formats, got {res}")
    print(f"  ✓ Correctly rejected platform with no supported formats")

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
