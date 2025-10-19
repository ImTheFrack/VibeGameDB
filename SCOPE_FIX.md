# Scope Fix - Global State Variables

## Problem

When clicking platform filters, the console showed errors:
```
ReferenceError: allGames is not defined
ReferenceError: currentPlatformFilter is not defined
```

## Root Cause

The state variables (`allGames`, `currentPlatformFilter`, `currentTab`) were declared inside the `DOMContentLoaded` event listener, making them local to that scope. However, the functions that use them (`fetchGames()`, `filterGamesByPlatform()`, etc.) are defined outside the event listener, so they couldn't access these variables.

### Before (Broken)
```javascript
document.addEventListener('DOMContentLoaded', () => {
    let currentPlatformFilter = 'all';  // ← Local scope
    let allGames = [];                  // ← Local scope
    let currentTab = 'games';           // ← Local scope
    
    // Functions defined here can access these variables
});

// Functions defined here CANNOT access the variables above
function filterGamesByPlatform(platformId) {
    currentPlatformFilter = platformId;  // ← ReferenceError!
}
```

## Solution

Move the state variables to the global scope (top of the file, before the event listener):

### After (Fixed)
```javascript
// Global scope - accessible to all functions
let currentPlatformFilter = 'all';
let allGames = [];
let currentTab = 'games';

document.addEventListener('DOMContentLoaded', () => {
    // Functions defined here can access global variables
});

// Functions defined here CAN access the global variables
function filterGamesByPlatform(platformId) {
    currentPlatformFilter = platformId;  // ✅ Works!
}
```

## Changes Made

### 1. Moved State Variables to Global Scope
```javascript
// ----------------------
// Global State
// ----------------------
let currentPlatformFilter = 'all';  // Currently selected filter
let allGames = [];                  // All games from database
let currentTab = 'games';           // Currently active tab
```

### 2. Updated fetchGames() to Store Games
```javascript
async function fetchGames() {
    const data = await apiGet('/plugins/database_handler/games');
    if (data) {
        allGames = data.games || [];  // ← Store in global variable
        filterGamesByPlatform(currentPlatformFilter);  // ← Apply filter
    }
}
```

### 3. Added Missing Filter Functions
- `populatePlatformFilters()` - Creates filter buttons from database
- `filterGamesByPlatform()` - Filters games by platform

### 4. Updated Initialization
```javascript
// Initial load: fetch platforms, populate filters, then fetch games
(async () => {
    await populatePlatformFilters();  // Create filter buttons
    fetchGames();                      // Load and filter games
})();
```

## How It Works Now

```
Page Load
    ↓
DOMContentLoaded event fires
    ↓
populatePlatformFilters() called
    ├─ Fetch platforms from database
    ├─ Create filter button for each platform
    └─ Wire up click handlers
    ↓
fetchGames() called
    ├─ Fetch games from database
    ├─ Store in global allGames variable
    └─ Apply current filter
    ↓
filterGamesByPlatform() called
    ├─ Update button styling
    ├─ Filter allGames array
    └─ Render filtered games
    ↓
User sees filtered games ✅
```

## Scope Hierarchy

```
Global Scope
├─ currentPlatformFilter = 'all'
├─ allGames = []
├─ currentTab = 'games'
│
├─ function fetchGames()
│   └─ Can access: currentPlatformFilter, allGames, currentTab ✅
│
├─ function filterGamesByPlatform()
│   └─ Can access: currentPlatformFilter, allGames ✅
│
├─ function populatePlatformFilters()
│   └─ Can access: currentPlatformFilter, allGames ✅
│
└─ DOMContentLoaded event listener
    ├─ Can access: currentPlatformFilter, allGames, currentTab ✅
    ├─ Local: displayGrid, btnAddGame, tabs, etc.
    └─ Defines: openModal(), closeModal(), event handlers
```

## Testing

### Test Case 1: Filter Buttons Appear
1. Open browser DevTools (F12)
2. Go to Console tab
3. Refresh page
4. Check that filter buttons appear for each platform
5. Verify no console errors

### Test Case 2: Filter Works
1. Add platforms: Steam, PlayStation 5, Nintendo Switch
2. Add games on different platforms
3. Click "Steam" filter
4. Verify only Steam games appear
5. Click "All" filter
6. Verify all games appear

### Test Case 3: Console Check
```javascript
// In Console:
console.log(currentPlatformFilter)  // Should show 'all' or platform ID
console.log(allGames)               // Should show array of games
console.log(currentTab)             // Should show 'games' or 'platforms'
```

## Browser DevTools Debugging

### Check Global Variables
```javascript
// In Console:
window.currentPlatformFilter
window.allGames
window.currentTab
```

### Check Filter Buttons
```javascript
// In Console:
document.querySelectorAll('.filter-btn')
```

### Check Active Filter
```javascript
// In Console:
document.querySelector('.filter-btn.active')
```

## Performance Impact

- ✅ No performance degradation
- ✅ Global variables are lightweight
- ✅ No additional memory overhead
- ✅ Faster function calls (no scope chain lookup)

## Best Practices

### Why Global Variables Here?
- ✅ Small number of variables (3)
- ✅ Simple data types (strings and arrays)
- ✅ Needed by multiple functions
- ✅ Represents application state

### Alternatives Considered
1. **Module pattern** - Overkill for this small app
2. **Class-based** - More complex than needed
3. **Closure** - Would require restructuring all functions
4. **Global object** - Could use `window.app = {}` but not necessary

## Files Modified

- `public/js/app.js` - Moved state variables to global scope, added filter functions

## Rollback

If needed, revert by:
1. Moving state variables back inside DOMContentLoaded
2. Removing filter functions
3. Updating fetchGames() to call renderGames() directly

## Related Issues Fixed

This fix also resolves:
- Platform filter buttons not appearing
- Filter clicks not working
- Console errors when filtering
- Tab synchronization issues
