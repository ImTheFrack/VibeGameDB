# Platform Format Refactor: Digital & Physical Support

## Overview

This refactor enables platforms to support **both** digital and physical distribution. Previously, platforms were assumed to be either digital OR physical. Now:

- **Platforms** have two boolean flags: `supports_digital` and `supports_physical`
- **Games** link to platforms via a junction table (`game_platforms`) that specifies the format for each copy
- A game can exist on the same platform in both digital and physical formats

**Status:** ✅ Implementation Complete - All 5 steps finished and tested

## Files Modified

### 1. Backend: Database Schema (`handlers/database_handler.py`)

**Changes:**
- ✅ Updated `DB_SCHEMA` with new table structures:
  - `platforms`: Added `supports_digital`, `supports_physical` (removed `type`)
  - `games`: Removed `platforms` JSON column, added `is_remake`, `is_remaster`, `related_game_id`, `tags`, timestamps
  - `game_platforms`: New junction table with `is_digital` flag and validation
- ✅ Updated helper functions:
  - `_game_row_to_dict()`: Now includes all game fields
  - `_platform_row_to_dict()`: Now includes digital/physical flags
  - `_game_platform_row_to_dict()`: New helper for junction table
- ✅ Updated CRUD operations:
  - `_create_game()`: Accepts tags, remake/remaster flags
  - `_update_game()`: Can update all game fields
  - `_create_platform()`: Validates at least one format is supported
  - `_update_platform()`: Can update all platform fields
- ✅ New CRUD operations for `game_platforms`:
  - `_list_game_platforms()`: List with optional filtering by game_id or platform_id
  - `_create_game_platform()`: Validates platform supports the requested format
  - `_update_game_platform()`: Update acquisition method
  - `_delete_game_platform()`: Remove a link
- ✅ Updated `handle()` routing to support `/game_platforms` endpoint

### 2. Frontend: HTML (`public/index.html`)
**Changes:**
- ✅ Updated game form:
  - Changed `title` field to `name`
  - Added `is_remake` and `is_remaster` checkboxes
  - Added `tags` text input (comma-separated)
  - Removed `platforms` multi-select (now handled separately)
- ✅ Updated platform form:
  - Replaced `type` dropdown with `supports_digital` and `supports_physical` checkboxes
  - Added `image_url` field
  - Added `year_acquired` field
- ✅ Added new modal: "Add Game to Platform"
  - Platform selector dropdown
  - Digital/Physical radio buttons
  - Acquisition method dropdown

### 3. Frontend: JavaScript (`public/js/app.js`)
**Changes:**
- ✅ Global state:
  - Added `allPlatforms` array
  - Added `allGamePlatforms` array
  - Added `currentGameId` for tracking which game is being linked
- ✅ Form handlers:
  - Updated `formGame` submission to handle new fields
  - Updated `formPlatform` submission with validation
  - Added `formAddToPlatform` submission handler
- ✅ API functions:
  - Updated `fetchGames()` to also fetch game-platform links
  - Added `fetchGamePlatforms()` to fetch junction table data
  - Updated `fetchPlatforms()` to cache platforms
  - Added `populateAddToPlatformForm()` to populate platform dropdown
- ✅ Filtering and rendering:
  - Updated `filterGamesByPlatform()` to use junction table
  - Updated `renderGames()` to:
    - Show platforms with format indicators (📱 digital, 💿 physical)
    - Display tags
    - Add "Add Platform" button
  - Updated `renderPlatforms()` to:
    - Show supported formats
    - Display game count
- ✅ Event handling:
  - Added click handler for "Add Platform" button
  - Updated modal management for new modal

### 4. Integration Tests (`scripts/db_integration_test.py`)
**Changes:**
- ✅ Restructured tests to follow new data model:
  - **Test 1:** Create platforms with digital/physical flags
  - **Test 2:** Create games without platforms
  - **Test 3:** Link games to platforms via game_platforms endpoint
  - **Test 4-5:** List and query games
  - **Test 6:** Update game with tags
  - **Test 7-8:** List and filter game-platform links
  - **Test 9:** Verify platform constraints
  - **Test 10-12:** Delete operations and cascade validation
  - **Test 13:** Error handling
- ✅ Added comprehensive validation tests:
  - Platform format constraints
  - Cascade deletion
  - Duplicate prevention
  - Required field validation

### 5. Documentation (`README.md`, `ARCHITECTURE.md`)
- ✅ Updated `platforms` table schema with new columns
- ✅ Updated `games` table schema (removed platforms column)
- ✅ Updated `game_platforms` table schema with constraints
- ✅ Updated request/response examples for games and platforms
- ✅ Added new examples for `game_platforms` endpoint

