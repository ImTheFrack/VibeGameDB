'use strict';
import { state } from './state.js';
import { normalizeName } from './utils.js';
import { renderGames, renderPagination } from './render.js';

/**
 * Filtering logic and UI updates.
 *
 * This module contains the core filtering function `applyFilters`, helpers
 * to extract filterable data (like tags), and functions to update the UI
 * that displays active filters and item counts.
 */

/**
 * Extracts all unique tags from the `allGames` array and stores them in `state.allTags`.
 */
export function extractAllTags() {
  const allTags = new Set();
  (state.allGames || []).forEach(game => {
    if (game.tags && Array.isArray(game.tags)) {
      game.tags.forEach(tag => allTags.add(tag));
    }
  });
  state.allTags = Array.from(allTags).sort();
}

/**
 * Updates the item counts displayed in the tabs.
 */
export function updateTabCounts() {
  const gamesTab = document.querySelector('.tab[data-tab="games"] .tab-count');
  const platformsTab = document.querySelector('.tab[data-tab="platforms"] .tab-count');
  if (gamesTab) gamesTab.textContent = `(${state.allGames.length})`;
  if (platformsTab) platformsTab.textContent = `(${state.allPlatforms.length})`;
}

/**
 * Updates the text that shows which filters are currently active.
 */
export function updateActiveFiltersDisplay() {
  const el = document.getElementById('active-filters');
  if (!el) return;

  const { keyword, platforms, tags, gameTypes, acquisitionMethods, manufacturers, genres, developers, publishers, esrbRatings, targetAudiences, releaseYearMin, releaseYearMax } = state.currentFilters;
  const parts = [];
  if (keyword) parts.push(`"${keyword}"`);
  if (platforms.length > 0) parts.push(`${platforms.length} platform(s)`);
  if (tags.length > 0) parts.push(`${tags.length} tag(s)`);
  if (gameTypes.length > 0) parts.push(`${gameTypes.length} type(s)`);
  if (acquisitionMethods.length > 0) parts.push(`${acquisitionMethods.length} acq method(s)`);
  if (manufacturers.length > 0) parts.push(`${manufacturers.length} manufacturer(s)`);
  if (genres.length > 0) parts.push(`${genres.length} genre(s)`);
  if (developers.length > 0) parts.push(`${developers.length} dev(s)`);
  if (publishers.length > 0) parts.push(`${publishers.length} pub(s)`);
  if (esrbRatings.length > 0) parts.push(`${esrbRatings.length} rating(s)`);
  if (targetAudiences.length > 0) parts.push(`${targetAudiences.length} audience(s)`);
  if (releaseYearMin || releaseYearMax) parts.push(`Year: ${releaseYearMin || '?'} - ${releaseYearMax || '?'}`);

  const btn = document.getElementById('btn-filter');
  if (parts.length > 0) {
    el.textContent = `Active: ${parts.join(', ')}`;
    if (btn) btn.classList.add('filters-on');
  } else {
    el.textContent = '';
    if (btn) btn.classList.remove('filters-on');
  }
}

/**
 * Applies all current filters and sorting to the game list, then re-renders.
 */
