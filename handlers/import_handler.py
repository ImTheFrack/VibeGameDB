"""
CSV and IDGB import handler (skeleton).

This handler implements a lightweight CSV import workflow used by the
frontend during import. It exposes the following logical operations via
the plugin subpath:

1. /preview    (POST) - accepts JSON { csv_text: str } and returns a
   heuristic mapping of columns to database fields plus a small preview
   of parsed rows so the user can confirm mappings.
2. /import     (POST) - accepts JSON { csv_text: str, mapping: dict, options: dict }
   and performs database inserts/updates according to the mapping and
   options (merge/skip duplicates). Returns a summary of created/updated rows.
3. /igdb_search (POST) - accepts JSON { title: str } and proxies a
   simplistic IGDB search stub (in the future this will call the real
   IGDB API). If no confident results are found, the handler will call
   the AI endpoint defined in config.AI_ENDPOINT_URL to suggest alternatives.

Notes:
- This is intentionally a skeleton: it focuses on data flow and contracts
  rather than perfect CSV parsing or full IGDB integration.
- All DB operations reuse the same conventions as `database_handler.py`.
- AI calls use config.AI_ENDPOINT_URL and remain optional; network errors
  are caught and reported in the response.
"""

from typing import Dict, Any, List, Optional, Tuple
import csv
import io
import json
import sqlite3
import time
import threading
import os
import re
import urllib.request
import urllib.parse

try:
    import config
except Exception:
    class _C:
        DATABASE_FILE = os.path.join('data', 'gamedb.sqlite')
        AI_ENDPOINT_URL = None
        IGDB_CLIENT_ID = None
        IGDB_CLIENT_SECRET = None
        IGDB_AUTH_URL = "https://id.twitch.tv/oauth2/token"
        IGDB_API_URL = "https://api.igdb.com/v4"
        IGDB_RATE_LIMIT_PER_SECOND = 4
    config = _C()

# --- IGDB Rate Limiting & Token Caching ---
# A simple thread-safe rate limiter and token cache for IGDB API calls.
_igdb_lock = threading.Lock()
_igdb_last_call_time = 0.0
_igdb_token_cache = {'token': None, 'expires_at': 0}

def _rate_limit_igdb():
    """Blocks to ensure we don't exceed the IGDB API rate limit."""
    global _igdb_last_call_time
    rate_limit = getattr(config, 'IGDB_RATE_LIMIT_PER_SECOND', 4)
    if rate_limit <= 0: return
    min_interval = 1.0 / rate_limit
    with _igdb_lock:
        elapsed = time.time() - _igdb_last_call_time
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)
        _igdb_last_call_time = time.time()

def _load_known_platforms() -> Dict[str, str]:
    """Load known platform names from data/plat.txt.
    
    Returns a dict mapping lowercase platform name -> canonical name.
    """
    platforms = {}
    plat_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'plat.txt')
    if os.path.isfile(plat_file):
        try:
            with open(plat_file, 'r') as f:
                for line in f:
                    name = line.strip()
                    if name:
                        platforms[name.lower()] = name
        except Exception:
            pass
    return platforms


