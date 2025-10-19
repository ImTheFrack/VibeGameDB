'use strict';
/*
    Frontend JavaScript for the Video Game Database SPA shell.
    This file attaches event handlers, provides fetch stubs to backend endpoints,
    and contains rendering functions that will later be replaced with full logic.

    All functions are commented with intent and future extension points.
*/

// ----------------------
// Global State
// ----------------------
let allGames = [];                  // All games from database
let allPlatforms = [];              // All platforms from database
let allGamePlatforms = [];          // All game-platform links
let currentTab = 'games';           // Currently active tab
let currentGameId = null;           // Track which game we're adding to a platform
let allTags = [];                   // All unique tags from games
let platformFilterAnd = null;      // whether multiple platform filters require AND semantics (null until config fetched)
// Display options: when false the corresponding part is hidden
let displayOptions = {
    show_cover: true,
    show_title: true,
    show_description: true,
    show_tags: true,
    show_platforms: true
};

// Filter state
let currentFilters = {
    keyword: '',
    platforms: [],
    tags: []
};

// Ensure DOM is ready before running any code that touches elements.
document.addEventListener('DOMContentLoaded', () => {
    // Cache frequently used elements
    const displayGrid = document.getElementById('display-grid');
    const btnAddGame = document.getElementById('btn-add-game');
    const btnAddPlatform = document.getElementById('btn-add-platform');
    const btnImportCSV = document.getElementById('btn-import-csv');
    const tabs = Array.from(document.querySelectorAll('.tab'));
    const modalGame = document.getElementById('modal-game');
    const modalPlatform = document.getElementById('modal-platform');
    const modalImport = document.getElementById('modal-import');
    const modalAddToPlatform = document.getElementById('modal-add-to-platform');
    const modalFilter = document.getElementById('modal-filter');
    const formGame = document.getElementById('form-game');
    const formPlatform = document.getElementById('form-platform');
    const formAddToPlatform = document.getElementById('form-add-to-platform');
    const formFilter = document.getElementById('form-filter');
    const btnFilter = document.getElementById('btn-filter');
    const gamesControls = document.getElementById('games-controls');
    const headerSearch = document.getElementById('search-input');
    // Some older layouts used a header platform filters container. Prefer that
    // if present, otherwise fall back to the filter modal container. Use a
    // detached div as a harmless fallback so callers can safely query it.
    const platformFiltersContainer = document.querySelector('.platform-filters')
        || document.getElementById('filter-platforms')
        || document.createElement('div');

    // ----------------------
    // Modal Management
    // ----------------------

    function openModal(modal) {
        modal.setAttribute('aria-hidden', 'false');
        modal.style.display = 'flex';
    }

    function closeModal(modal) {
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';
    }

    // Close modal when clicking close buttons or outside the modal
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) closeModal(modal);
        });
    });

    // Close modal when clicking outside the modal-content
    const modalList = [modalGame, modalPlatform, modalImport, modalAddToPlatform, modalFilter];
    // also include display modal if present
    const modalDisplay = document.getElementById('modal-display');
    if (modalDisplay) modalList.push(modalDisplay);
    modalList.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });

    // ----------------------
    // Add Game / Platform Buttons
    // ----------------------

    btnAddGame.addEventListener('click', async () => {
        formGame.reset();
        document.getElementById('modal-game-title').textContent = 'Add Game';
        formGame.dataset.gameId = '';
        document.getElementById('link-game-section').style.display = 'none';
        openModal(modalGame);
    });

    // Show/hide link game section based on game type
    const gameTypeRadios = document.querySelectorAll('input[name="game_type"]');
    gameTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const linkSection = document.getElementById('link-game-section');
            linkSection.style.display = e.target.value !== 'original' ? 'block' : 'none';
        });
    });

    // Link game button (dummy function for now)
    const btnLinkGame = document.getElementById('btn-link-game');
    if (btnLinkGame) {
        btnLinkGame.addEventListener('click', (e) => {
            e.preventDefault();
            const relatedGameInput = formGame.querySelector('input[name="related_game_id"]');
            alert('Link game feature coming soon! For now, you can manually enter the game ID.');
            // TODO: Implement game search/link functionality
        });
    }

    btnAddPlatform.addEventListener('click', () => {
        formPlatform.reset();
        document.getElementById('modal-platform-title').textContent = 'Add Platform';
        formPlatform.dataset.platformId = '';
        openModal(modalPlatform);
    });

    btnImportCSV.addEventListener('click', () => {
        openModal(modalImport);
    });

    // ----------------------
    // Form Submission Handlers
    // ----------------------

    formGame.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(formGame);
        
        // Parse tags from comma-separated string
        const tagsStr = formData.get('tags') || '';
        const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);

        const gameType = formData.get('game_type');
        const gameData = {
            name: formData.get('name'),
            description: formData.get('description'),
            cover_image_url: formData.get('cover_image_url'),
            trailer_url: formData.get('trailer_url'),
            is_remake: gameType === 'remake',
            is_remaster: gameType === 'remaster',
            related_game_id: gameType !== 'original' ? (formData.get('related_game_id') || null) : null,
            tags: tags
        };

        const gameId = formGame.dataset.gameId;
        const endpoint = gameId
            ? `/plugins/database_handler/games/${gameId}`
            : '/plugins/database_handler/games';
        const method = gameId ? 'PUT' : 'POST';

        try {
            const res = await fetch(endpoint, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gameData)
            });
            if (!res.ok) {
                const err = await res.json();
                alert(`Error: ${err.error || 'Failed to save game'}`);
                return;
            }
            const result = await res.json();
            
            // If creating a new game (not editing), automatically open "Add to Platform" modal
            if (!gameId) {
                currentGameId = result.game.id;
                closeModal(modalGame);
                await populateAddToPlatformForm();
                openModal(modalAddToPlatform);
            } else {
                closeModal(modalGame);
                await populatePlatformFilters();
                if (currentTab === 'games') fetchGames();
            }
        } catch (err) {
            console.error('Form submission error:', err);
            alert('Network error: ' + err.message);
        }
    });

    formPlatform.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(formPlatform);

        const platformData = {
            name: formData.get('name'),
            supports_digital: formData.get('supports_digital') === 'on',
            supports_physical: formData.get('supports_physical') === 'on',
            description: formData.get('description'),
            icon_url: formData.get('icon_url'),
            image_url: formData.get('image_url'),
            year_acquired: formData.get('year_acquired') ? parseInt(formData.get('year_acquired')) : null
        };

        // Validate at least one format is supported
        if (!platformData.supports_digital && !platformData.supports_physical) {
            alert('Platform must support at least one format (Digital or Physical)');
            return;
        }

        const platformId = formPlatform.dataset.platformId;
        const endpoint = platformId
            ? `/plugins/database_handler/platforms/${platformId}`
            : '/plugins/database_handler/platforms';
        const method = platformId ? 'PUT' : 'POST';

        try {
            const res = await fetch(endpoint, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(platformData)
            });
            if (!res.ok) {
                const err = await res.json();
                alert(`Error: ${err.error || 'Failed to save platform'}`);
                return;
            }
            closeModal(modalPlatform);
            await populatePlatformFilters();  // Refresh filter buttons (always)
            if (currentTab === 'platforms') fetchPlatforms();  // Only refresh grid if on Platforms tab
        } catch (err) {
            console.error('Form submission error:', err);
            alert('Network error: ' + err.message);
        }
    });

    // Form handler for adding a game to a platform
    formAddToPlatform.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(formAddToPlatform);

        const platformId = formData.get('platform_id');
        const acquisitionMethod = formData.get('acquisition_method') || null;
        
        // Get selected formats from checkboxes (only checked ones, not disabled)
        const allFormatCheckboxes = document.querySelectorAll('#format-checkbox-group input[type="checkbox"]');
        const selectedFormats = [];
        
        allFormatCheckboxes.forEach(cb => {
            // Only include if explicitly checked (not just because it's disabled)
            if (cb.checked && !cb.disabled) {
                selectedFormats.push(cb.value === 'true');
            }
            // For disabled checkboxes, only include if it's the only option
            else if (cb.disabled && cb.checked) {
                selectedFormats.push(cb.value === 'true');
            }
        });
        
        if (selectedFormats.length === 0) {
            alert('Please select at least one format (Digital or Physical)');
            return;
        }

        // Deduplicate formats (in case both digital and physical are selected)
        const uniqueFormats = [...new Set(selectedFormats)];

        // Create a game_platform entry for each selected format
        const requests = uniqueFormats.map(isDigital => {
            const gamePlatformData = {
                game_id: currentGameId,
                platform_id: platformId,
                is_digital: isDigital,
                acquisition_method: acquisitionMethod
            };
            return fetch('/plugins/database_handler/game_platforms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gamePlatformData)
            });
        });

        try {
            const responses = await Promise.all(requests);
            const errors = [];
            for (const res of responses) {
                if (!res.ok) {
                    const err = await res.json();
                    // Skip "already exists" errors - it's fine if the combination already exists
                    if (!err.error.includes('already exists')) {
                        errors.push(err.error || 'Failed to add game to platform');
                    }
                }
            }
            
            if (errors.length > 0) {
                alert(`Error: ${errors[0]}`);
                return;
            }
            
            closeModal(modalAddToPlatform);
            await populatePlatformFilters();
            if (currentTab === 'games') fetchGames();
        } catch (err) {
            console.error('Form submission error:', err);
            alert('Network error: ' + err.message);
        }
    });

    // Tab switching behavior
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const target = e.currentTarget.getAttribute('data-tab');
            console.log('Switching tab to', target);
            currentTab = target;  // Track current tab
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            
            // Show/hide filter button based on tab
            if (gamesControls) {
                gamesControls.style.display = target === 'games' ? 'flex' : 'none';
            }
            
            if (target === 'games') fetchGames(); else fetchPlatforms();
        });
    });

    // Filter button handler
    if (btnFilter) {
        btnFilter.addEventListener('click', async () => {
            await populateFilterModal();
            openModal(modalFilter);
            // Focus the keyword input so the user can start typing immediately
            const kw = document.getElementById('filter-keyword');
            if (kw) {
                kw.focus();
                // place cursor at end
                try { kw.selectionStart = kw.selectionEnd = kw.value.length; } catch (e) {}
            }
        });
    }

    // Display button/modal wiring
    const btnDisplay = document.getElementById('btn-display');
    const modalDisplayEl = document.getElementById('modal-display');
    const formDisplay = document.getElementById('form-display');
    function updateDisplayButton() {
        if (!btnDisplay) return;
        // Exclude title from the count since it is always shown
        const keys = ['show_cover', 'show_description', 'show_tags', 'show_platforms'];
        const hiddenCount = keys.reduce((acc, k) => acc + (displayOptions[k] ? 0 : 1), 0);
        if (hiddenCount > 0) {
            btnDisplay.textContent = `🖼 Display (${hiddenCount})`;
            // Use same visual class as Filter when active
            btnDisplay.classList.add('filters-on');
        } else {
            btnDisplay.textContent = '🖼 Display';
            btnDisplay.classList.remove('filters-on');
        }
    }
    if (btnDisplay && modalDisplayEl && formDisplay) {
        btnDisplay.addEventListener('click', (e) => {
            // populate current states
            formDisplay.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                const name = cb.name;
                cb.checked = !!displayOptions[name];
            });
            openModal(modalDisplayEl);
        });

        formDisplay.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(formDisplay);
            // Update displayOptions and rerender. Title is always shown.
            displayOptions.show_cover = !!formData.get('show_cover');
            displayOptions.show_title = true; // enforced
            displayOptions.show_description = !!formData.get('show_description');
            displayOptions.show_tags = !!formData.get('show_tags');
            displayOptions.show_platforms = !!formData.get('show_platforms');
            closeModal(modalDisplayEl);
            // re-render with current filters (re-apply filters to keep behavior)
            applyFilters();
            updateDisplayButton();
        });
    }

    // Ensure display button reflects initial state
    updateDisplayButton();

    // Header search: live update the keyword filter (light debounce)
    if (headerSearch) {
        let headerTimer = null;
        headerSearch.addEventListener('input', (e) => {
            clearTimeout(headerTimer);
            headerTimer = setTimeout(() => {
                currentFilters.keyword = (e.target.value || '').trim().toLowerCase();
                // When using header search, clear typed platform/tag selections to avoid conflicts
                currentFilters.platforms = [];
                currentFilters.tags = [];
                applyFilters();
                updateActiveFiltersDisplay();
            }, 250);
        });
    }

    // Help tooltip overflow handling: flip to left if tooltip would overflow the viewport
    document.querySelectorAll('.help-icon').forEach(h => {
        const tip = h.querySelector('.help-tooltip');
        if (!tip) return;

        const computeAndFlip = () => {
            // Temporarily show the tooltip to compute size
            const prevDisplay = tip.style.display;
            tip.style.display = 'block';
            const rect = tip.getBoundingClientRect();
            tip.style.display = prevDisplay || '';

            // If tooltip right edge would be off-screen, flip it to the left
            if (rect.right > (window.innerWidth - 8)) {
                h.classList.add('tooltip-left');
            } else {
                h.classList.remove('tooltip-left');
            }
        };

        h.addEventListener('mouseenter', computeAndFlip);
        h.addEventListener('focus', computeAndFlip);
        // Recompute on window resize
        window.addEventListener('resize', computeAndFlip);
    });

    // Filter form submission
    if (formFilter) {
        formFilter.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Get keyword
            const keyword = document.getElementById('filter-keyword').value.toLowerCase();
            
            // Get selected platforms
            const platformCheckboxes = document.querySelectorAll('#filter-platforms input[type="checkbox"]:checked');
            const platforms = Array.from(platformCheckboxes).map(cb => cb.value);
            
            // Get selected tags
            const tagCheckboxes = document.querySelectorAll('#filter-tags input[type="checkbox"]:checked');
            const tags = Array.from(tagCheckboxes).map(cb => cb.value);
            
            // Update filter state
            // Read platform mode radio: 'and' or 'or'
            const selMode = document.querySelector('input[name="platform_mode"]:checked');
            const platformAnd = selMode ? (selMode.value === 'and') : undefined;
            currentFilters = { keyword, platforms, tags, platformAnd };
            
            // Apply filters
            applyFilters();
            
            // Close modal
            closeModal(modalFilter);
            updateActiveFiltersDisplay();
        });
    }

    // Clear filters button
    const btnClearFilters = document.getElementById('btn-clear-filters');
    if (btnClearFilters) {
        btnClearFilters.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('filter-keyword').value = '';
            document.querySelectorAll('#filter-platforms input[type="checkbox"]').forEach(cb => cb.checked = false);
            document.querySelectorAll('#filter-tags input[type="checkbox"]').forEach(cb => cb.checked = false);
            currentFilters = { keyword: '', platforms: [], tags: [] };
            applyFilters();
            updateActiveFiltersDisplay();
        });
    }

    // Delegate edit buttons inside the display grid
    displayGrid.addEventListener('click', async (e) => {
        const editGame = e.target.closest('.edit-game');
        const editPlatform = e.target.closest('.edit-platform');
        const addToPlat = e.target.closest('.add-to-platform');
        const platSpan = e.target.closest('.plat');
        const tagSpan = e.target.closest('.tag');
        
        if (editGame) {
            const gameId = editGame.getAttribute('data-id');
            // TODO: Implement edit game functionality
            console.log('Edit game clicked:', gameId);
        }
        if (editPlatform) {
            const platformId = editPlatform.getAttribute('data-id');
            // TODO: Implement edit platform functionality
            console.log('Edit platform clicked:', platformId);
        }
        if (addToPlat) {
            const gameId = addToPlat.getAttribute('data-id');
            currentGameId = gameId;
            await populateAddToPlatformForm();
            openModal(modalAddToPlatform);
        }
        // Click on a platform pill toggles that platform in currentFilters.platforms
        if (platSpan) {
            const pid = platSpan.getAttribute('data-platform-id');
            if (!pid) return;
            const idx = currentFilters.platforms.indexOf(pid);
            if (idx === -1) currentFilters.platforms.push(pid); else currentFilters.platforms.splice(idx, 1);
            // Clear modal checkboxes to keep UI consistent
            document.querySelectorAll('#filter-platforms input[type="checkbox"]').forEach(cb => cb.checked = currentFilters.platforms.includes(cb.value));
            applyFilters();
            updateActiveFiltersDisplay();
            return;
        }
        // Click on a tag toggles that tag in currentFilters.tags
        if (tagSpan) {
            const t = tagSpan.getAttribute('data-tag');
            if (!t) return;
            const idx = currentFilters.tags.indexOf(t);
            if (idx === -1) currentFilters.tags.push(t); else currentFilters.tags.splice(idx, 1);
            document.querySelectorAll('#filter-tags input[type="checkbox"]').forEach(cb => cb.checked = currentFilters.tags.includes(cb.value));
            applyFilters();
            updateActiveFiltersDisplay();
            return;
        }
    });

    // Wire up "All" filter button
    const allFilterBtn = platformFiltersContainer.querySelector('[data-platform="all"]');
    if (allFilterBtn) {
        allFilterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            filterGamesByPlatform('all');
        });
    }

    // Initial load: check if database is empty and seed if needed
    (async () => {
        try {
            // Check if database is empty
            const checkRes = await apiGet('/plugins/seed_handler/check');
            if (checkRes && checkRes.empty) {
                // Database is empty, seed it with test data
                const seedRes = await fetch('/plugins/seed_handler/seed', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (seedRes.ok) {
                    const seedData = await seedRes.json();
                    console.log('Database seeded with test data:', seedData);
                }
            }
        } catch (err) {
            console.error('Error checking/seeding database:', err);
        }
        
        // Fetch config first (so filter behavior is known early)
        try {
            const cfg = await apiGet('/plugins/config_handler');
            if (cfg && typeof cfg.platform_filter_and !== 'undefined') {
                platformFilterAnd = Boolean(cfg.platform_filter_and);
            }
        } catch (err) {
            console.error('Failed to fetch config:', err);
        }

        // Fetch platforms next
        const platformData = await apiGet('/plugins/database_handler/platforms');
        if (platformData) {
            allPlatforms = platformData.platforms || [];
        }
        
        // Ensure we're on the Games tab and load the games
        currentTab = 'games';
        tabs.forEach(tab => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        });
        tabs[0].classList.add('active');
        tabs[0].setAttribute('aria-selected', 'true');
        gamesControls.style.display = 'flex';
        
    // Now load the games and wait for rendering to complete
    await fetchGames();
    // Ensure active filters are applied and grid is rendered
    applyFilters();

    })();
});

