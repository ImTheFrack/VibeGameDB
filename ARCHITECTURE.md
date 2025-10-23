# Frontend CRUD Architecture

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser (Frontend)                        │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              public/index.html (SPA Shell)                │   │
│  │  - Header with buttons (Add Game, Add Platform, Import)   │   │
│  │  - Tabs (Games, Platforms)                                │   │
│  │  - Display grid (renders cards)                           │   │
│  │  - Modals (game form, platform form, import form)         │   │
│  └───────────────────────────────────────────────────────────┘   │
│                              ▲                                   │
│                              │                                   │
│                         (renders)                                │
│                              │                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │            public/js/main.js (Entry, ES Modules)          │   │
│  │                                                           │   │
│  │  Modules & Responsibilities:                              │   │
│  │  - main.js: bootstraps app, loads config, seeds DB,       │   │
│  │    initializes events, ensures Games tab selected         │   │
│  │  - state.js: centralized state (games/platforms/filters)  │   │
│  │  - api.js: fetch helpers for plugin endpoints             │   │
│  │  - render.js: renderGames/renderPlatforms                 │   │
│  │  - filters.js: extractAllTags/applyFilters/UI counts      │   │
│  │  - modals.js: modal helpers, filter/add-to-platform UI    │   │
│  │  - events.js: DOM wiring, form submit handlers, tabs      │   │
│  │  - utils.js: shared helpers (e.g., escaping, normalization) │   │
│  │                                                           │   │
│  │  Form Handlers (via events.js):                           │   │
│  │  - formGame.addEventListener('submit', ...)               │   │
│  │  - formPlatform.addEventListener('submit', ...)           │   │
│  │                                                           │   │
│  │  API Calls (via api.js):                                  │   │
│  │  - fetchGames() → GET /plugins/database_handler/games     │   │
│  │  - fetchPlatforms() → GET /plugins/database_handler/...   │   │
│  │  - POST/PUT to create/update games and platforms          │   │
│  │                                                           │   │
│  │  Rendering (via render.js):                               │   │
│  │  - renderGames(data)                                      │   │
│  │  - renderPlatforms(data)                                  │   │
│  │                                                           │   │
│  │  Filtering & Display (via filters.js & modals.js):        │   │
│  │  - applyFilters() — multi-criteria filtering              │   │
│  │  - populateFilterModal() — populate filter options        │   │
│  │  - updateActiveFiltersDisplay() — show active filters     │   │
│  │  - displayOptions stored in state; applied by render.js   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                              ▲                                   │
│                              │                                   │
│                         (HTTP/JSON)                              │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
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
        │  - ThreadingHTTPServer                       │
        │  - Plugin loader (loads handlers/)           │
        │  - Routes /plugins/<name> to handlers        │
        └──────────────────────────────────────────────┘
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │    handlers/*.py (Plugin Modules)            │
        │                                              │
        │  handle(req) function routes to sub-handlers:│
        │  - database_handler: CRUD for all data models│
        │  - import_handler: CSV import/export logic   │
        │  - ai_handler: AI-based data enrichment      │
        │  - seed_handler: Initial database seeding    │
        └──────────────────────────────────────────────┘
                               │
                               ▼
        ┌───────────────────────────────────────────────┐
        │         SQLite Database                       │
        │      (path from config.DATABASE_FILE)         │
        │                                               │
        │  Tables:                                      │
        │  - games (id, name, tags, is_remake, ...)     │
        │  - platforms (id, name, supports_digital,     │
        │    supports_physical, ...)                    │
        │  - game_platforms (id, game_id, platform_id,  │
        │    is_digital, acquisition_method)            │
        └───────────────────────────────────────────────┘
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

### Bulk Editing Workflow

The application supports bulk operations on games, allowing users to edit, delete, or manage platform associations for multiple items at once.

```
User clicks "Select Multiple"
    ↓
state.selection.enabled = true
renderBulkActionsBar() shows the bar
applyFilters() re-renders grid with checkboxes
    ↓
User checks boxes on several game cards
    ↓
cardCheckbox.addEventListener('change', ...)
    - Adds game ID to state.selection.selectedGameIds
    - Adds .selected-card class to card
    - renderBulkActionsBar() updates selected count
    ↓
User clicks "Edit" on the bulk actions bar
    ↓
bulkActionBar.addEventListener('click', ...)
    - Opens #modal-bulk-edit
    ↓
User chooses a bulk action from the modal (e.g., "Assign to Platform")
    ↓
bulkActionsContainer.addEventListener('click', ...)
    - Constructs payload: { action, item_type, ids, params }
    - postBulkOperation(payload) → POST /plugins/database_handler/bulk
    ↓
Backend receives POST request
    ↓
database_handler.handle(req) routes to _bulk_operations()
    ↓
_bulk_operations() iterates through IDs and performs the action
(e.g., INSERT into game_platforms for each game ID)
    ↓
Returns { message: "Successfully processed X of Y items." }
    ↓
Frontend receives response, closes modal, and refreshes data
```

#### Bulk Field Editing

Editing specific fields (like tags or release year) is a special two-step bulk action:

1.  From the main bulk actions modal, the user clicks **"Edit Game Fields"**.
2.  The app calls `showBulkEditGameModal()`, which re-purposes the standard game form (`#modal-game`) for bulk editing.
    - Checkboxes appear next to each field.
    - A field is only included in the update if its corresponding checkbox is ticked.
    - On submit, the frontend sends an `edit_fields` action to the `/plugins/database_handler/bulk` endpoint.

**Request (Bulk Edit Fields):**
```json
{
  "action": "edit_fields",
  "item_type": "game",
  "ids": [1, 5, 12],
  "params": {
    "tags": ["updated-tag", "bulk-edited"],
    "release_year": 2024
  }
}
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

## Frontend Filtering System

### Filter Architecture

The filtering system uses a centralized state object and modal-based UI:

```javascript
let currentFilters = {
    keyword: '',      // Text search in name/description
    platforms: [],    // Array of platform IDs
    tags: []          // Array of tag strings
};
```

### Filter Types

1. **Keyword Search**: Case-insensitive search across game name and description
2. **Platform Filtering**: Multi-select checkboxes for platforms (dynamically populated from database)
3. **Tag Filtering**: Multi-select checkboxes for tags (dynamically extracted from all games)

### Filter Application Logic

```javascript
function applyFilters() {
    if (currentTab !== 'games') return;
    
    let filtered = allGames;
    
    // Filter by keyword (name or description)
    if (currentFilters.keyword) {
        const keyword = currentFilters.keyword.toLowerCase();
        filtered = filtered.filter(game => 
            game.name.toLowerCase().includes(keyword) ||
            (game.description && game.description.toLowerCase().includes(keyword))
        );
    }
    
    // Filter by platforms (OR logic: game must be on at least one selected platform)
    if (currentFilters.platforms.length > 0) {
        filtered = filtered.filter(game => {
            return currentFilters.platforms.some(platformId =>
                allGamePlatforms.some(gp => gp.game_id === game.id && gp.platform_id === platformId)
            );
        });
    }
    
    // Filter by tags (OR logic: game must have at least one selected tag)
    if (currentFilters.tags.length > 0) {
        filtered = filtered.filter(game => {
            const gameTags = game.tags || [];
            return currentFilters.tags.some(tag => gameTags.includes(tag));
        });
    }
    
    renderGames(filtered);
}
```

### Filter Modal UI

- **Keyword Input**: Text field for name/description search
- **Platform Checkboxes**: Dynamically populated from `allPlatforms`
- **Tag Checkboxes**: Dynamically extracted from `allGames` tags
- **Apply Button**: Applies filters and closes modal
- **Clear All Button**: Resets all filters to empty state
- **Active Filter Display**: Shows summary of active filters below filter button

### Smart Tab Integration

- Filter button only appears on the Games tab
- Filter button hidden on Platforms tab
- Tab switching properly manages filter button visibility
- Filters persist when switching tabs and returning to Games

### Extensibility

To add a new filter type:

1. Add new property to `currentFilters` object
2. Add new section to filter modal HTML
3. Add checkbox population logic to `populateFilterModal()`
4. Add filter criteria to `applyFilters()` function
5. Update `updateActiveFiltersDisplay()` to show new filter

### Potential Future Filters

- Acquisition method (bought, free, bundle, gift, subscription)
- Remake/Remaster status (Original, Remake, Remaster)
- Year acquired (date range)
- Platform format (Digital/Physical)
- Description length or other metadata

## Frontend Display Controls System

### Display Options Architecture

The display system allows users to customize which elements appear on game cards:

```javascript
let displayOptions = {
    show_cover: true,
    show_title: true,
    show_description: true,
    show_tags: true,
    show_platforms: true
};
```

### Display Modal UI

- **Checkboxes**: One for each card element (cover, title, description, tags, platforms)
- **Apply Button**: Applies display options and re-renders cards immediately
- **Reset Button**: Restores all display options to default (all visible)

### Display Application Logic

```javascript
function applyDisplayOptions() {
    renderGames(currentFilteredGames);
}
```

The `renderGames()` function checks `displayOptions` when building each card and conditionally includes elements.

### Visual Feedback

- Display button shows a count when any option is hidden (similar to Filter button)
- Active display state can be indicated with CSS class `.display-options-on`

### Future Enhancements

- Persist `displayOptions` to localStorage so user preferences survive page reloads
- Persist `displayOptions` to URL query parameters for shareable filter/display states
- Add keyboard accessibility (Tab focus, Space/Enter to toggle)
- Add ARIA attributes for screen readers
- Animate pill clicks with small visual feedback
- Show active filters as removable chips near controls bar

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
12. Persist filter and display state to localStorage/URL
13. Add keyboard shortcuts and accessibility improvements
