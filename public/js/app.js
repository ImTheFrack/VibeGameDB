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

    // Wire up simple click handlers that will later open real modals / forms
    btnAddGame.addEventListener('click', () => console.log('Opening Add Game modal...'));
    btnAddPlatform.addEventListener('click', () => console.log('Opening Add Platform modal...'));
    btnImportCSV.addEventListener('click', () => console.log('Opening Import CSV modal...'));

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

    // Initial load: fetch games to populate the UI
    fetchGames();
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
    if (data) renderGames(data);
}

// Fetch list of platforms from the backend plugin
async function fetchPlatforms() {
    const data = await apiGet('/plugins/database_handler/platforms');
    if (data) renderPlatforms(data);
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
        card.innerHTML = `
            <img class="card-cover" src="${game.cover_image_url || 'https://via.placeholder.com/240x135?text=No+Cover'}" alt="cover">
            <div class="card-body">
                <h3 class="card-title">${escapeHtml(game.name)}</h3>
                <p class="card-desc">${escapeHtml(game.description || '')}</p>
                <div class="platform-icons">${(game.platforms||[]).map(p => `<span class="plat">${escapeHtml(p)}</span>`).join('')}</div>
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
            <img class="card-cover" src="${p.icon_url || 'https://via.placeholder.com/120x60?text=Icon'}" alt="icon">
            <div class="card-body">
                <h3 class="card-title">${escapeHtml(p.name)}</h3>
                <p class="card-desc">${escapeHtml(p.type || '')} - ${p.count || 0} games</p>
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