// ----------------------
// API Fetching stubs
// ----------------------

// Generic helper for GET requests and JSON parsing with basic error handling
async function apiGet(path) {
    try {
        const res = await fetch(path, { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('API request failed', path, err);
        return null;
    }
}

// Fetch list of games from the backend plugin
async function fetchGames() {
    // Endpoint matches plugin loader mapping in main.py
    const data = await apiGet('/plugins/database_handler/games');
    if (data) {
        allGames = data.games || [];
        // Also fetch game-platform links
        await fetchGamePlatforms();
        // Extract all unique tags
        extractAllTags();
        // Apply current filters
        applyFilters();
        updateActiveFiltersDisplay();
    }
}

// Extract all unique tags from all games
function extractAllTags() {
    const tagSet = new Set();
    allGames.forEach(game => {
        if (game.tags && Array.isArray(game.tags)) {
            game.tags.forEach(tag => tagSet.add(tag));
        }
    });
    allTags = Array.from(tagSet).sort();
}

// Fetch game-platform links
async function fetchGamePlatforms() {
    const data = await apiGet('/plugins/database_handler/game_platforms');
    if (data) {
        allGamePlatforms = data.game_platforms || [];
    }
}

// Fetch list of platforms from the backend plugin
async function fetchPlatforms() {
    const data = await apiGet('/plugins/database_handler/platforms');
    if (data) {
        allPlatforms = data.platforms || [];
        renderPlatforms(allPlatforms);
    }
}

// Populate the filter modal with available options
async function populateFilterModal() {
    // Populate platforms
    const platformsContainer = document.getElementById('filter-platforms');
    if (platformsContainer) {
        platformsContainer.innerHTML = '';
        allPlatforms.forEach(p => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            // store string values for checkbox inputs and compare against
            // stringified currentFilters entries to avoid type mismatches
            input.value = String(p.id);
            input.checked = currentFilters.platforms.includes(String(p.id));
            label.appendChild(input);
            label.appendChild(document.createTextNode(p.name));
            platformsContainer.appendChild(label);
        });
    }
    
    // Populate tags
    const tagsContainer = document.getElementById('filter-tags');
    if (tagsContainer) {
        tagsContainer.innerHTML = '';
        allTags.forEach(tag => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = String(tag);
            input.checked = currentFilters.tags.includes(String(tag));
            label.appendChild(input);
            label.appendChild(document.createTextNode(tag));
            tagsContainer.appendChild(label);
        });
    }
    
    // Set keyword
    const keywordInput = document.getElementById('filter-keyword');
    if (keywordInput) {
        keywordInput.value = currentFilters.keyword;
    }
    // Set platform mode radio if present (currentFilters.platformAnd: true => AND)
    const mode = document.querySelector('input[name="platform_mode"][value="and"]');
    const modeOr = document.querySelector('input[name="platform_mode"][value="or"]');
    if (mode && modeOr) {
        if (typeof currentFilters.platformAnd !== 'undefined') {
            if (currentFilters.platformAnd) mode.checked = true; else modeOr.checked = true;
        } else {
            // fallback to server config
            if (platformFilterAnd) mode.checked = true; else modeOr.checked = true;
        }
    }
}