## API Endpoints

### Games
- `GET /plugins/database_handler/games` — List all games
- `GET /plugins/database_handler/games?id=<int>` — Get single game
- `POST /plugins/database_handler/games` — Create game
- `PUT /plugins/database_handler/games/<id>` — Update game
- `DELETE /plugins/database_handler/games/<id>` — Delete game

### Platforms
- `GET /plugins/database_handler/platforms` — List all platforms
- `POST /plugins/database_handler/platforms` — Create platform
- `PUT /plugins/database_handler/platforms/<id>` — Update platform
- `DELETE /plugins/database_handler/platforms/<id>` — Delete platform

### Game-Platform Links (NEW)
- `GET /plugins/database_handler/game_platforms` — List all links
- `GET /plugins/database_handler/game_platforms?game_id=<int>` — Filter by game
- `GET /plugins/database_handler/game_platforms?platform_id=<str>` — Filter by platform
- `POST /plugins/database_handler/game_platforms` — Create link
- `PUT /plugins/database_handler/game_platforms/<id>` — Update link
- `DELETE /plugins/database_handler/game_platforms/<id>` — Delete link

## Key Features

### Platform Support
- Platforms can support **both** digital and physical distribution
- Validation ensures games can only be linked to platforms that support the requested format
- Example: PlayStation 5 can have both digital and physical copies of the same game

### Game Metadata
- Games now include:
  - `is_remake` / `is_remaster` flags
  - `related_game_id` for linking remakes/remasters to originals
  - `tags` array for categorization
  - Timestamps for creation/update tracking

### Data Integrity
- Cascade deletion: Deleting a game removes all its platform links
- Unique constraint: Prevents duplicate game-platform-format combinations
- Format validation: Can't link a digital copy to a physical-only platform

### Frontend UX
- "Add Platform" button on each game card
- Modal to select platform and format (digital/physical)
- Platform cards show supported formats and game count
- Game cards display format indicators for each platform

## Testing

Run the integration test:
```bash
python scripts/db_integration_test.py
```

Expected output: All 13 tests pass with ✓ checkmarks

### Test Coverage
- **Test 1:** Create platforms with digital/physical flags
- **Test 2:** Create games without platforms
- **Test 3:** Link games to platforms via game_platforms endpoint
- **Test 4-5:** List and query games
- **Test 6:** Update game with tags
- **Test 7-8:** List and filter game-platform links
- **Test 9:** Verify platform constraints (can't add physical to digital-only platform)
- **Test 10-12:** Delete operations and cascade validation
- **Test 13:** Error handling (missing fields, invalid IDs, invalid platform formats)

## Migration Path (if needed)

If you have existing data:

1. **Backup** your current database
2. **Delete** `data/gamedb.sqlite` (or rename it)
3. **Run** the app to create a fresh database with the new schema
4. **Migrate** data using this pattern:
   - For each old platform: determine if digital-only, physical-only, or both
   - Set `supports_digital` and `supports_physical` accordingly
   - For each game-platform relationship: create a `game_platforms` entry with `is_digital` set appropriately

Example migration script (pseudo-code):
```python
# For each old platform entry:
# - If type == "digital": supports_digital=1, supports_physical=0
# - If type == "physical": supports_digital=0, supports_physical=1
# - If type == "both": supports_digital=1, supports_physical=1

# For each old game entry with platforms array:
# - For each platform in the array:
#   - Create game_platforms entry with is_digital based on platform type
```

## Next Steps

1. **Manual Testing:** Open the app in a browser and test:
   - Create a platform with both digital and physical support
   - Create a game
   - Add the game to the platform as both digital and physical
   - Verify both copies appear on the game card
   - Verify the platform card shows the correct game count

2. **UI Polish:** Consider adding:
   - Edit game modal with pre-filled data
   - Edit platform modal with pre-filled data
   - Delete confirmation dialogs
   - Loading states during API calls
   - Error toast notifications

3. **Additional Features:**
   - Search/filter by tags
   - Bulk operations (add multiple games to a platform)
   - Export/import functionality
   - Screenshots and media management

## Backward Compatibility

⚠️ **Breaking Change:** This refactor is not backward compatible with the old schema. If you have existing data, follow the migration path above.

## Summary

✅ **All 5 implementation steps completed:**
1. ✅ Database schema updated
2. ✅ API endpoints implemented
3. ✅ Documentation updated
4. ✅ Frontend updated
5. ✅ Integration tests updated

The platform format refactor is **production-ready** for testing and manual validation.
