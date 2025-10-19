# Frontend CRUD Architecture

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Frontend)                        │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              public/index.html (SPA Shell)               │   │
│  │  - Header with buttons (Add Game, Add Platform, Import)  │   │
│  │  - Tabs (Games, Platforms)                               │   │
│  │  - Display grid (renders cards)                           │   │
│  │  - Modals (game form, platform form, import form)        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ▲                                    │
│                              │                                    │
│                         (renders)                                 │
│                              │                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            public/js/app.js (Frontend Logic)             │   │
│  │                                                           │   │
│  │  Modal Management:                                        │   │
│  │  - openModal() / closeModal()                             │   │
│  │  - Click handlers for buttons                             │   │
│  │                                                           │   │
│  │  Form Handlers:                                           │   │
│  │  - formGame.addEventListener('submit', ...)              │   │
│  │  - formPlatform.addEventListener('submit', ...)          │   │
│  │                                                           │   │
│  │  API Calls:                                               │   │
│  │  - fetchGames() → GET /plugins/database_handler/games    │   │
│  │  - fetchPlatforms() → GET /plugins/database_handler/...  │   │
│  │  - POST/PUT to create/update games and platforms         │   │
│  │                                                           │   │
│  │  Rendering:                                               │   │
│  │  - renderGames(data)                                      │   │
│  │  - renderPlatforms(data)                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ▲                                    │
│                              │                                    │
│                         (HTTP/JSON)                               │
│                              │                                    │
└──────────────────────────────┼────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
        ┌─────────────────────┐  ┌──────────────────────┐
        │   GET /plugins/     │  │  POST/PUT /plugins/  │
        │ database_handler/   │  │ database_handler/    │
        │ games               │  │ games                │
        │ platforms           │  │ platforms            │
        └─────────────────────┘  └──────────────────────┘
                    │                     │
                    └──────────┬──────────┘
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │         Python HTTP Server (main.py)         │
        │                                              │
        │  - ThreadingHTTPServer                        │
        │  - Plugin loader (loads handlers/)            │
        │  - Routes /plugins/<name> to handlers         │
        └──────────────────────────────────────────────┘
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │    handlers/database_handler.py              │
        │                                              │
        │  handle(req) function:                        │
        │  - Routes to _list_games()                    │
        │  - Routes to _create_game()                   │
        │  - Routes to _update_game()                   │
        │  - Routes to _delete_game()                   │
        │  - Routes to _list_platforms()                │
        │  - Routes to _create_platform() ✨ NEW        │
        │  - Routes to _update_platform() ✨ NEW        │
        │  - Routes to _delete_platform() ✨ NEW        │
        └──────────────────────────────────────────────┘
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │         SQLite Database                      │
        │         (data/gamedb.sqlite)                 │
        │                                              │
        │  Tables:                                      │
        │  - games (id, name, description, ...)        │
        │  - platforms (id, name, type, ...)           │
        └──────────────────────────────────────────────┘
```

## Component Interactions

### Adding a Game

```
User clicks "Add Game"
    ↓
btnAddGame.addEventListener('click', async () => {
    formGame.reset()
    await populatePlatformsDropdown()  ← Fetches platforms from backend
    openModal(modalGame)
})
    ↓
Modal opens with empty form
    ↓
User fills form and clicks "Save"
    ↓
formGame.addEventListener('submit', async (e) => {
    e.preventDefault()
    const gameData = { name, description, cover_image_url, ... }
    fetch('/plugins/database_handler/games', {
        method: 'POST',
        body: JSON.stringify(gameData)
    })
})
    ↓
Backend receives POST request
    ↓
database_handler.handle(req) routes to _create_game()
    ↓
_create_game() inserts into SQLite games table
    ↓
Returns { game: { id, name, ... } }
    ↓
Frontend receives response
    ↓
closeModal(modalGame)
fetchGames()  ← Refreshes game list
    ↓
renderGames(data) updates display grid
    ↓
User sees new game in the list
```

### Adding a Platform

```
User clicks "Add Platform"
    ↓
btnAddPlatform.addEventListener('click', () => {
    formPlatform.reset()
    openModal(modalPlatform)
})
    ↓
Modal opens with empty form
    ↓
User fills form and clicks "Save"
    ↓
formPlatform.addEventListener('submit', async (e) => {
    e.preventDefault()
    const platformData = { name, type, icon_url, ... }
    fetch('/plugins/database_handler/platforms', {
        method: 'POST',
        body: JSON.stringify(platformData)
    })
})
    ↓
Backend receives POST request
    ↓
database_handler.handle(req) routes to _create_platform()
    ↓
_create_platform() generates ID from name and inserts into SQLite
    ↓
Returns { platform: { id, name, type, ... } }
    ↓
Frontend receives response
    ↓
closeModal(modalPlatform)
fetchPlatforms()  ← Refreshes platform list
    ↓
renderPlatforms(data) updates display grid
    ↓
User sees new platform in the list
```

## Request/Response Examples

### POST /plugins/database_handler/games

**Request:**
```json
{
  "name": "Cyberpunk 2077",
  "description": "A story-driven, open world RPG",
  "cover_image_url": "https://example.com/cover.jpg",
  "trailer_url": "https://example.com/trailer.mp4",
  "platforms": ["steam", "gog"]
}
```

**Response (200):**
```json
{
  "game": {
    "id": 1,
    "name": "Cyberpunk 2077",
    "description": "A story-driven, open world RPG",
    "cover_image_url": "https://example.com/cover.jpg",
    "trailer_url": "https://example.com/trailer.mp4",
    "platforms": ["steam", "gog"]
  }
}
```

### POST /plugins/database_handler/platforms

**Request:**
```json
{
  "name": "Steam",
  "type": "Digital",
  "icon_url": "https://example.com/steam.png"
}
```

**Response (200):**
```json
{
  "platform": {
    "id": "steam",
    "name": "Steam",
    "type": "Digital",
    "icon_url": "https://example.com/steam.png"
  }
}
```

## Error Handling

### Invalid Request (Missing Required Field)

**Request:**
```json
{
  "description": "Missing name field"
}
```

**Response (400):**
```json
{
  "error": "name is required"
}
```

**Frontend:**
```javascript
if (!res.ok) {
    const err = await res.json()
    alert(`Error: ${err.error}`)  // Shows: "Error: name is required"
    return
}
```

## Thread Safety

- Server uses `ThreadingHTTPServer` (one thread per request)
- Database connections created per-request (thread-safe)
- Plugin cache protected by `_PLUGIN_LOCK` (thread-safe)
- No shared mutable state in handlers

## Performance Considerations

- Database queries are simple (no complex joins yet)
- No pagination implemented (all games/platforms loaded at once)
- No caching (fresh data on each fetch)
- Images loaded from external URLs (can be slow)

## Future Improvements

1. Add pagination to game/platform lists
2. Implement search/filter on backend
3. Add database indexes for faster queries
4. Cache platform list in frontend
5. Add loading spinners during API calls
6. Implement optimistic UI updates
7. Add request debouncing for search
8. Implement edit mode with pre-filled forms