export function applyFilters(isAppending = false) {
  if (state.currentTab !== 'games' && !isAppending) {
    renderGames([]);
    return;
  }

  let filtered = [...state.allGames];
  const { keyword, platforms, tags, platformAnd, gameTypes, acquisitionMethods, manufacturers, genres, developers, publishers, esrbRatings, targetAudiences, releaseYearMin, releaseYearMax } = state.currentFilters;

  if (keyword) {
    const kw = keyword.toLowerCase();
    filtered = filtered.filter(g =>
      (g.name && g.name.toLowerCase().includes(kw)) ||
      (g.description && g.description.toLowerCase().includes(kw)) ||
      (g.tags && g.tags.some(t => t.toLowerCase().includes(kw))) ||
      (g.genre && g.genre.toLowerCase().includes(kw)) ||
      (g.developer && g.developer.toLowerCase().includes(kw)) ||
      (g.publisher && g.publisher.toLowerCase().includes(kw))
    );
  }

  if (platforms.length > 0) {
    const platformSet = new Set(platforms);
    const logicFn = platformAnd ? 'every' : 'some';
    filtered = filtered.filter(game => {
      const gamePlatforms = state.allGamePlatforms.filter(gp => gp.game_id === game.id).map(gp => gp.platform_id);
      // 'some' (OR): is at least one of the game's platforms in the filter set?
      // 'every' (AND): are all of the filter's platforms present in the game's platforms?
      return platformAnd ? Array.from(platformSet).every(pid => gamePlatforms.includes(pid)) : gamePlatforms.some(pid => platformSet.has(pid));
    });
  }

  if (tags.length > 0) {
    const tagSet = new Set(tags);
    filtered = filtered.filter(g => g.tags && g.tags.some(t => tagSet.has(t)));
  }

  if (genres.length > 0) {
    const genreSet = new Set(genres);
    filtered = filtered.filter(g => g.genre && g.genre.split(',').map(i => i.trim().toLowerCase()).some(i => genreSet.has(i)));
  }

  if (manufacturers.length > 0) {
    const manuSet = new Set(manufacturers);
    const platformIdsFromManus = new Set(state.allPlatforms.filter(p => manuSet.has(p.manufacturer)).map(p => p.id));
    filtered = filtered.filter(game => { // A game matches if it's on at least one platform made by the selected manufacturer(s)
      return state.allGamePlatforms.some(gp => gp.game_id === game.id && platformIdsFromManus.has(gp.platform_id));
    });
  }

  // Helper for comma-separated value filters
  const applyCsvFilter = (property, filterSet) => {
    if (filterSet.size > 0) {
      filtered = filtered.filter(g => g[property] && g[property].split(',').map(i => i.trim()).some(i => filterSet.has(i)));
    }
  };

  applyCsvFilter('developer', new Set(developers));
  applyCsvFilter('publisher', new Set(publishers));
  applyCsvFilter('esrb_rating', new Set(esrbRatings));
  applyCsvFilter('target_audience', new Set(targetAudiences));

  if (releaseYearMin) {
    const minYear = parseInt(releaseYearMin, 10);
    if (!isNaN(minYear)) {
      filtered = filtered.filter(g => g.release_year && g.release_year >= minYear);
    }
  }

  if (releaseYearMax) {
    const maxYear = parseInt(releaseYearMax, 10);
    if (!isNaN(maxYear)) {
      filtered = filtered.filter(g => g.release_year && g.release_year <= maxYear);
    }
  }

  // Filter by game type (original, derived, sequel)
  if (gameTypes.length > 0) {
    const typeSet = new Set(gameTypes);
    filtered = filtered.filter(g =>
      (typeSet.has('original') && !g.is_derived_work && !g.is_sequel) ||
      (typeSet.has('derived') && g.is_derived_work) ||
      (typeSet.has('sequel') && g.is_sequel)
    );
  }

  // --- Sorting ---
  const sortSelect = document.getElementById('sort-select-games');
  if (sortSelect) {
    const sortMethod = sortSelect.value;
    // Pre-calculate platform counts if needed for sorting, to avoid recalculating in the loop
    const platformCounts = {};
    if (sortMethod.includes('platform_count')) {
      state.allGamePlatforms.forEach(gp => {
        platformCounts[gp.game_id] = (platformCounts[gp.game_id] || 0) + 1;
      });
    }

    filtered.sort((a, b) => {
      switch (sortMethod) {
        case 'name_desc':
          return normalizeName(b.name).localeCompare(normalizeName(a.name));
        case 'year_asc':
          return (a.release_year || 9999) - (b.release_year || 9999);
        case 'year_desc':
          return (b.release_year || 0) - (a.release_year || 0);
        case 'date_added_asc':
          return new Date(a.created_at) - new Date(b.created_at);
        case 'date_added_desc':
          return new Date(b.created_at) - new Date(a.created_at);
        case 'platform_count_asc':
          return (platformCounts[a.id] || 0) - (platformCounts[b.id] || 0);
        case 'platform_count_desc':
          return (platformCounts[b.id] || 0) - (platformCounts[a.id] || 0);
        case 'name_asc':
        default:
          return normalizeName(a.name).localeCompare(normalizeName(b.name));
      }
    });
  }

  state.filteredGames = filtered;

  // Pagination
  state.pagination.totalPages = Math.ceil(state.filteredGames.length / state.pagination.pageSize);
  if (!isAppending && state.pagination.currentPage > state.pagination.totalPages) {
    state.pagination.currentPage = 1;
  }
  const start = (state.pagination.currentPage - 1) * state.pagination.pageSize;
  const end = start + state.pagination.pageSize;
  const paginatedGames = state.filteredGames.slice(start, end);

  renderGames(paginatedGames);
  renderPagination();
  updateTabCounts();
}