def _get_conn():
    os.makedirs(os.path.dirname(config.DATABASE_FILE), exist_ok=True)
    conn = sqlite3.connect(config.DATABASE_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _simple_csv_parse(text: str, max_preview: int = 5) -> Tuple[List[str], List[List[str]]]:
    """Parse CSV text and return headers + preview rows.

    Falls back to splitting on commas if csv module fails.
    """
    f = io.StringIO(text)
    try:
        reader = csv.reader(f)
        rows = [r for r in reader]
    except Exception:
        # fallback naive
        rows = [line.split(',') for line in text.splitlines() if line.strip()]

    if not rows:
        return [], []
    # If first row looks like headers (non-numeric or contains letters), treat as headers
    first = rows[0]
    header_like = any(re.search('[A-Za-z]', cell or '') for cell in first)
    if header_like:
        headers = first
        data_rows = rows[1:1+max_preview]
    else:
        # synthesize headers
        num = max(len(r) for r in rows)
        headers = [f'col_{i}' for i in range(num)]
        data_rows = rows[:max_preview]
    return headers, data_rows


def _guess_mapping(headers: List[str], known_platforms: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Heuristically map CSV headers to DB fields.

    Returns mapping: csv_header -> db_field or platform_id or 'platform:<platform_id>'
    Known db fields: name, description, cover_image_url, trailer_url, is_remake, is_remaster, tags
    Platform mappings: 'platform:<platform_id>' or 'platform:NEW:<ColumnName>'
    """
    if known_platforms is None:
        known_platforms = _load_known_platforms()
    
    # Load existing platforms from DB to check if a known platform already exists
    existing_platforms = {}
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute('SELECT id, name FROM platforms')
        for row in cur.fetchall():
            existing_platforms[row['id']] = row['name']
        conn.close()
    except Exception:
        pass
    
    mapping = {}
    for h in headers:
        lower = (h or '').strip().lower()
        if 'name' in lower or 'title' in lower:
            mapping[h] = 'name'
        elif 'desc' in lower or 'summary' in lower:
            mapping[h] = 'description'
        elif 'cover' in lower or 'image' in lower:
            mapping[h] = 'cover_image_url'
        elif 'trailer' in lower or 'youtube' in lower: mapping[h] = 'trailer_url'
        elif 'remake' in lower or 'remaster' in lower:
            mapping[h] = 'is_derived_work'
        elif 'sequel' in lower:
            mapping[h] = 'is_sequel'
        elif 'tag' in lower or 'genre' in lower:
            mapping[h] = 'tags'
        elif 'year' in lower or 'release' in lower:
            mapping[h] = 'release_year'
        elif re.search(r'price|bought|free|acquisition', lower):
            # platform-level info often needs manual mapping
            mapping[h] = 'acquisition_hint'
        else:
            # Check if header matches a known platform name
            if lower in known_platforms:
                canonical_name = known_platforms[lower]
                platform_id = canonical_name.lower().replace(' ', '_').replace('-', '_')
                # Check if this platform already exists in the database
                if platform_id in existing_platforms:
                    # Map to existing platform
                    mapping[h] = f'platform:{platform_id}'
                else:
                    # Map to create new platform
                    mapping[h] = f'platform:NEW:{canonical_name}'
            else:
                # leave unmapped by default; frontend can map to platform
                mapping[h] = ''
    return mapping


def _coerce_value(field: str, value: str):
    if value is None:
        return None
    v = value.strip()
    if field in ('is_derived_work', 'is_sequel'):
        if v.lower() in ('1', 'true', 'yes', 'y'):
            return True
        if v.lower() in ('0', 'false', 'no', 'n'):
            return False
        return False
    if field == 'release_year':
        try:
            return int(v) if v else None
        except ValueError:
            return None
    if field == 'tags':
        # split on ; or ,
        parts = re.split(r'[;,]\s*', v) if v else []
        return [p for p in (p.strip() for p in parts) if p]
    return v


def _ensure_platform_exists(conn: sqlite3.Connection, platform_id: str, platform_name: str) -> bool:
    """Ensure a platform exists; create it if needed. Returns True if platform exists or was created."""
    cur = conn.cursor()
    cur.execute('SELECT 1 FROM platforms WHERE id = ?', (platform_id,))
    if cur.fetchone():
        return True
    # Create platform with sensible defaults
    try:
        cur.execute(
            'INSERT INTO platforms (id, name, supports_digital, supports_physical) VALUES (?, ?, ?, ?)',
            (platform_id, platform_name, 1, 0)  # default: digital only
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        # name already exists, try to find by name
        cur.execute('SELECT id FROM platforms WHERE name = ?', (platform_name,))
        row = cur.fetchone()
        return row is not None


def _insert_game_and_links(conn: sqlite3.Connection, game_obj: Dict[str, Any], platform_links: List[Dict[str, Any]], options: Dict[str, Any], platform_cache: Optional[Dict[str, Any]] = None):
    """Insert or merge a game and its platform links.

    options may include: {'on_duplicate': 'skip'|'merge'|'create_new'}
    platform_cache: optional dict to cache platform lookups (key: platform_id, value: platform info)
    Returns tuple (created_game_id, created_links_count)
    """
    if platform_cache is None:
        platform_cache = {}
    
    cur = conn.cursor()
    # Try to find duplicate by exact name match
    cur.execute('SELECT * FROM games WHERE name = ?', (game_obj['name'],))
    existing = cur.fetchone()
    if existing and options.get('on_duplicate') == 'skip':
        gid = existing['id']
        created = 0
    elif existing and options.get('on_duplicate') == 'merge':
        gid = existing['id']
        # perform a simple merge: update description/tags if missing
        upd = {}
        if not existing['description'] and game_obj.get('description'):
            upd['description'] = game_obj['description']
        if not existing['tags'] and game_obj.get('tags'):
            upd['tags'] = json.dumps(game_obj['tags'])
        if upd:
            sets = ','.join(f"{k} = ?" for k in upd.keys())
            params = list(upd.values()) + [gid]
            cur.execute(f'UPDATE games SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?', params)
        created = 0
    else:
        # create new
        cur.execute(
            'INSERT INTO games (name, description, release_year, cover_image_url, trailer_url, is_derived_work, is_sequel, related_game_id, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (
                game_obj.get('name'),
                game_obj.get('description'),
                game_obj.get('release_year'),
                game_obj.get('cover_image_url'),
                game_obj.get('trailer_url'),
                int(bool(game_obj.get('is_derived_work'))),
                int(bool(game_obj.get('is_sequel'))),
                game_obj.get('related_game_id'),
                json.dumps(game_obj.get('tags') or [])
            )
        )
        gid = cur.lastrowid
        created = 1

    # Insert platform links (best-effort; skip if platform doesn't exist)
    link_created = 0
    for link in platform_links:
        platform_id = link['platform_id']
        platform_name = link.get('platform_name', platform_id)
        
        # Check cache first
        if platform_id not in platform_cache:
            # Ensure platform exists (create if needed)
            if not _ensure_platform_exists(conn, platform_id, platform_name):
                platform_cache[platform_id] = None
                continue
            # Query platform info and cache it
            cur.execute('SELECT supports_digital, supports_physical FROM platforms WHERE id = ?', (platform_id,))
            platform = cur.fetchone()
            platform_cache[platform_id] = platform
        else:
            platform = platform_cache[platform_id]
        
        if not platform:
            continue
        
        is_digital = bool(link.get('is_digital', True))
        # validate support
        if is_digital and not platform['supports_digital']:
            continue
        if not is_digital and not platform['supports_physical']:
            continue
        try:
            cur.execute('INSERT INTO game_platforms (game_id, platform_id, is_digital, acquisition_method) VALUES (?, ?, ?, ?)',
                        (gid, platform_id, int(is_digital), link.get('acquisition_method')))
            link_created += 1
        except sqlite3.IntegrityError:
            # duplicate link, ignore
            continue

    return gid, created, link_created


def _call_ai_suggest(title: str) -> List[str]:
    """Call configured AI endpoint to suggest alternate titles or corrections.

    Returns a list of suggested alternative search terms. Best-effort; failures
    return an empty list.
    """
    url = getattr(config, 'AI_ENDPOINT_URL', None)
    if not url:
        return []
    payload = {'prompt': f"Suggest alternate titles or common misspellings for the game title: {title}", 'max_tokens': 128}
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            text = resp.read().decode('utf-8')
            # Expecting JSON like { suggestions: ["...", ...] } or plain text
            try:
                j = json.loads(text)
                return j.get('suggestions') or j.get('alternatives') or []
            except Exception:
                # fallback: split by newline
                return [l.strip() for l in text.splitlines() if l.strip()][:5]
    except Exception:
        return []


def _get_igdb_token():
    """
    Fetches an IGDB access token using client credentials.
    In a real app, this token should be cached until it expires.
    """
    print("[IGDB] Attempting to get IGDB auth token...")
    # Check cache first
    with _igdb_lock:
        if _igdb_token_cache['token'] and time.time() < _igdb_token_cache['expires_at']:
            print("[IGDB] Using cached token.")
            return _igdb_token_cache['token'], None

    client_id = getattr(config, 'IGDB_CLIENT_ID', None)
    client_secret = getattr(config, 'IGDB_CLIENT_SECRET', None)
    auth_url = getattr(config, 'IGDB_AUTH_URL', None)

    print(f"[IGDB] Using Client ID: {''.join(list(client_id)[:4])}...")
    if not all([client_id, client_secret, auth_url]) or 'your_client_id' in client_id:
        err_msg = "IGDB credentials not configured in config.py"
        print(f"[IGDB] ERROR: {err_msg}")
        return None, "IGDB credentials not configured in config.py"

    params = {
        'client_id': client_id,
        'client_secret': client_secret,
        'grant_type': 'client_credentials'
    }
    print(f"[IGDB] Auth request params (secret redacted): { {k:v for k,v in params.items() if k != 'client_secret'} }")
    data = urllib.parse.urlencode(params).encode('utf-8')
    req = urllib.request.Request(auth_url, data=data)
    _rate_limit_igdb() # Apply rate limit before the call

    try:
        print(f"[IGDB] Making POST request to auth URL: {auth_url}")
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status != 200:
                err_msg = f"Failed to get token, status: {resp.status}"
                print(f"[IGDB] ERROR: {err_msg}")
                return None, err_msg
            result = json.loads(resp.read().decode('utf-8'))
            print(f"[IGDB] Successfully received token (expires in {result.get('expires_in')}s).")
            token = result.get('access_token')
            # Cache the new token with its expiry time (with a small buffer)
            with _igdb_lock:
                _igdb_token_cache['token'] = token
                _igdb_token_cache['expires_at'] = time.time() + result.get('expires_in', 3600) - 60
            return token, None
    except Exception as e:
        print(f"[IGDB] EXCEPTION during token fetch: {e}")
        return None, f"Error fetching IGDB token: {e}"


def _fetch_igdb_data(token: str, title: Optional[str] = None, igdb_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Fetches game data from IGDB by title or ID.
    Returns the first and most relevant game object from the IGDB API response.
    """
    print(f"[IGDB] Fetching data from IGDB API. Title: '{title}', ID: {igdb_id}")
    client_id = getattr(config, 'IGDB_CLIENT_ID', None)
    api_url = getattr(config, 'IGDB_API_URL', None)
    if not all([client_id, api_url, token]):
        return None
    
    # --- Step 1: Fetch main game data including keyword IDs ---
    headers = {'Client-ID': client_id, 'Authorization': f'Bearer {token}'}
    
    # Define the fields we want from IGDB. This is an APOCALYPSE query.
    # We now pull from genres, themes, and player_perspectives for cleaner data.
    fields = "fields name, cover.image_id, first_release_date, genres.name, themes.name, player_perspectives.name, involved_companies.developer, involved_companies.publisher, involved_companies.company.name, summary, storyline, total_rating, aggregated_rating_count, url;"
    
    if igdb_id:
        body = f"{fields} where id = {igdb_id};"
    elif title:
        # Search for the most relevant game.
        body = f'{fields} search "{title}"; limit 10;' # Fetch up to 10 results
    else:
        return []

    print(f"[IGDB] API Request URL: {api_url}/games")
    print(f"[IGDB] API Request Body: {body}")
    req = urllib.request.Request(f"{api_url}/games", data=body.encode('utf-8'), headers=headers)
    _rate_limit_igdb() # Apply rate limit before the call
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status != 200:
                print(f"[IGDB] API returned non-200 status: {resp.status}")
                return []
            results = json.loads(resp.read().decode('utf-8'))
            print(f"[IGDB] API returned {len(results)} game(s).")
            
            if not results:
                return []
            
            # The new fields (themes.name, etc.) are expanded directly, so no second query is needed.
            # We can just return the results.
            return results

    except Exception as e:
        print(f"[IGDB] EXCEPTION during API data fetch: {e}")
        return None


def _map_igdb_to_schema(igdb_game: Dict[str, Any]) -> Dict[str, Any]:
    """Maps a raw IGDB game object to our local database schema."""
    if not igdb_game:
        return {}
    
    print("[IGDB] Mapping raw IGDB data to local schema...")
    # Log the first few levels of the raw data for inspection
    raw_preview = {k: v for k, v in igdb_game.items() if not isinstance(v, (list, dict))}
    print(f"[IGDB] Raw data preview: {raw_preview}")
    
    # Extract developers and publishers
    developers = [ic['company']['name'] for ic in igdb_game.get('involved_companies', []) if ic.get('developer')]
    publishers = [ic['company']['name'] for ic in igdb_game.get('involved_companies', []) if ic.get('publisher')]
    
    # Combine themes and player perspectives for tags
    themes = [t['name'] for t in igdb_game.get('themes', [])]
    perspectives = [p['name'] for p in igdb_game.get('player_perspectives', [])]

    mapped = {
        'name': igdb_game.get('name'),
        'description': igdb_game.get('summary'),
        'plot_synopsis': igdb_game.get('storyline'),
        'igdb_id': igdb_game.get('id'),
        'genre': ", ".join(g['name'] for g in igdb_game.get('genres', [])),
        'developer': ", ".join(developers),
        'publisher': ", ".join(publishers),
        'tags': [tag.lower() for tag in themes + perspectives]
    }

    if igdb_game.get('cover', {}).get('image_id'):
        mapped['cover_image_url'] = f"https://images.igdb.com/igdb/image/upload/t_cover_big/{igdb_game['cover']['image_id']}.jpg"
    
    if igdb_game.get('first_release_date'):
        from datetime import datetime
        mapped['release_year'] = datetime.fromtimestamp(igdb_game['first_release_date']).year

    print(f"[IGDB] Mapping complete. Result: {mapped}")
    # Filter out any None values
    return {k: v for k, v in mapped.items() if v is not None}


def handle(req: Dict[str, Any]):
    parsed = req
    subpath = (parsed.get('subpath') or '').lstrip('/')
    method = parsed.get('method', 'GET')

    if subpath.startswith('preview') and method == 'POST':
        body = parsed.get('json')
        if not body or 'csv_text' not in body:
            return (400, {'error': 'csv_text is required'})
        csv_text = body['csv_text']
        headers, preview_rows = _simple_csv_parse(csv_text, max_preview=10)
        mapping = _guess_mapping(headers)
        return {'headers': headers, 'mapping': mapping, 'preview': preview_rows}

    if subpath.startswith('import') and method == 'POST':
        body = parsed.get('json')
        if not body or 'csv_text' not in body or 'mapping' not in body:
            return (400, {'error': 'csv_text and mapping are required'})
        csv_text = body['csv_text']
        mapping = body['mapping']  # csv_header -> db_field or ''
        options = body.get('options', {})
        # parse entire CSV
        f = io.StringIO(csv_text)
        reader = csv.reader(f)
        rows = [r for r in reader if any(cell.strip() for cell in r)]
        if not rows:
            return (400, {'error': 'no rows found'})
        # determine headers
        first = rows[0]
        header_like = any(re.search('[A-Za-z]', cell or '') for cell in first)
        if header_like:
            headers = first
            data_rows = rows[1:]
        else:
            headers = [f'col_{i}' for i in range(max(len(r) for r in rows))]
            data_rows = rows

        conn = _get_conn()
        created_games = 0
        created_links = 0
        errors = []

        # --- OPTIMIZATION: Pre-fetch existing data to avoid N+1 queries ---
        existing_games_by_name = {}
        if options.get('on_duplicate') in ('skip', 'merge'):
            try:
                conn_check = _get_conn()
                cur_check = conn_check.cursor()
                cur_check.execute('SELECT id, name, description, tags FROM games')
                for row in cur_check.fetchall():
                    existing_games_by_name[row['name']] = dict(row)
                conn_check.close()
            except Exception as e:
                errors.append({'row': 0, 'error': f'Failed to pre-fetch games: {e}'})

        try:
            # Use a single transaction for all imports
            conn.execute('BEGIN TRANSACTION')
            
            # Cache for platform lookups to avoid repeated DB queries
            platform_cache = {}

            # --- OPTIMIZATION: Batch inserts ---
            games_to_insert = []
            links_to_insert = []
            
            for rnum, row in enumerate(data_rows, start=1):
                # build game object and platform links from mapping
                game_obj = {}
                platform_links = []
                for i, h in enumerate(headers):
                    val = row[i] if i < len(row) else ''
                    mapped = mapping.get(h, '')
                    if not mapped:
                        continue
                    
                    # Handle platform column mappings: 'platform:<platform_id>' or 'platform:NEW:<ColumnName>'
                    if mapped.startswith('platform:'):
                        # Parse platform mapping
                        parts = mapped.split(':', 2)  # ['platform', 'id_or_NEW', 'name_if_new']
                        if len(parts) >= 2:
                            if parts[1] == 'NEW' and len(parts) >= 3:
                                # New platform: use column name as platform name
                                platform_name = parts[2]
                                platform_id = platform_name.lower().replace(' ', '_').replace('-', '_')
                            else:
                                # Existing platform
                                platform_id = parts[1]
                                platform_name = platform_id
                            
                            # Parse cell value as acquisition method
                            # Empty cell = not on this platform
                            # '$' or 'Bought' = bought (digital)
                            # 'Free' = free (digital)
                            # 'Bundle' = bundle (digital)
                            # 'Gift' = gift (digital)
                            # 'Sub' = subscription (digital)
                            # 'Physical' or 'Disc' = physical
                            if val and val.strip():
                                acq_val = val.strip()
                                is_digital = True
                                acq_method = 'bought'
                                
                                if acq_val.lower() in ('free', 'free to play', 'f2p'):
                                    acq_method = 'free'
                                elif acq_val.lower() in ('bundle', 'bundled'):
                                    acq_method = 'bundle'
                                elif acq_val.lower() in ('gift', 'gifted'):
                                    acq_method = 'gift'
                                elif acq_val.lower() in ('sub', 'subscription', 'gamepass'):
                                    acq_method = 'subscription'
                                elif acq_val.lower() in ('physical', 'disc', 'cartridge', 'box'):
                                    is_digital = False
                                    acq_method = 'bought'
                                elif acq_val.startswith('$'):
                                    acq_method = 'bought'
                                else:
                                    # default to bought if any non-empty value
                                    acq_method = 'bought'
                                
                                platform_links.append({
                                    'platform_id': platform_id,
                                    'platform_name': platform_name,
                                    'is_digital': is_digital,
                                    'acquisition_method': acq_method
                                })
                        continue
                    
                    if mapped == 'acquisition_hint':
                        # best-effort: try to detect platform_id and acquisition method like "Steam: Bought $10"
                        parts = val.split(':')
                        if len(parts) >= 2:
                            pid = parts[0].strip().lower().replace(' ', '_')
                            acq = parts[1].strip()
                            platform_links.append({'platform_id': pid, 'platform_name': pid, 'is_digital': True if 'digital' in acq.lower() or 'steam' in pid else True, 'acquisition_method': acq})
                        continue
                    
                    coerced = _coerce_value(mapped, val)
                    if mapped == 'tags':
                        game_obj['tags'] = coerced
                    elif mapped in ('is_derived_work', 'is_sequel'):
                        game_obj[mapped] = coerced
                    else:
                        game_obj[mapped] = coerced

                # --- OPTIMIZATION: Handle duplicates in memory first ---
                game_name = game_obj.get('name')
                if not game_name:
                    errors.append({'row': rnum, 'error': 'Missing game name'})
                    continue

                existing_game = existing_games_by_name.get(game_name)
                on_duplicate = options.get('on_duplicate', 'create_new')

                if existing_game:
                    if on_duplicate == 'skip':
                        continue # Skip this row entirely
                    elif on_duplicate == 'merge':
                        # For now, we'll stick to the original per-row update for merge,
                        # as batch updating is more complex. But we can still batch the links.
                        gid, created, links = _insert_game_and_links(conn, game_obj, platform_links, options, platform_cache)
                        created_games += created
                        created_links += links
                        continue
                
                # If we are here, it's a new game to be created.
                games_to_insert.append((
                    game_obj.get('name'),
                    game_obj.get('description'),
                    game_obj.get('release_year'),
                    game_obj.get('cover_image_url'),
                    game_obj.get('trailer_url'),
                    int(bool(game_obj.get('is_derived_work'))),
                    int(bool(game_obj.get('is_sequel'))),
                    game_obj.get('related_game_id'),
                    json.dumps(game_obj.get('tags') or [])
                ))
                # Stage the links with a placeholder for the game_id
                for link in platform_links:
                    link['staged_game_name'] = game_obj.get('name')
                    links_to_insert.append(link)

            # --- OPTIMIZATION: Perform batch inserts ---
            if games_to_insert:
                try:
                    # Batch insert games
                    cur = conn.cursor()
                    cur.executemany('INSERT INTO games (name, description, release_year, cover_image_url, trailer_url, is_derived_work, is_sequel, related_game_id, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', games_to_insert)
                    created_games = cur.rowcount

                    # Now that games are inserted, create a map of name -> new_id
                    cur.execute('SELECT id, name FROM games WHERE name IN ({})'.format(','.join('?' for _ in games_to_insert)), [g[0] for g in games_to_insert])
                    new_game_ids = {row['name']: row['id'] for row in cur.fetchall()}

                    # Batch insert links
                    final_links = []
                    for link in links_to_insert:
                        gid = new_game_ids.get(link['staged_game_name'])
                        if not gid: continue
                        # This part is still iterative due to platform checks, but the game insert is batched.
                        # A more advanced version could batch these too.
                        _, _, links_created = _insert_game_and_links(conn, {'name': link['staged_game_name']}, [link], {'on_duplicate': 'merge'}, platform_cache)
                        created_links += links_created

                except Exception as e:
                    errors.append({'row': 0, 'error': f'Batch insert failed: {e}'})
            
            # Commit the entire transaction at the end
            conn.commit()
        except Exception as e:
            conn.rollback()
            errors.append({'row': 0, 'error': f'Transaction failed: {str(e)}'})
        finally:
            conn.close()

        return {'created_games': created_games, 'created_links': created_links, 'errors': errors}

    if subpath.startswith('igdb_search') and method == 'POST':
        body = parsed.get('json')
        if not body or 'title' not in body:
            return (400, {'error': 'title is required'})
        title = body['title']
        # This is a stub - in future call IGDB API. For now return heuristic match if a game with same name exists
        conn = _get_conn()
        try:
            cur = conn.cursor()
            cur.execute('SELECT id, name, description FROM games WHERE lower(name) = ?', (title.lower(),))
            row = cur.fetchone()
            if row:
                return {'matches': [{'source': 'local', 'id': row['id'], 'name': row['name'], 'description': row['description'], 'score': 0.95}]}
        finally:
            conn.close()

        # Call AI endpoint to suggest alternatives if available
        suggestions = _call_ai_suggest(title)
        # Return suggested search terms for the frontend to try against IGDB
        return {'matches': [], 'suggestions': suggestions}

    if subpath.startswith('igdb_fetch') and method == 'POST':
        print("\n--- [IGDB] Handling 'igdb_fetch' request ---")
        body = parsed.get('json')
        if not body:
            print("[IGDB] ERROR: No JSON body found in request.")
            return (400, {'error': 'JSON body is required'})
        
        title = body.get('title')
        igdb_id = body.get('igdb_id')
        print(f"[IGDB] Request params: title='{title}', igdb_id='{igdb_id}'")

        if not title and not igdb_id:
            print("[IGDB] ERROR: Both title and igdb_id are missing.")
            return (400, {'error': 'title or igdb_id is required'})

        token, err = _get_igdb_token()
        if err:
            print(f"[IGDB] ERROR: Failed to get token: {err}")
            return (503, {'error': err})

        igdb_results = _fetch_igdb_data(token, title=title, igdb_id=igdb_id)

        # If searching by ID, we expect one result. Map it and return.
        if igdb_id:
            if not igdb_results:
                return {'game_data': {}}
            mapped_data = _map_igdb_to_schema(igdb_results[0])
            return {'game_data': mapped_data}

        # If searching by title, handle multiple results.
        if len(igdb_results) == 0:
            return {'game_data': {}}
        elif len(igdb_results) == 1:
            # Only one result, so we can fetch its keywords and map it directly.
            # The initial fetch already has all the data we need now.
            mapped_data = _map_igdb_to_schema(igdb_results[0])
            return {'game_data': mapped_data, 'raw_igdb_data': igdb_results}
        else:
            # Multiple results, return a list of choices for the user.
            return {'game_choices': igdb_results}

    return (404, {'error': 'unknown import action'})
