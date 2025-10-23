'use strict';
import { state } from './state.js';
import { renderGames, renderPagination } from './render.js';

/**
 * Filter subsystem.
 *
 * - extractAllTags: builds a unique, sorted tag list from all games
 * - applyFilters: applies keyword/platform/tag filters to games and renders
 * - updateActiveFiltersDisplay: shows an aggregate count of active filters
 */

export function extractAllTags() {
  const tagSet = new Set();
  state.allGames.forEach(game => {
    if (game.tags && Array.isArray(game.tags)) {
      game.tags.forEach(tag => tagSet.add(tag));
    }
  });
  state.allTags = Array.from(tagSet).sort();
}

export function applyFilters() {
  if (state.currentTab !== 'games') return;

  const { currentFilters } = state;
  const sortSelect = document.getElementById('sort-select');
  let filtered = state.allGames;

  // Keyword
  if (currentFilters.keyword) {
    const raw = currentFilters.keyword.trim().toLowerCase();
    if (raw.length > 0) {
      const phraseMatch = raw.match(/^"(.*)"$/);
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
          return words.every(w => hay.includes(w));
        });
      }
    }
  }

  // Platforms
  if (currentFilters.platforms.length > 0) {
    const useAnd = typeof currentFilters.platformAnd !== 'undefined' ? currentFilters.platformAnd : state.platformFilterAnd;
    if (useAnd) {
      filtered = filtered.filter(game => {
        return currentFilters.platforms.every(platformId => {
          return state.allGamePlatforms.some(gp =>
            String(gp.game_id) === String(game.id) && String(gp.platform_id) === String(platformId)
          );
        });
      });
    } else {
      filtered = filtered.filter(game => {
        return currentFilters.platforms.some(platformId => {
          return state.allGamePlatforms.some(gp =>
            String(gp.game_id) === String(game.id) && String(gp.platform_id) === String(platformId)
          );
        });
      });
    }
  }

  // Tags (AND semantics)
  if (currentFilters.tags.length > 0) {
    filtered = filtered.filter(game => {
      const gameTags = game.tags || [];
      return currentFilters.tags.every(tag => gameTags.includes(tag));
    });
  }

  // Sorting
  if (sortSelect) {
    const sortMethod = sortSelect.value;
    const platformCounts = state.allGamePlatforms.reduce((acc, gp) => {
      acc[gp.game_id] = (acc[gp.game_id] || 0) + 1;
      return acc;
    }, {});

    filtered.sort((a, b) => {
      switch (sortMethod) {
        case 'name_desc': return b.name.localeCompare(a.name);
        case 'year_asc': return (a.release_year || 9999) - (b.release_year || 9999);
        case 'year_desc': return (b.release_year || 0) - (a.release_year || 0);
        case 'date_added_asc': return new Date(a.created_at) - new Date(b.created_at);
        case 'date_added_desc': return new Date(b.created_at) - new Date(a.created_at);
        case 'platform_count_asc': return (platformCounts[a.id] || 0) - (platformCounts[b.id] || 0);
        case 'platform_count_desc': return (platformCounts[b.id] || 0) - (platformCounts[a.id] || 0);
        case 'name_asc':
        default: return a.name.localeCompare(b.name);
      }
    });
  }

  state.filteredGames = filtered; // Store all filtered games

  // Update pagination state
  state.pagination.totalPages = Math.ceil(filtered.length / state.pagination.pageSize) || 1;
  if (state.pagination.currentPage > state.pagination.totalPages) {
    state.pagination.currentPage = state.pagination.totalPages;
  }

  // Render the current page of games
  const start = (state.pagination.currentPage - 1) * state.pagination.pageSize;
  const end = start + state.pagination.pageSize;
  renderGames(state.filteredGames.slice(start, end));
  updateTabCounts(filtered.length);
  renderPagination();
}

/**
 * Updates the count display in the 'Games' and 'Platforms' tabs.
 * @param {number} [gamesCount] - The number of games to display. If not provided, it won't be updated.
 */
export function updateTabCounts(gamesCount) {
  const gamesTabCount = document.querySelector('.tab[data-tab="games"] .tab-count');
  if (gamesTabCount && typeof gamesCount !== 'undefined') {
    gamesTabCount.textContent = `(${gamesCount})`;
  }
  const platformsTabCount = document.querySelector('.tab[data-tab="platforms"] .tab-count');
  if (platformsTabCount) platformsTabCount.textContent = `(${state.allPlatforms.length})`;
}

export function updateActiveFiltersDisplay() {
  const activeFiltersEl = document.getElementById('active-filters');
  const btn = document.getElementById('btn-filter');

  let count = 0;
  if (state.currentFilters.keyword) count += 1;
  if (Array.isArray(state.currentFilters.platforms)) count += state.currentFilters.platforms.length;
  if (Array.isArray(state.currentFilters.tags)) count += state.currentFilters.tags.length;

  if (btn) {
    if (count > 0) {
      btn.textContent = `🔍 Filter (${count})`;
      btn.classList.add('filters-on');
    } else {
      btn.textContent = '🔍 Filter';
      btn.classList.remove('filters-on');
    }
  }

  if (activeFiltersEl) activeFiltersEl.textContent = '';
}