// Apply current filters to games
function applyFilters() {
    if (currentTab !== 'games') return;
    
    let filtered = allGames;
    
    // Filter by keyword (name or description)
    if (currentFilters.keyword) {
        const raw = currentFilters.keyword.trim().toLowerCase();
        if (raw.length > 0) {
          const phraseMatch = raw.match(/^"(.*)"$/); // "exact phrase"
          if (phraseMatch) {
            const phrase = phraseMatch[1];
            filtered = filtered.filter(game =>
              (game.name && game.name.toLowerCase().includes(phrase)) ||
              (game.description && game.description.toLowerCase().includes(phrase))
            );
          } else {
            const words = raw.split(/\s+/).filter(Boolean);
                            filtered = filtered.filter(game => {
                                    const hay = ((game.name || '') + ' ' + (game.description || '') + ' ' + ((game.tags || []).join(' '))).toLowerCase();
                                    // All words must appear somewhere (AND)
                                    return words.every(w => hay.includes(w));
                            });
          }
        }
    }
    
    // Filter by platforms
    if (currentFilters.platforms.length > 0) {
        // Determine semantics: prefer explicit selection from the filter modal
        const useAnd = typeof currentFilters.platformAnd !== 'undefined' ? currentFilters.platformAnd : platformFilterAnd;
        if (useAnd) {
            // AND semantics: require that the game has at least one link for
            // every selected platform.
            filtered = filtered.filter(game => {
                return currentFilters.platforms.every(platformId => {
                    return allGamePlatforms.some(gp =>
                        String(gp.game_id) === String(game.id) && String(gp.platform_id) === String(platformId)
                    );
                });
            });
        } else {
            // OR semantics (existing behavior): game is kept if it exists on
            // any of the selected platforms.
            filtered = filtered.filter(game => {
                return currentFilters.platforms.some(platformId => {
                    return allGamePlatforms.some(gp =>
                        String(gp.game_id) === String(game.id) && String(gp.platform_id) === String(platformId)
                    );
                });
            });
        }
    }
    
    // Filter by tags
    if (currentFilters.tags.length > 0) {
        // Require that ALL selected tags are present on the game (AND semantics)
        filtered = filtered.filter(game => {
            const gameTags = game.tags || [];
            return currentFilters.tags.every(tag => gameTags.includes(tag));
        });
    }
    
    renderGames(filtered);
}

