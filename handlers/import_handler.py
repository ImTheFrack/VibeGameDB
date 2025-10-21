"""
CSV import handler (skeleton).

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
    config = _C()


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
    
    mapping = {}
    for h in headers:
        lower = (h or '').strip().lower()
        if 'name' in lower or 'title' in lower:
            mapping[h] = 'name'
        elif 'desc' in lower or 'summary' in lower:
            mapping[h] = 'description'
        elif 'cover' in lower or 'image' in lower:
            mapping[h] = 'cover_image_url'
        elif 'trailer' in lower or 'youtube' in lower:
            mapping[h] = 'trailer_url'
        elif 'remake' in lower:
            mapping[h] = 'is_remake'
        elif 'remaster' in lower:
            mapping[h] = 'is_remaster'
        elif 'tag' in lower or 'genre' in lower:
            mapping[h] = 'tags'
        elif re.search(r'price|bought|free|acquisition', lower):
            # platform-level info often needs manual mapping
            mapping[h] = 'acquisition_hint'
        else:
            # Check if header matches a known platform name
            if lower in known_platforms:
                canonical_name = known_platforms[lower]
                platform_id = canonical_name.lower().replace(' ', '_').replace('-', '_')
                mapping[h] = f'platform:NEW:{canonical_name}'
            else:
                # leave unmapped by default; frontend can map to platform
                mapping[h] = ''
    return mapping


def _coerce_value(field: str, value: str):
    if value is None:
        return None
    v = value.strip()
    if field in ('is_remake', 'is_remaster'):
        if v.lower() in ('1', 'true', 'yes', 'y'):
            return True
        if v.lower() in ('0', 'false', 'no', 'n'):
            return False
        return False
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
            'INSERT INTO games (name, description, cover_image_url, trailer_url, is_remake, is_remaster, related_game_id, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            (
                game_obj.get('name'),
                game_obj.get('description'),
                game_obj.get('cover_image_url'),
                game_obj.get('trailer_url'),
                int(bool(game_obj.get('is_remake'))),
                int(bool(game_obj.get('is_remaster'))),
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
        try:
            # Use a single transaction for all imports
            conn.execute('BEGIN TRANSACTION')
            
            # Cache for platform lookups to avoid repeated DB queries
            platform_cache = {}
            
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
                    elif mapped in ('is_remake', 'is_remaster'):
                        game_obj[mapped] = coerced
                    else:
                        game_obj[mapped] = coerced

                try:
                    gid, created, links = _insert_game_and_links(conn, game_obj, platform_links, options, platform_cache)
                    created_games += created
                    created_links += links
                except Exception as e:
                    errors.append({'row': rnum, 'error': str(e)})
            
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

    return (404, {'error': 'unknown import action'})
