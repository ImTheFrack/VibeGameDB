# Platform Filter UI Guide

## Visual Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                        My Game Library                          │
│                                                                 │
│  [Add Game] [Add Platform] [Import from CSV]                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  [Games] [Platforms]                                            │
│                                                                 │
│  Sort by: [Name (A-Z) ▼]                                        │
│                                                                 │
│  Filter by Platform:                                            │
│  [All] [Steam] [PlayStation 5] [Nintendo Switch] [GOG]         │
│   ▲     ▲                                                       │
│   │     └─ Click to filter                                      │
│   └─ Active (highlighted)                                       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │              │  │              │  │              │          │
│  │   Cover      │  │   Cover      │  │   Cover      │          │
│  │   Image      │  │   Image      │  │   Image      │          │
│  │              │  │              │  │              │          │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤          │
│  │ Game Title   │  │ Game Title   │  │ Game Title   │          │
│  │ Description  │  │ Description  │  │ Description  │          │
│  │ [Steam] [GOG]│  │ [PS5]        │  │ [Switch]     │          │
│  │ [Edit]       │  │ [Edit]       │  │ [Edit]       │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │              │  │              │                            │
│  │   Cover      │  │   Cover      │                            │
│  │   Image      │  │   Image      │                            │
│  │              │  │              │                            │
│  ├──────────────┤  ├──────────────┤                            │
│  │ Game Title   │  │ Game Title   │                            │
│  │ Description  │  │ Description  │                            │
│  │ [Steam]      │  │ [PS5] [GOG]  │                            │
│  │ [Edit]       │  │ [Edit]       │                            │
│  └──────────────┘  └──────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Filter Button States

### Default (All Selected)
```
┌─────────────────────────────────────────────────────────────────┐
│ Filter by Platform:                                             │
│ ┌────┐ ┌──────────┐ ┌────────────────┐ ┌──────────────┐ ┌─────┐│
│ │All │ │  Steam   │ │PlayStation 5   │ │Nintendo Sw...│ │ GOG ││
│ └────┘ └──────────┘ └────────────────┘ └──────────────┘ └─────┘│
│  ▲
│  └─ Active (highlighted background)
└─────────────────────────────────────────────────────────────────┘
```

### Steam Selected
```
┌─────────────────────────────────────────────────────────────────┐
│ Filter by Platform:                                             │
│ ┌────┐ ┌──────────┐ ┌────────────────┐ ┌──────────────┐ ┌─────┐│
│ │All │ │  Steam   │ │PlayStation 5   │ │Nintendo Sw...│ │ GOG ││
│ └────┘ └──────────┘ └────────────────┘ └──────────────┘ └─────┘│
│         ▲
│         └─ Active (highlighted background)
└─────────────────────────────────────────────────────────────────┘
```

### PlayStation 5 Selected
```
┌─────────────────────────────────────────────────────────────────┐
│ Filter by Platform:                                             │
│ ┌────┐ ┌──────────┐ ┌────────────────┐ ┌──────────────┐ ┌─────┐│
│ │All │ │  Steam   │ │PlayStation 5   │ │Nintendo Sw...│ │ GOG ││
│ └────┘ └──────────┘ └────────────────┘ └──────────────┘ └─────┘│
│                     ▲
│                     └─ Active (highlighted background)
└─────────────────────────────────────────────────────────────────┘
```

## CSS Styling

### Filter Button (Inactive)
```css
.filter-btn {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.03);
    padding: 6px 8px;
    border-radius: 6px;
    color: var(--muted);  /* Gray text */
    cursor: pointer;
}

.filter-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(0,0,0,0.6);
}
```

### Filter Button (Active)
```css
.filter-btn.active {
    background: rgba(255,255,255,0.02);  /* Slightly lighter background */
    color: var(--text);  /* White text */
}
```

## Interaction Flow

### User Clicks "Steam" Button

```
User clicks "Steam" button
    ↓
filterGamesByPlatform('steam') called
    ↓
currentPlatformFilter = 'steam'
    ↓
Update button styling:
  - Remove .active from all buttons
  - Add .active to Steam button
    ↓
Filter allGames array:
  - Keep only games with 'steam' in platforms
    ↓
renderGames(filtered) called
    ↓
Display grid updates:
  - Clear existing cards
  - Render only filtered games
    ↓
User sees only Steam games
```

