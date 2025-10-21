'use strict';
/**
 * Application entry module for the SPA.
 *
 * Responsibilities
 * - Bootstraps the UI once the DOM is ready
 * - Ensures the database is seeded (optional helper via seed handler)
 * - Loads runtime config to determine default filter semantics
 * - Preloads platforms (used by multiple views and modals)
 * - Selects the Games tab on first load and shows its controls
 * - Kicks off data loading and initial render via filter pipeline
 *
 * Key modules
 * - state.js: Centralized app state (games, platforms, filters, options)
 * - api.js: Thin wrappers around fetch() for backend plugin endpoints
 * - events.js: Wires DOM event handlers and exposes data loaders
 * - filters.js: Implements filtering logic and triggers rendering
 */
import { state } from './state.js';
import { fetchConfig, checkSeed, seedDb, fetchPlatforms, fetchGames as fetchGamesFromApi } from './api.js';
import { wireDomEvents } from './events.js';
import { applyFilters, updateTabCounts, extractAllTags } from './filters.js';


/**
 * Main bootstrap: runs after DOM content is parsed so elements are queryable.
 * Steps:
 * 1) Wire all DOM event listeners (buttons, forms, modals, tabs)
 * 2) Optionally seed the database if it is empty (development convenience)
 * 3) Load server config (e.g., default platform filter AND/OR)
 * 4) Preload platforms used across UI (filter modal, add-to-platform modal)
 * 5) Ensure the Games tab is active and controls are visible
 * 6) Fetch games, then apply current filters to render the grid
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 1) Wire events first so UI is interactive during data loading
  wireDomEvents();

  // 2) Development convenience: seed database when empty
  try {
    const checkRes = await checkSeed();
    if (checkRes && checkRes.empty) {
      const seedRes = await seedDb();
      if (seedRes.ok) {
        const seedData = await seedRes.json();
        console.log('Database seeded with test data:', seedData);
      }
    }
  } catch (err) {
    console.error('Error checking/seeding database:', err);
  }

  // 3) Load config for platform filter semantics
  try {
    const cfg = await fetchConfig();
    if (cfg && typeof cfg.platform_filter_and !== 'undefined') {
      state.platformFilterAnd = Boolean(cfg.platform_filter_and);
    }
  } catch (err) {
    console.error('Failed to fetch config:', err);
  }

  // 4) Preload platforms (used throughout the UI)
  const platformData = await fetchPlatforms();
  if (platformData) {
    state.allPlatforms = platformData.platforms || [];
  }

  // 5) Ensure Games tab is the active view and controls visible
  const tabs = Array.from(document.querySelectorAll('.tab'));
  state.currentTab = 'games';
  tabs.forEach(tab => {
    tab.classList.remove('active');
    tab.setAttribute('aria-selected', 'false');
  });
  if (tabs[0]) {
    tabs[0].classList.add('active');
    tabs[0].setAttribute('aria-selected', 'true');
  }
  const gamesControls = document.getElementById('games-controls');
  if (gamesControls) gamesControls.style.display = 'flex';

  // 6) Fetch games and trigger initial render via filter pipeline
  const gameData = await fetchGamesFromApi();
  if (gameData) {
    state.allGames = gameData.games || [];
    state.allGamePlatforms = gameData.game_platforms || [];
    extractAllTags(); // This was missing!
  }
  applyFilters();
  updateTabCounts(state.allGames.length);
});
