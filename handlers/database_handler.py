"""
Database handler plugin stub.

This module implements a `handle(req)` function that the main server's plugin
loader will call. For now it returns static sample data for `/games` and
`/platforms` subpaths. The goal is to provide predictable responses that the
frontend can fetch while the real database layer is implemented later.

Coding rules followed:
- No hardcoded endpoints in other modules: values that may change should be
  placed in `config.py` (see use of APP_TITLE below as an example import).
- Heavily commented to explain the why and the return format expected by the
  server loader in `main.py`.
"""

from typing import Dict, Any
import json

try:
    # Import configuration so future code uses centralized values.
    import config
except Exception:
    # Fail-safe: allow operation even if config isn't present during early dev.
    config = None


# Replace cover/icon URLs to local placeholders and wrap returned lists in dicts

def _sample_games():
    """Return a small list of sample game dicts used by the frontend while
    the real DB layer is implemented.
    """
    return [
        {
            "id": 1,
            "name": "Cyberpunk 2077",
            "description": "A story-driven, open world RPG set in Night City.",
            # Use a local placeholder image so the app works offline / without
            # depending on external placeholder services which can fail.
            "cover_image_url": "/img/cover_placeholder.svg",
            "platforms": ["Steam", "GOG"]
        },
        {
            "id": 2,
            "name": "Hades",
            "description": "A rogue-like dungeon crawler with fast-paced combat.",
            "cover_image_url": "/img/cover_placeholder.svg",
            "platforms": ["Steam", "Switch"]
        }
    ]


def _sample_platforms():
    """Return a few sample platform objects.

    The `id` field is a slug-like identifier; `name` is human-facing. Future
    DB schema may include unique integer IDs, but slugs are convenient for
    example data and URLs.
    """
    return [
        {"id": "steam", "name": "Steam", "type": "Digital", "icon_url": "/img/icon_placeholder.svg", "count": 52},
        {"id": "switch", "name": "Nintendo Switch", "type": "Physical/Digital", "icon_url": "/img/icon_placeholder.svg", "count": 18},
    ]


def handle(req: Dict[str, Any]):
    """
    Entry point for the plugin loader.

    The `req` dict is provided by the server loader and includes keys such as:
      - method: HTTP method
      - path: full request path
      - subpath: path after the plugin name (e.g. '/games')
      - query: parsed query params
      - headers: request headers
      - body: raw bytes
      - json: parsed JSON body or None

    Return values supported by the loader (documented in repo copilot-instructions):
      - dict -> returned as JSON with 200
      - (status, body) -> send body with given status
      - (status, headers, body) -> explicit headers

    For unrecognized subpaths we return a 404 tuple so the server emits that
    status code to the client.
    """
    subpath = req.get('subpath', '') or ''
    # Normalize subpath (strip leading slash)
    sp = subpath.lstrip('/')

    if sp == 'games':
        # Return sample games wrapped in a dict so the plugin loader treats
        # the return value as a JSON object (200). Returning a raw list can be
        # misinterpreted by the loader as a (status, body) tuple.
        return {"games": _sample_games()}

    if sp == 'platforms':
        return {"platforms": _sample_platforms()}

    # Unknown path: return 404 status and a small JSON body explaining the issue.
    return (404, {"status": "error", "message": f"Unknown subpath: {subpath}"})
