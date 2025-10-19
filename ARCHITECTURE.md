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
        │  handle(req) function routes to:             │
        │  - Games: _list, _create, _update, _delete   │
        │  - Platforms: _list, _create, _update, _del  │
        │  - Game-Platforms: _list, _create, _update,  │
        │    _delete ✨ NEW                            │
        └──────────────────────────────────────────────┘
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │         SQLite Database                      │
        │         (data/gamedb.sqlite)                 │
        │                                              │
        │  Tables:                                      │
        │  - games (id, name, tags, is_remake, ...)    │
        │  - platforms (id, name, supports_digital,    │
        │    supports_physical, ...)                   │
        │  - game_platforms (id, game_id, platform_id, │
        │    is_digital, acquisition_method) ✨ NEW    │
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
    const platformData = { 
        name, 
        supports_digital, 
        supports_physical,
        icon_url, 
        image_url,
        year_acquired,
        ...
    }
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
_create_platform() validates at least one format is supported
    ↓
Generates ID from name and inserts into SQLite
    ↓
Returns { platform: { id, name, supports_digital, supports_physical, ... } }
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

### Adding a Game to a Platform (NEW)

```
User clicks "Add Platform" button on game card
    ↓
addToPlat.addEventListener('click', async (e) => {
    currentGameId = gameId
    await populateAddToPlatformForm()
    openModal(modalAddToPlatform)
})
    ↓
Modal opens with platform dropdown and format options
    ↓
User selects platform, chooses digital/physical, selects acquisition method
    ↓
formAddToPlatform.addEventListener('submit', async (e) => {
    e.preventDefault()
    const gamePlatformData = {
        game_id: currentGameId,
        platform_id: selectedPlatform,
        is_digital: true/false,
        acquisition_method: "bought"
    }
    fetch('/plugins/database_handler/game_platforms', {
        method: 'POST',
        body: JSON.stringify(gamePlatformData)
    })
})
    ↓
Backend receives POST request
    ↓
database_handler.handle(req) routes to _create_game_platform()
    ↓
_create_game_platform() validates:
  - Game exists
  - Platform exists
  - Platform supports the requested format
  - No duplicate game-platform-format combinations
    ↓
Inserts into game_platforms table
    ↓
Returns { game_platform: { id, game_id, platform_id, is_digital, ... } }
    ↓
Frontend receives response
    ↓
closeModal(modalAddToPlatform)
fetchGames()  ← Refreshes game list with new platform link
    ↓
renderGames(data) updates display grid
    ↓
User sees game card now shows the new platform with format indicator
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
  "is_remake": false,
  "is_remaster": false,
  "related_game_id": null,
  "tags": ["action", "RPG", "sci-fi"]
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
    "is_remake": false,
    "is_remaster": false,
    "related_game_id": null,
    "tags": ["action", "RPG", "sci-fi"],
    "created_at": "2025-01-15T10:30:00",
    "updated_at": "2025-01-15T10:30:00"
  }
}
```

### POST /plugins/database_handler/platforms

**Request:**
```json
{
  "name": "PlayStation 5",
  "supports_digital": true,
  "supports_physical": true,
  "icon_url": "https://example.com/ps5.png",
  "image_url": "https://example.com/ps5-banner.jpg",
  "description": "Sony's latest console",
  "year_acquired": 2021
}
```

**Response (200):**
```json
{
  "platform": {
    "id": "playstation_5",
    "name": "PlayStation 5",
    "supports_digital": true,
    "supports_physical": true,
    "icon_url": "https://example.com/ps5.png",
    "image_url": "https://example.com/ps5-banner.jpg",
    "description": "Sony's latest console",
    "year_acquired": 2021,
    "created_at": "2025-01-15T10:30:00",
    "updated_at": "2025-01-15T10:30:00"
  }
}
```

### POST /plugins/database_handler/game_platforms (NEW)

**Request:**
```json
{
  "game_id": 1,
  "platform_id": "steam",
  "is_digital": true,
  "acquisition_method": "bought"
}
```

**Response (200):**
```json
{
  "game_platform": {
    "id": 1,
    "game_id": 1,
    "platform_id": "steam",
    "is_digital": true,
    "acquisition_method": "bought",
    "created_at": "2025-01-15T10:30:00",
    "updated_at": "2025-01-15T10:30:00"
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

### Platform Format Constraint Violation

**Request (trying to add physical copy to digital-only platform):**
```json
{
  "game_id": 1,
  "platform_id": "steam",
  "is_digital": false,
  "acquisition_method": "bought"
}
```

**Response (400):**
```json
{
  "error": "platform steam does not support physical distribution"
}
```

### Platform Must Support At Least One Format

**Request (creating platform with no formats):**
```json
{
  "name": "Invalid Platform",
  "supports_digital": false,
  "supports_physical": false
}
```

**Response (400):**
```json
{
  "error": "platform must support at least digital or physical"
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

## Data Model Notes

### Game-Platform Relationship
- Games are now independent entities (no embedded platforms array)
- Platforms are independent entities (no embedded games array)
- The `game_platforms` junction table manages the many-to-many relationship
- Each entry specifies whether the copy is digital or physical
- A game can appear multiple times on the same platform (once for digital, once for physical)

### Cascade Behavior
- Deleting a game cascades to delete all its `game_platforms` entries
- Deleting a platform cascades to delete all its `game_platforms` entries
- Orphaned games (with no platforms) are allowed but should be handled carefully

### Validation Rules
- Platform must support at least one format (digital or physical)
- Can't create a digital game-platform link if platform doesn't support digital
- Can't create a physical game-platform link if platform doesn't support physical
- Duplicate game-platform-format combinations are prevented by UNIQUE constraint

## Future Improvements

1. Add pagination to game/platform lists
2. Implement search/filter on backend
3. Add database indexes for faster queries
4. Cache platform list in frontend
5. Add loading spinners during API calls
6. Implement optimistic UI updates
7. Add request debouncing for search
8. Implement edit mode with pre-filled forms
9. Add delete confirmation dialogs
10. Implement bulk operations (add multiple games to a platform)
11. Add support for game remakes/remasters linking
12. Implement tag-based filtering and search
