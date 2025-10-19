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
let currentPlatformFilter = 'all';  // Currently selected filter
let allGames = [];                  // All games from database
let allPlatforms = [];              // All platforms from database
let allGamePlatforms = [];          // All game-platform links
let currentTab = 'games';           // Currently active tab
let currentGameId = null;           // Track which game we're adding to a platform

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
    const formGame = document.getElementById('form-game');
    const formPlatform = document.getElementById('form-platform');
    const formAddToPlatform = document.getElementById('form-add-to-platform');
    const platformFiltersContainer = document.querySelector('.platform-filters');

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
    [modalGame, modalPlatform, modalImport, modalAddToPlatform].forEach(modal => {
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
        openModal(modalGame);
    });

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

        const gameData = {
            name: formData.get('name'),
            description: formData.get('description'),
            cover_image_url: formData.get('cover_image_url'),
            trailer_url: formData.get('trailer_url'),
            is_remake: formData.get('is_remake') === 'on',
            is_remaster: formData.get('is_remaster') === 'on',
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
            closeModal(modalGame);
            await populatePlatformFilters();
            if (currentTab === 'games') fetchGames();
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

        const gamePlatformData = {
            game_id: currentGameId,
            platform_id: formData.get('platform_id'),
            is_digital: formData.get('is_digital') === 'true',
            acquisition_method: formData.get('acquisition_method') || null
        };

        try {
            const res = await fetch('/plugins/database_handler/game_platforms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gamePlatformData)
            });
            if (!res.ok) {
                const err = await res.json();
                alert(`Error: ${err.error || 'Failed to add game to platform'}`);
                return;
            }
            closeModal(modalAddToPlatform);
            if (currentTab === 'games') fetchGames();
        } catch (err) {
            console.error('Form submission error:', err);
            alert('Network error: ' + err.message);
        }
    });

    // Tab switching behavior (simple client-only for now)
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const target = e.currentTarget.getAttribute('data-tab');
            console.log('Switching tab to', target);
            currentTab = target;  // Track current tab
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            // TODO: call fetchGames() or fetchPlatforms() depending on target
            if (target === 'games') fetchGames(); else fetchPlatforms();
        });
    });

    // Delegate edit buttons inside the display grid
    displayGrid.addEventListener('click', async (e) => {
        const editGame = e.target.closest('.edit-game');
        const editPlatform = e.target.closest('.edit-platform');
        const addToPlat = e.target.closest('.add-to-platform');
        
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
    });

    // Wire up "All" filter button
    const allFilterBtn = platformFiltersContainer.querySelector('[data-platform="all"]');
    if (allFilterBtn) {
        allFilterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            filterGamesByPlatform('all');
        });
    }

    // Initial load: fetch platforms, populate filters, then fetch games
    (async () => {
        await populatePlatformFilters();
        fetchGames();
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
        // Apply current filter
        filterGamesByPlatform(currentPlatformFilter);
    }
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

// Populate platform filter buttons from database
async function populatePlatformFilters() {
    const data = await apiGet('/plugins/database_handler/platforms');
    if (!data) return;
    
    const platformFiltersContainer = document.querySelector('.platform-filters');
    if (!platformFiltersContainer) return;
    
    // Clear existing buttons except "All"
    const existingButtons = platformFiltersContainer.querySelectorAll('.filter-btn');
    existingButtons.forEach(btn => {
        if (btn.getAttribute('data-platform') !== 'all') {
            btn.remove();
        }
    });
    
    // Add buttons for each platform
    const platforms = data.platforms || [];
    platforms.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.setAttribute('data-platform', p.id || p.name);
        btn.textContent = p.name;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            filterGamesByPlatform(p.id || p.name);
        });
        platformFiltersContainer.appendChild(btn);
    });
}

// Filter games by selected platform
function filterGamesByPlatform(platformId) {
    currentPlatformFilter = platformId;
    
    // Update active button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-platform') === platformId);
    });
    
    // Only render games if we're on the Games tab
    if (currentTab !== 'games') return;
    
    // Filter and re-render games
    if (platformId === 'all') {
        renderGames(allGames);
    } else {
        const filtered = allGames.filter(game => {
            // Check if this game has any game_platforms entries for the selected platform
            return allGamePlatforms.some(gp => gp.game_id === game.id && gp.platform_id === platformId);
        });
        renderGames(filtered);
    }
}

// Populate the "Add to Platform" form with available platforms
async function populateAddToPlatformForm() {
    const data = await apiGet('/plugins/database_handler/platforms');
    if (!data) return;
    
    const platformSelect = document.querySelector('#form-add-to-platform select[name="platform_id"]');
    if (!platformSelect) return;
    
    platformSelect.innerHTML = '<option value="">-- Select a platform --</option>';
    const platforms = data.platforms || [];
    platforms.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        platformSelect.appendChild(option);
    });
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
                return `<span class="plat">${format} ${escapeHtml(platform?.name || gp.platform_id)}</span>`;
            })
            .join('');
        
        const tagsHtml = (game.tags || [])
            .map(tag => `<span class="tag">${escapeHtml(tag)}</span>`)
            .join('');
        
        card.innerHTML = `
            <img class="card-cover" src="${game.cover_image_url || '/img/cover_placeholder.svg'}" alt="cover" onerror="this.src='/img/cover_placeholder.svg'">
            <div class="card-body">
                <h3 class="card-title">${escapeHtml(game.name)}</h3>
                <p class="card-desc">${escapeHtml(game.description || '')}</p>
                ${tagsHtml ? `<div class="tags">${tagsHtml}</div>` : ''}
                <div class="platform-icons">${platformsHtml || '<span class="muted">No platforms</span>'}</div>
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
