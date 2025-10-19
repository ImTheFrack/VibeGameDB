# Frontend CRUD Wiring - Testing Checklist

## Quick Start
```powershell
$env:HOST = '0.0.0.0'
$env:PORT = '5000'
python .\main.py
# Then open http://localhost:5000
```

## Test Cases

### ✅ Modal Open/Close
- [ ] Click "Add Game" → modal opens
- [ ] Click "Add Platform" → modal opens
- [ ] Click "Import from CSV" → modal opens
- [ ] Click ✕ button → modal closes
- [ ] Click outside modal → modal closes
- [ ] Click "Cancel" button → modal closes

### ✅ Add Platform
- [ ] Click "Add Platform"
- [ ] Enter: Name = "Steam", Type = "Digital"
- [ ] Click "Save"
- [ ] Switch to "Platforms" tab
- [ ] Verify "Steam" appears in the grid
- [ ] Repeat with: "PlayStation 5", "Nintendo Switch", "GOG"

### ✅ Add Game
- [ ] Click "Add Game"
- [ ] Enter: Title = "Cyberpunk 2077"
- [ ] Enter: Description = "A story-driven, open world RPG"
- [ ] Enter: Cover Image URL = (leave blank or use valid URL)
- [ ] Select platforms: "Steam", "GOG"
- [ ] Click "Save"
- [ ] Switch to "Games" tab
- [ ] Verify game appears with selected platforms

### ✅ Add Multiple Games
- [ ] Add "The Witcher 3" on Steam, GOG
- [ ] Add "Elden Ring" on PlayStation 5
- [ ] Add "Zelda: Breath of the Wild" on Nintendo Switch
- [ ] Verify all appear in Games tab

### ✅ Form Validation
- [ ] Try to add game without title → should show error
- [ ] Try to add platform without name → should show error
- [ ] Try to add game with invalid URL → should still save (image will fail to load)

### ✅ Tab Switching
- [ ] Click "Games" tab → shows games
- [ ] Click "Platforms" tab → shows platforms
- [ ] Click "Games" tab again → shows games

### ✅ Platform Dropdown
- [ ] Click "Add Game"
- [ ] Verify platforms dropdown is populated with all platforms
- [ ] Select multiple platforms
- [ ] Verify selection is preserved when form is submitted

### ⚠️ Edit Mode (TODO)
- [ ] Click "Edit" on a game card → currently logs to console
- [ ] Click "Edit" on a platform card → currently logs to console
- [ ] (Edit functionality not yet implemented)

## Expected Behavior

### Success Flow
1. User clicks "Add Game" → Modal opens with empty form
2. User fills form and clicks "Save"
3. POST request sent to `/plugins/database_handler/games`
4. Backend creates game in SQLite
5. Modal closes automatically
6. Game list refreshes and shows new game

### Error Flow
1. User submits invalid data (e.g., missing title)
2. Backend returns 400 error with message
3. Alert shows error message
4. Modal stays open so user can fix and retry

## Browser Console
- Open DevTools (F12)
- Check Console tab for any JavaScript errors
- Check Network tab to see API requests/responses

## Database
- Games stored in: `data/gamedb.sqlite`
- Tables: `games`, `platforms`
- Delete `data/gamedb.sqlite` to reset database

## Troubleshooting

### Modal doesn't open
- Check browser console for JavaScript errors
- Verify modal HTML exists in `public/index.html`
- Check that `app.js` is loaded (Network tab)

### Form submission fails
- Check Network tab for API response
- Verify backend is running (check terminal)
- Check backend logs for errors

### Platforms dropdown is empty
- Verify at least one platform exists
- Check Network tab for `/plugins/database_handler/platforms` request
- Check backend logs

### Images don't load
- Check that image URLs are valid
- Verify fallback SVG files exist in `public/img/`
- Check browser console for 404 errors