// Update the active filters display
function updateActiveFiltersDisplay() {
    const activeFiltersEl = document.getElementById('active-filters');
    const btn = document.getElementById('btn-filter');

    // Count active filters: keyword counts as 1, plus selected platforms and tags
    let count = 0;
    if (currentFilters.keyword) count += 1;
    if (Array.isArray(currentFilters.platforms)) count += currentFilters.platforms.length;
    if (Array.isArray(currentFilters.tags)) count += currentFilters.tags.length;

    // Update Filter button label and visual state
    if (btn) {
        if (count > 0) {
            btn.textContent = `🔍 Filter (${count})`;
            btn.classList.add('filters-on');
        } else {
            btn.textContent = '🔍 Filter';
            btn.classList.remove('filters-on');
        }
    }

    // Keep the legacy active-filters element empty (we now show count on button)
    if (activeFiltersEl) activeFiltersEl.textContent = '';
}

// Populate the "Add to Platform" form with available platforms
async function populateAddToPlatformForm() {
    const data = await apiGet('/plugins/database_handler/platforms');
    if (!data) return;
    
    const platformGroup = document.getElementById('platform-radio-group');
    if (!platformGroup) return;
    
    platformGroup.innerHTML = '';
    const platforms = data.platforms || [];
    
    platforms.forEach((p, idx) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'platform_id';
        input.value = p.id;
        input.required = true;
        if (idx === 0) input.checked = true;
        
        label.appendChild(input);
        label.appendChild(document.createTextNode(p.name));
        platformGroup.appendChild(label);
        
        // Add change listener to update format options when platform changes
        input.addEventListener('change', () => updateFormatOptions(p));
    });
    
    // Set initial format options for first platform
    if (platforms.length > 0) {
        updateFormatOptions(platforms[0]);
    }
}

