# Platform Filter - Quick Start Guide

## What Changed

### Before ❌
```html
<div class="platform-filters">
    <!-- These are placeholders; JS should populate actual platform list -->
    <button class="filter-btn active" data-platform="all">All</button>
    <button class="filter-btn" data-platform="Steam">Steam</button>
    <button class="filter-btn" data-platform="PS5">PS5</button>
    <button class="filter-btn" data-platform="Switch">Switch</button>
</div>
```
- Hard-coded platform buttons
- No connection to database
- Buttons didn't actually filter anything

### After ✅
```javascript
// Dynamically fetches platforms from database
await populatePlatformFilters()

// Creates buttons for each platform in database
// Clicking a button filters games by that platform
// "All" button shows all games
```

## How to Use

### 1. **Add Some Platforms**
- Click "Add Platform"
- Enter: "Steam", "PlayStation 5", "Nintendo Switch", "GOG"
- Click "Save" for each

### 2. **Add Some Games**
- Click "Add Game"
- Add "Cyberpunk 2077" on Steam and GOG
- Add "Elden Ring" on PlayStation 5
- Add "Zelda: Breath of the Wild" on Nintendo Switch

### 3. **Test Filtering**
- Click "Steam" filter → shows only Cyberpunk 2077
- Click "PlayStation 5" filter → shows only Elden Ring
- Click "Nintendo Switch" filter → shows only Zelda
- Click "All" filter → shows all 3 games

## Code Changes

### New Functions Added to `app.js`

```javascript
// Populate filter buttons from database
async function populatePlatformFilters() {
    // Fetch platforms from backend
    // Create a button for each platform
    // Wire up click handlers to filter games
}

// Filter games by selected platform
function filterGamesByPlatform(platformId) {
    // Update active button styling
    // Filter allGames array
    // Re-render filtered games
}
```

### State Management

```javascript
let currentPlatformFilter = 'all'  // Currently selected filter
let allGames = []                  // All games from database
```

### Initialization

```javascript
// On page load:
(async () => {
    await populatePlatformFilters()  // Create filter buttons
    fetchGames()                      // Load and filter games
})()
```

## How It Works

### Step 1: Fetch Platforms
```
GET /plugins/database_handler/platforms
↓
Returns: { platforms: [
    { id: "steam", name: "Steam", type: "Digital" },
    { id: "playstation_5", name: "PlayStation 5", type: "Physical" },
    ...
]}
```

### Step 2: Create Buttons
```javascript
platforms.forEach(p => {
    const btn = document.createElement('button')
    btn.setAttribute('data-platform', p.id)
    btn.textContent = p.name
    btn.addEventListener('click', () => filterGamesByPlatform(p.id))
    platformFiltersContainer.appendChild(btn)
})
```

### Step 3: Filter Games
```javascript
// User clicks "Steam" button
filterGamesByPlatform('steam')

// Filter allGames array
const filtered = allGames.filter(game => {
    return game.platforms.includes('steam')
})

// Render filtered games
renderGames(filtered)
```

## Visual Flow

```
┌─────────────────────────────────────────┐
│         Page Loads                      │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  populatePlatformFilters()              │
│  - Fetch platforms from database        │
│  - Create button for each platform      │
│  - Wire up click handlers               │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  fetchGames()                           │
│  - Fetch all games from database        │
│  - Store in allGames array              │
│  - Apply current filter                 │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  filterGamesByPlatform('all')           │
│  - Show all games                       │
│  - Render to display grid               │
└─────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  User clicks "Steam" filter button      │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  filterGamesByPlatform('steam')         │
│  - Filter allGames to only Steam games  │
│  - Update active button styling         │
│  - Render filtered games                │
└─────────────────────────────────────────┘
```

## Testing Checklist

- [ ] Page loads and filter buttons appear for each platform
- [ ] Clicking a platform button filters games correctly
- [ ] Clicking "All" shows all games
- [ ] Adding a new platform adds a new filter button
- [ ] Adding a game on a platform shows it when that filter is active
- [ ] Filter buttons have correct styling (active button highlighted)
- [ ] No console errors

## Performance

- ✅ Filter buttons created once on page load
- ✅ Filtering done in-memory (no database queries)
- ✅ Fast rendering (only filtered games rendered)
- ✅ No lag when clicking filter buttons

## Browser DevTools Tips

### Check Filter Buttons
```javascript
// In Console:
document.querySelectorAll('.filter-btn')
// Should show buttons for each platform
```

### Check Current Filter
```javascript
// In Console:
currentPlatformFilter
// Should show 'all' or platform ID
```

### Check All Games
```javascript
// In Console:
allGames
// Should show array of all games from database
```

### Check Filtered Games
```javascript
// In Console:
document.querySelectorAll('.game-card').length
// Should show number of games currently displayed
```

## Troubleshooting

### Filter buttons don't appear
- Check browser console for errors
- Verify platforms exist in database
- Check Network tab for `/plugins/database_handler/platforms` request

### Filtering doesn't work
- Check that games have platforms assigned
- Verify platform IDs match between games and filter buttons
- Check browser console for JavaScript errors

### New platform doesn't appear in filters
- Verify platform was saved successfully
- Refresh page to reload filters
- Check that `populatePlatformFilters()` is called after adding platform

## Files Modified

- `public/js/app.js` - Added filter functions and initialization
- No HTML changes needed (filter HTML already present)
- No CSS changes needed (filter styles already present)