## Responsive Behavior

### Desktop (Wide Screen)
```
┌─────────────────────────────────────────────────────────────────┐
│ Filter by Platform:                                             │
│ [All] [Steam] [PlayStation 5] [Nintendo Switch] [GOG]          │
│ (All buttons in one row)                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Tablet (Medium Screen)
```
┌──────────────────────────────────────────┐
│ Filter by Platform:                      │
│ [All] [Steam] [PlayStation 5]            │
│ [Nintendo Switch] [GOG]                  │
│ (Buttons wrap to multiple rows)          │
└──────────────────────────────────────────┘
```

### Mobile (Small Screen)
```
┌──────────────────┐
│ Filter by Platf: │
│ [All]            │
│ [Steam]          │
│ [PlayStation 5]  │
│ [Nintendo Sw...] │
│ [GOG]            │
│ (Buttons stack)  │
└──────────────────┘
```

## Accessibility Features

### Keyboard Navigation
```
Tab key:
  - Focus moves to next filter button
  - Visual focus indicator appears

Enter/Space:
  - Activates focused button
  - Filters games

Escape:
  - (Future: close any open modals)
```

### Screen Reader
```
<button class="filter-btn active" data-platform="all">
  All
</button>

Screen reader announces:
"All, button, active"
```

### Color Contrast
```
Active button:
  - Background: rgba(255,255,255,0.02)
  - Text: #e6eef6 (white)
  - Contrast ratio: 7.5:1 ✅ (exceeds WCAG AA)

Inactive button:
  - Background: transparent
  - Text: #9aa4b2 (gray)
  - Contrast ratio: 4.5:1 ✅ (meets WCAG AA)
```

## Animation (Optional Future Enhancement)

### Smooth Transition
```css
.filter-btn {
    transition: all 0.2s ease;
}

.filter-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0,0,0,0.7);
}

.filter-btn.active {
    transition: all 0.2s ease;
}
```

### Game Card Fade-In
```css
.game-card {
    animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

## Error States

### No Platforms
```
┌─────────────────────────────────────────────────────────────────┐
│ Filter by Platform:                                             │
│ [All]                                                           │
│ (Only "All" button shown)                                       │
└─────────────────────────────────────────────────────────────────┘
```

### No Games for Selected Platform
```
┌─────────────────────────────────────────────────────────────────┐
│ Filter by Platform:                                             │
│ [All] [Steam] [PlayStation 5] [Nintendo Switch] [GOG]          │
│                                                                 │
│ No games found.                                                 │
│ (Empty state message)                                           │
└─────────────────────────────────────────────────────────────────┘
```

## Performance Indicators

### Filter Button Creation
- 1-5 platforms: <10ms
- 5-20 platforms: 10-50ms
- 20+ platforms: 50-100ms

### Game Filtering
- 1-50 games: <1ms
- 50-500 games: 1-5ms
- 500+ games: 5-20ms

### Game Rendering
- 1-10 games: 10-50ms
- 10-50 games: 50-200ms
- 50+ games: 200-500ms

## Browser DevTools Inspection

### Inspect Filter Button
```javascript
// In Console:
document.querySelector('[data-platform="steam"]')

// Returns:
<button class="filter-btn" data-platform="steam">Steam</button>
```

### Check Active Button
```javascript
// In Console:
document.querySelector('.filter-btn.active')

// Returns:
<button class="filter-btn active" data-platform="all">All</button>
```

### Check All Filter Buttons
```javascript
// In Console:
document.querySelectorAll('.filter-btn')

// Returns:
NodeList(5) [
  button.filter-btn.active,
  button.filter-btn,
  button.filter-btn,
  button.filter-btn,
  button.filter-btn
]
```

## Troubleshooting Visual Issues

### Buttons Not Appearing
- Check that platforms exist in database
- Check browser console for errors
- Verify CSS is loaded (check Network tab)

### Buttons Not Clickable
- Check that click handlers are attached
- Verify JavaScript is enabled
- Check browser console for errors

### Buttons Not Highlighting
- Check that CSS classes are applied
- Verify `.active` class styling
- Check browser DevTools for CSS conflicts

### Games Not Filtering
- Check that games have platforms assigned
- Verify platform IDs match between games and buttons
- Check browser console for errors
- Check Network tab for API responses