// Update format checkboxes based on selected platform's capabilities
function updateFormatOptions(platform) {
    const formatGroup = document.getElementById('format-checkbox-group');
    if (!formatGroup) return;
    
    formatGroup.innerHTML = '';
    
    // If platform supports both, show both checkboxes
    if (platform.supports_digital && platform.supports_physical) {
        const digitalLabel = document.createElement('label');
        const digitalInput = document.createElement('input');
        digitalInput.type = 'checkbox';
        digitalInput.name = 'format_digital';
        digitalInput.value = 'true';
        digitalInput.checked = true;
        digitalLabel.appendChild(digitalInput);
        digitalLabel.appendChild(document.createTextNode('Digital'));
        formatGroup.appendChild(digitalLabel);
        
        const physicalLabel = document.createElement('label');
        const physicalInput = document.createElement('input');
        physicalInput.type = 'checkbox';
        physicalInput.name = 'format_physical';
        physicalInput.value = 'true';
        physicalLabel.appendChild(physicalInput);
        physicalLabel.appendChild(document.createTextNode('Physical'));
        formatGroup.appendChild(physicalLabel);
    } 
    // If only digital
    else if (platform.supports_digital) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = 'true';
        input.checked = true;
        input.disabled = true;
        label.appendChild(input);
        label.appendChild(document.createTextNode('Digital'));
        formatGroup.appendChild(label);
    }
    // If only physical
    else if (platform.supports_physical) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = 'false';
        input.checked = true;
        input.disabled = true;
        label.appendChild(input);
        label.appendChild(document.createTextNode('Physical'));
        formatGroup.appendChild(label);
    }
}

