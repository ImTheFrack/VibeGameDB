# Filter System Testing Guide

## Quick Start

### 1. Start the Server
```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '5000'
python main.py
```

### 2. Open in Browser
Navigate to `http://localhost:5000`

### 3. Initial Load
- Server should auto-seed database with test data if empty
- Games tab should display with test games
- Filter button should appear in games controls bar

## Test Scenarios

### Test 1: Filter Modal Opens/Closes
**Steps:**
1. Click "Filter" button in games controls bar
2. Verify filter modal appears with three sections:
   - Keyword search input
   - Platform checkboxes
   - Tag checkboxes
3. Click close button (X) in modal
4. Verify modal closes
5. Click outside modal content
6. Verify modal closes

**Expected Result:** Modal opens and closes correctly

---

### Test 2: Keyword Search
**Steps:**
1. Open filter modal
2. Type "test" in keyword input
3. Click "Apply"
4. Verify games are filtered to show only those with "test" in name or description
5. Clear keyword input
6. Click "Apply"
7. Verify all games are shown again

**Expected Result:** Keyword search filters games correctly

---

### Test 3: Platform Filtering
**Steps:**
1. Open filter modal
2. Check one platform checkbox (e.g., "TestPlatform")
3. Click "Apply"
4. Verify only games on that platform are shown
5. Check another platform checkbox
6. Click "Apply"
7. Verify games on either platform are shown (OR logic)
8. Uncheck all platforms
9. Click "Apply"
10. Verify all games are shown again

**Expected Result:** Platform filtering works with OR logic for multiple selections

---

### Test 4: Tag Filtering
**Steps:**
1. Open filter modal
2. Verify tag checkboxes are populated (should see: test, legendary, mythical, debugging)
3. Check one tag checkbox (e.g., "legendary")
4. Click "Apply"
5. Verify only games with that tag are shown
6. Check another tag checkbox (e.g., "mythical")
7. Click "Apply"
8. Verify games with either tag are shown (OR logic)
9. Uncheck all tags
10. Click "Apply"
11. Verify all games are shown again

**Expected Result:** Tag filtering works with OR logic for multiple selections

---

### Test 5: Combined Filters
**Steps:**
1. Open filter modal
2. Type "test" in keyword input
3. Check one platform checkbox
4. Check one tag checkbox
5. Click "Apply"
6. Verify games are filtered by ALL three criteria (AND logic)
   - Must contain "test" in name/description
   - Must be on selected platform
   - Must have selected tag
7. Modify one filter (e.g., add another platform)
8. Click "Apply"
9. Verify results update correctly

**Expected Result:** Multiple filters work together with AND logic

---

### Test 6: Clear All Filters
**Steps:**
1. Open filter modal
2. Set multiple filters (keyword, platform, tag)
3. Click "Apply"
4. Verify games are filtered
5. Click "Clear All"
6. Verify all filter inputs are cleared
7. Click "Apply"
8. Verify all games are shown again

**Expected Result:** Clear All button resets all filters

---

### Test 7: Active Filters Display
**Steps:**
1. Open filter modal
2. Set keyword filter to "test"
3. Check one platform
4. Check one tag
5. Click "Apply"
6. Verify active filters display appears below filter button showing:
   - Keyword: test
   - Platform: [platform name]
   - Tag: [tag name]
7. Modify filters and click "Apply"
8. Verify active filters display updates

**Expected Result:** Active filters display shows current filter state

---

### Test 8: Tab Switching
**Steps:**
1. Go to Games tab
2. Verify filter button is visible
3. Click Platforms tab
4. Verify filter button is hidden
5. Click Games tab
6. Verify filter button is visible again
7. Set some filters and click "Apply"
8. Switch to Platforms tab and back
9. Verify filters are still applied

**Expected Result:** Filter button visibility changes with tab, filter state persists

---

### Test 9: Modal Persistence
**Steps:**
1. Open filter modal
2. Set some filters (don't click Apply)
3. Close modal
4. Open filter modal again
5. Verify filter values are still there (not cleared)
6. Click "Apply"
7. Verify filters are applied

**Expected Result:** Filter modal preserves state across open/close

---

### Test 10: Empty Results
**Steps:**
1. Open filter modal
2. Set filters that match no games (e.g., keyword "xyz123")
3. Click "Apply"
4. Verify display shows "No games found" message

**Expected Result:** Handles empty results gracefully

---

## Debugging Tips

### If Filter Modal Doesn't Open
- Check browser console for JavaScript errors
- Verify `modalFilter` element exists in HTML
- Check that `btnFilter` element has correct ID

### If Platforms/Tags Don't Populate
- Check browser console for fetch errors
- Verify `/plugins/database_handler/platforms` endpoint returns data
- Verify games have tags in database
- Check `extractAllTags()` function in console

### If Filters Don't Apply
- Check browser console for errors in `applyFilters()` function
- Verify `currentFilters` object is being updated
- Check that `renderGames()` is being called with filtered results

### If Filter Button Doesn't Hide on Platforms Tab
- Check tab switching logic in `tabs.forEach()` event handler
- Verify `gamesControls` element visibility is being toggled

## Test Data

The application auto-seeds with:
- **TestGame**: name="TestGame", description="A test game", tags=["test", "legendary", "mythical", "debugging"]
- **TestPlatform**: name="TestPlatform", supports_digital=true, supports_physical=true
- **Link**: TestGame linked to TestPlatform with is_digital=true

This provides enough data to test all filter scenarios.

## Performance Notes

- Filter application should be instant for small datasets
- Tag extraction happens once per page load
- No noticeable lag with hundreds of games
- Suitable for typical game collections

## Known Limitations

- Filter state is not persisted to URL (could be added as enhancement)
- No saved filter presets (could be added as enhancement)
- No filter search/autocomplete for large tag lists (could be added as enhancement)
- Filters use OR logic within each category, AND logic between categories (by design)

## Success Criteria

All tests pass when:
- ✅ Filter modal opens/closes correctly
- ✅ Keyword search works
- ✅ Platform filtering works
- ✅ Tag filtering works
- ✅ Combined filters work with AND logic
- ✅ Clear All button works
- ✅ Active filters display updates
- ✅ Tab switching works correctly
- ✅ Filter state persists across modal open/close
- ✅ Empty results handled gracefully
