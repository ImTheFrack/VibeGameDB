'use strict';
/*
    Frontend JavaScript for the Video Game Database SPA shell.
    This file attaches event handlers, provides fetch stubs to backend endpoints,
    and contains rendering functions that will later be replaced with full logic.

    All functions are commented with intent and future extension points.
*/

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
    const formGame = document.getElementById('form-game');
    const formPlatform = document.getElementById('form-platform');
    const platformFiltersContainer = document.querySelector('.platform-filters');

    // State: track current filter and all games
    let currentPlatformFilter = 'all';
    let allGames = [];

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
    [modalGame, modalPlatform, modalImport].forEach(modal => {
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
        await populatePlatformsDropdown();
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
        const platformSelect = formGame.querySelector('select[name="platforms"]');
        const selectedPlatforms = Array.from(platformSelect.selectedOptions).map(opt => opt.value);

        const gameData = {
            name: formData.get('title'),
            description: formData.get('description'),
            cover_image_url: formData.get('cover_image_url'),
            trailer_url: formData.get('trailer_url'),
            platforms: selectedPlatforms
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
            closeModal(modalGame);
            fetchGames();
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
            type: formData.get('type'),
            description: formData.get('description'),
            icon_url: formData.get('icon_url')
        };

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
            await populatePlatformFilters();  // Refresh filter buttons
            fetchPlatforms();
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
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            // TODO: call fetchGames() or fetchPlatforms() depending on target
            if (target === 'games') fetchGames(); else fetchPlatforms();
        });
    });

    // Delegate edit buttons inside the display grid for demo interaction
    displayGrid.addEventListener('click', (e) => {
        const editGame = e.target.closest('.edit-game');
        const editPlatform = e.target.closest('.edit-platform');
        if (editGame) return console.log('Edit game clicked (template)');
        if (editPlatform) return console.log('Edit platform clicked (template)');
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
        // Apply current filter
        filterGamesByPlatform(currentPlatformFilter);
    }
}

// Fetch list of platforms from the backend plugin
async function fetchPlatforms() {
    const data = await apiGet('/plugins/database_handler/platforms');
    if (data) renderPlatforms(data.platforms || []);
}

// Fetch platforms and populate the dropdown in the game form
async function populatePlatformsDropdown() {
    const data = await apiGet('/plugins/database_handler/platforms');
    if (!data) return;
    
    const platformSelect = document.querySelector('select[name="platforms"]');
    if (!platformSelect) return;
    
    platformSelect.innerHTML = '';
    const platforms = data.platforms || [];
    platforms.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id || p.name;
        option.textContent = p.name;
        platformSelect.appendChild(option);
    });
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
    
    // Filter and re-render games
    if (platformId === 'all') {
        renderGames(allGames);
    } else {
        const filtered = allGames.filter(game => {
            const gamePlatforms = game.platforms || [];
            return gamePlatforms.some(p => 
                (typeof p === 'string' ? p : p.id || p.name) === platformId
            );
        });
        renderGames(filtered);
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

        // Build inner HTML using template literals. In production, prefer safer DOM APIs
        const platformsHtml = (game.platforms || [])
            .map(p => `<span class="plat">${escapeHtml(typeof p === 'string' ? p : p.name || p)}</span>`)
            .join('');
        
        card.innerHTML = `
            <img class="card-cover" src="${game.cover_image_url || '/img/cover_placeholder.svg'}" alt="cover" onerror="this.src='/img/cover_placeholder.svg'">
            <div class="card-body">
                <h3 class="card-title">${escapeHtml(game.name)}</h3>
                <p class="card-desc">${escapeHtml(game.description || '')}</p>
                <div class="platform-icons">${platformsHtml}</div>
                <div class="card-actions"><button class="btn btn-sm edit-game" data-id="${game.id}">Edit</button></div>
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
        card.innerHTML = `
            <img class="card-cover" src="${p.icon_url || '/img/icon_placeholder.svg'}" alt="icon" onerror="this.src='/img/icon_placeholder.svg'">
            <div class="card-body">
                <h3 class="card-title">${escapeHtml(p.name)}</h3>
                <p class="card-desc">${escapeHtml(p.type || 'Digital')}</p>
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