// ----------------------
// Rendering stubs
// ----------------------

// Render an array of games into the display grid. This function is intentionally
// simple: it clears the grid and appends generated DOM nodes for each game.
function renderGames(games) {
    const grid = document.getElementById('display-grid');
    if (!grid) return;
    // Remove example template cards and render fetched ones
    grid.innerHTML = '';

    if (!Array.isArray(games) || games.length === 0) {
        grid.innerHTML = '<p class="muted">No games found.</p>';
        return;
    }

    games.forEach(game => {
        const card = document.createElement('article');
        card.className = 'card game-card';

        // Get platforms for this game from game_platforms table
        const gamePlatformLinks = allGamePlatforms.filter(gp => gp.game_id === game.id);
        const platformsHtml = gamePlatformLinks
            .map(gp => {
                const platform = allPlatforms.find(p => p.id === gp.platform_id);
                const format = gp.is_digital ? '📱' : '💿';
                const pid = platform?.id || gp.platform_id;
                const pname = escapeHtml(platform?.name || gp.platform_id);
                return `<span class="plat" data-platform-id="${pid}">${format} ${pname}</span>`;
            })
            .join('');
        
        const tagsHtml = (game.tags || [])
            .map(tag => `<span class="tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`)
            .join(' ');
        // Build card HTML conditionally based on displayOptions
        const coverHtml = displayOptions.show_cover ? `<img class="card-cover" src="${game.cover_image_url || '/img/cover_placeholder.svg'}" alt="cover" onerror="this.src='/img/cover_placeholder.svg'">` : '';
        const titleHtml = displayOptions.show_title ? `<h3 class="card-title">${escapeHtml(game.name)}</h3>` : '';
        const descHtml = displayOptions.show_description ? `<p class="card-desc">${escapeHtml(game.description || '')}</p>` : '';
        const tagsBlockHtml = (displayOptions.show_tags && tagsHtml) ? `<div class="tags">${tagsHtml}</div>` : '';
        const platformsBlockHtml = displayOptions.show_platforms ? `<div class="platform-icons">${platformsHtml || '<span class="muted">No platforms</span>'}</div>` : '';

        card.innerHTML = `
            ${coverHtml}
            <div class="card-body">
                ${titleHtml}
                ${descHtml}
                ${tagsBlockHtml}
                ${platformsBlockHtml}
                <div class="card-actions">
                    <button class="btn btn-sm edit-game" data-id="${game.id}">Edit</button>
                    <button class="btn btn-sm add-to-platform" data-id="${game.id}">Add Platform</button>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });
}

// Render platforms into the display grid
function renderPlatforms(platforms) {
    const grid = document.getElementById('display-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!Array.isArray(platforms) || platforms.length === 0) {
        grid.innerHTML = '<p class="muted">No platforms found.</p>';
        return;
    }

    platforms.forEach(p => {
        const card = document.createElement('article');
        card.className = 'card platform-card';
        
        // Build format string
        const formats = [];
        if (p.supports_digital) formats.push('Digital');
        if (p.supports_physical) formats.push('Physical');
        const formatStr = formats.join(' • ');
        
        // Count games on this platform
        const gameCount = allGamePlatforms.filter(gp => gp.platform_id === p.id).length;
        
        card.innerHTML = `
            <img class="card-cover" src="${p.icon_url || '/img/icon_placeholder.svg'}" alt="icon" onerror="this.src='/img/icon_placeholder.svg'">
            <div class="card-body">
                <h3 class="card-title">${escapeHtml(p.name)}</h3>
                <p class="card-desc">${escapeHtml(formatStr)} • ${gameCount} games</p>
                <div class="card-actions"><button class="btn btn-sm edit-platform" data-id="${p.id}">Edit</button></div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ----------------------
// Utilities
// ----------------------

// Small, defensive HTML escape to avoid accidental XSS from demo data.
function escapeHtml(s){
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
