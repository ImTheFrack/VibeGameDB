# Platform Format Refactor: Digital & Physical Support

## Overview

This refactor addresses the logic that platforms can support **both** digital and physical distribution. Previously, platforms were assumed to be either digital OR physical. Now:

- **Platforms** have two boolean flags: `supports_digital` and `supports_physical`
- **Games** link to platforms via a junction table (`game_platforms`) that specifies the format for each copy
- A game can exist on the same platform in both digital and physical formats

## Changes Made

### 1. Database Schema (`handlers/database_handler.py`)

#### `platforms` table
- **Removed:** `type` column (was "digital" or "physical")
- **Added:** `supports_digital` (BOOLEAN, default 1)
- **Added:** `supports_physical` (BOOLEAN, default 0)
- **Added:** `image_url`, `description`, `year_acquired` columns
- **Added:** `created_at`, `updated_at` timestamps

#### `games` table
- **Removed:** `platforms` JSON column (was a list of platform IDs)
- **Added:** `is_remake`, `is_remaster`, `related_game_id`, `tags` columns
- **Added:** `created_at`, `updated_at` timestamps

#### `game_platforms` table (NEW)
- **Purpose:** Junction table linking games to platforms with format information
- **Columns:**
  - `id` (INTEGER PRIMARY KEY)
  - `game_id` (INTEGER, FK to games)
  - `platform_id` (TEXT, FK to platforms)
  - `is_digital` (BOOLEAN) — true for digital, false for physical
  - `acquisition_method` (TEXT) — "bought", "free", "bundle", "gift", "subscription", etc.
  - `created_at`, `updated_at` (TIMESTAMP)
- **Constraints:**
  - UNIQUE(game_id, platform_id, is_digital) — prevents duplicate entries
  - Validates that platform supports the requested format

### 2. API Changes

#### New Endpoint: `/plugins/database_handler/game_platforms`

**GET /plugins/database_handler/game_platforms**
- List all game-platform links
- Optional query params: `?game_id=<int>` or `?platform_id=<str>` to filter

**POST /plugins/database_handler/game_platforms**
- Create a new game-platform link
- Request body:
  ```json
  {
    "game_id": 1,
    "platform_id": "steam",
    "is_digital": true,
    "acquisition_method": "bought"
  }
  ```
- Validates that:
  - Game exists
  - Platform exists
  - Platform supports the requested format (digital/physical)
  - No duplicate game-platform-format combinations

**PUT/PATCH /plugins/database_handler/game_platforms/<id>**
- Update a game-platform link (currently only `acquisition_method`)

**DELETE /plugins/database_handler/game_platforms/<id>**
- Remove a game-platform link

#### Updated Endpoints

**POST /plugins/database_handler/platforms**
- Request now includes `supports_digital` and `supports_physical` instead of `type`
- Validates that at least one format is supported
- Response includes all new fields

**POST /plugins/database_handler/games**
- Request no longer includes `platforms` array
- Now includes `is_remake`, `is_remaster`, `related_game_id`, `tags`
- Games are linked to platforms via separate `/game_platforms` endpoint

### 3. Documentation Updates

#### README.md
- Updated `platforms` table schema with new columns
- Updated `games` table schema (removed platforms column)
- Updated `game_platforms` table schema with new `is_digital` column and constraints

#### ARCHITECTURE.md
- Updated request/response examples for games and platforms
- Added new examples for `game_platforms` endpoint

## Migration Path (if needed)

If you have existing data, you'll need to:

1. **Backup** your current database
2. **Run** the new schema (it will create fresh tables)
3. **Migrate** data:
   - For each platform, determine if it's digital-only, physical-only, or both
   - Set `supports_digital` and `supports_physical` accordingly
   - For each game-platform relationship, create a `game_platforms` entry with `is_digital` set appropriately

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

## Frontend Implications

When adding a game to a platform, the UI should now:

1. Show the platform name
2. Ask: "Is this copy digital or physical?"
3. Validate that the platform supports the selected format
4. Create a `game_platforms` entry with the appropriate `is_digital` value

Example flow:
```
User: "Add Elden Ring to PlayStation 5"
UI: "Is this digital or physical?"
User: "Physical"
UI: Validates PS5 supports physical → Creates game_platforms entry
```

## Testing

The integration test (`scripts/db_integration_test.py`) should be updated to:

1. Create platforms with both `supports_digital` and `supports_physical`
2. Create games without platforms
3. Link games to platforms via `game_platforms` endpoint
4. Verify constraints (e.g., can't link digital to physical-only platform)

## Next Steps

1. ✅ Update database schema
2. ✅ Update API endpoints
3. ✅ Update documentation
4. ⏳ Update frontend (`public/js/app.js`, `public/index.html`)
5. ⏳ Update integration tests
6. ⏳ Test end-to-end workflow
