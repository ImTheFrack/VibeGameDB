'use strict';
import { state } from './state.js';
import { apiGet, fetchConfig, checkSeed, seedDb } from './api.js';
import { wireDomEvents, fetchGames, fetchPlatforms, fetchGamePlatforms, populatePlatformFilters } from './events.js';
import { applyFilters } from './filters.js';

// Entry point for the SPA as an ES module

document.addEventListener('DOMContentLoaded', async () => {
  wireDomEvents();

  // Seed database if empty
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

  // Fetch config to learn default platform filter mode
  try {
    const cfg = await fetchConfig();
    if (cfg && typeof cfg.platform_filter_and !== 'undefined') {
      state.platformFilterAnd = Boolean(cfg.platform_filter_and);
    }
  } catch (err) {
    console.error('Failed to fetch config:', err);
  }

  // Load platforms first (used throughout UI)
  const platformData = await apiGet('/plugins/database_handler/platforms');
  if (platformData) {
    state.allPlatforms = platformData.platforms || [];
  }

  // Ensure Games tab is selected visually
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

  // Load games and render
  await fetchGames();
  applyFilters();
});
